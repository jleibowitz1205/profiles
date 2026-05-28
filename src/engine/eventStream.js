// ===========================================================================
//  PROFILES — Engine module: event stream builder
//
//  Source: ported from the Python reference implementation
//  (uploads/vin_spine_engine_v2.py) plus the column conventions documented
//  in ARCHITECTURE.md. Matches what the Apps Script v2 engine consumes.
//
//  Input:  sales rows (header-mapped objects OR header+row arrays)
//          service rows (same shape)
//  Output: { events, unparseableDates, hasDealTypeColumn }
//
//  Events are flat records keyed by VIN. Sales rows with a Trade Vin spawn
//  a synthetic trade-out event on the TRADED VIN, with tradeBuyerVin pointing
//  at the new car being purchased. This is what feeds the trade-link rule.
//
//  Port note: lift directly to src/engine/eventStream.ts. Replace with the
//  Apps Script verbatim once the DMS column-mapping work is done.
// ===========================================================================

function buildEventStream(salesRows, salesHeaders, serviceRows, serviceHeaders) {
  var events = [];
  var unparseableDates = { sales: 0, service: 0 };
  var hasDealTypeColumn = false;

  // ── Sales ────────────────────────────────────────────────────────────────
  if (salesRows && salesRows.length) {
    // Sales rows can arrive as objects (from PapaParse {header:true}) or as
    // arrays (raw 2D). Normalize to object form before processing.
    var sales = _objectizeRows(salesRows, salesHeaders);
    var firstRow = sales[0] || {};

    hasDealTypeColumn = Object.keys(firstRow).some(function(k) {
      return /^deal ?type$/i.test(k);
    });

    sales.forEach(function(row, idx) {
      var vin = normLoyaltyVin(row['Vin'] || row['VIN']);
      if (!vin) return;

      var date = parseLoyaltyDate(row['Purchase Date'] || row['Sale Date']);
      if (!date) { unparseableDates.sales++; return; }

      var full = String(row['Full Name'] || '').trim();
      var parsed = parseFullName(full);

      var email = normLoyaltyEmail(row['Email'] || row['Email Address'] || '');
      var emails = email && !isJunkEmail(email) ? [email] : [];

      var phoneCell = normLoyaltyPhone(row['Phone C Clean'] || row['Cell Phone Number']);
      var phoneHome = normLoyaltyPhone(row['Phone H Clean'] || row['Home Phone Number']);
      var phoneWork = normLoyaltyPhone(row['Phone W Clean'] || row['Work Phone Number']);
      var phones = [phoneCell, phoneHome, phoneWork]
        .filter(function(p) { return p && !isJunkPhone(p); });

      // Dealer-internal sales rows are dropped entirely (no customer record).
      if (isDealerInternal(full, emails)) return;

      var dealType = (row['Deal Type'] || row['DealType'] || '').toString();

      events.push({
        type: 'sale',
        vin: vin,
        date: date,
        firstName: parsed.first,
        lastName:  parsed.last,
        phones: phones,
        emails: emails,
        phoneCell: phoneCell,
        phoneHome: phoneHome,
        phoneWork: phoneWork,
        vehicleYear:  String(row['Vinex Year']  || row['Year']  || '').trim(),
        vehicleMake:  String(row['Vinex Make']  || row['Make']  || '').trim(),
        vehicleModel: String(row['Vinex Model'] || row['Model'] || '').trim(),
        dealType: dealType,
        _srcRow: idx
      });

      // Trade-in spawns a trade-out event on the TRADED vehicle.
      var tradeVin = normLoyaltyVin(row['Trade Vin'] || row['Trade VIN']);
      if (tradeVin) {
        events.push({
          type: 'trade-out',
          vin: tradeVin,                  // event lives on the OLD car's timeline
          date: date,
          firstName: parsed.first,
          lastName:  parsed.last,
          phones: phones,
          emails: emails,
          tradeBuyerVin: vin,             // pointer back to the NEW car (used by trade-link rule)
          _srcRow: idx
        });
      }
    });
  }

  // ── Service ──────────────────────────────────────────────────────────────
  if (serviceRows && serviceRows.length) {
    var services = _objectizeRows(serviceRows, serviceHeaders);
    services.forEach(function(row, idx) {
      var vin = normLoyaltyVin(row['Vin'] || row['VIN']);
      if (!vin) return;

      var date = parseLoyaltyDate(row['Dt Close Converted'] || row['Service Date'] || row['Close Date']);
      if (!date) { unparseableDates.service++; return; }

      var first = String(row['First Name'] || '').trim();
      var last  = String(row['Last Name']  || '').trim();

      var email = normLoyaltyEmail(row['Email 1'] || row['Email'] || '');
      var emails = email && !isJunkEmail(email) ? [email] : [];

      var phoneCell = normLoyaltyPhone(row['Phone C Clean'] || row['Cell Phone Number']);
      var phoneHome = normLoyaltyPhone(row['Phone H Clean'] || row['Home Phone Number']);
      var phoneWork = normLoyaltyPhone(row['Phone W Clean'] || row['Work Phone Number']);
      var phones = [phoneCell, phoneHome, phoneWork]
        .filter(function(p) { return p && !isJunkPhone(p); });

      // Dealer-internal service rows: KEEP the event (so the VIN timeline is
      // complete) but strip the PII. The segment builder will treat them as
      // dealer-custody activity.
      var displayName = (last + ' ' + first).trim();
      if (isDealerInternal(displayName, emails)) {
        first = ''; last = ''; phones = []; emails = []; phoneCell = ''; phoneHome = ''; phoneWork = '';
      }

      events.push({
        type: 'service',
        vin: vin,
        date: date,
        firstName: first,
        lastName:  last,
        phones: phones,
        emails: emails,
        phoneCell: phoneCell,
        phoneHome: phoneHome,
        phoneWork: phoneWork,
        vehicleYear:  String(row['Vinex Year']  || row['Year']  || '').trim(),
        vehicleMake:  String(row['Vinex Make']  || row['Make']  || '').trim(),
        vehicleModel: String(row['Vinex Model'] || row['Model'] || '').trim(),
        _srcRow: idx
      });
    });
  }

  return { events: events, unparseableDates: unparseableDates, hasDealTypeColumn: hasDealTypeColumn };
}

// ── Helper: accept either object-rows or [header, row[]] and normalize ─────
function _objectizeRows(rows, headers) {
  if (!rows || !rows.length) return [];
  // If first row is already an object (PapaParse {header:true}), pass through
  if (rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    return rows;
  }
  if (!headers || !headers.length) return [];
  return rows.map(function(arr) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = arr[i]; });
    return obj;
  });
}
