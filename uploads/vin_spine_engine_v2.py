// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: buildEventStream
// ===========================================================================

function buildEventStream(salesRows, salesHeaders, serviceRows, serviceHeaders) {
  var events = [];
  var unparseableDates = 0;

  // Sales events
  if (salesRows && salesRows.length) {
    var sVin   = findCol(salesHeaders, ['vin']);
    var sTrade = findCol(salesHeaders, ['trade vin', 'tradevin', 'trade_vin']);
    var sDate  = findCol(salesHeaders, ['purchase date', 'sale date', 'deal date', 'date']);
    var sFirst = findCol(salesHeaders, ['first name', 'firstname', 'fname']);
    var sLast  = findCol(salesHeaders, ['last name', 'lastname', 'lname']);
    var sFull  = findCol(salesHeaders, ['full name', 'fullname', 'customer name', 'name']);
    var sEmail1 = findCol(salesHeaders, ['email', 'email1', 'email 1']);
    var sEmail2 = findCol(salesHeaders, ['email2', 'email 2']);
    var sEmail3 = findCol(salesHeaders, ['email3', 'email 3']);
    var sPhoneC = findCol(salesHeaders, ['phone c clean', 'phonecclean', 'cell phone', 'cell', 'mobile']);
    var sPhoneH = findCol(salesHeaders, ['phone h clean', 'phonehclean', 'home phone', 'home']);
    var sPhoneW = findCol(salesHeaders, ['phone w clean', 'phonewclean', 'work phone', 'work']);
    var sDealType = findCol(salesHeaders, ['deal type', 'dealtype', 'sale type', 'saletype', 'transaction type', 'transactiontype', 'finance type']);
    var hasDealTypeColumn = !!sDealType;
    // Vehicle (purchased) — VINEx is the decoded source-of-truth; fallback to plain Year/Make/Model
    var sVehYear  = findCol(salesHeaders, ['vinex year', 'vinexyear']) || findCol(salesHeaders, ['year']);
    var sVehMake  = findCol(salesHeaders, ['vinex make', 'vinexmake']) || findCol(salesHeaders, ['make']);
    var sVehModel = findCol(salesHeaders, ['vinex model', 'vinexmodel']) || findCol(salesHeaders, ['model']);
    // Vehicle (trade-in) — only Trade1 columns describe the traded vehicle
    var sTradeYear  = findCol(salesHeaders, ['trade1 year', 'tradeyear', 'trade year']);
    var sTradeMake  = findCol(salesHeaders, ['trade1 make', 'trademake', 'trade make']);
    var sTradeModel = findCol(salesHeaders, ['trade1 model', 'trademodel', 'trade model']);

    salesRows.forEach(function(row, idx){
      var vin = sVin ? normLoyaltyVin(row[sVin]) : '';
      if (vin.length !== 17) return;
      var dateRaw = sDate ? row[sDate] : '';
      var date = parseLoyaltyDate(dateRaw);
      if (!date) { unparseableDates++; return; }

      var first = sFirst ? String(row[sFirst]||'').trim() : '';
      var last  = sLast  ? String(row[sLast]||'').trim()  : '';
      if (!first && !last && sFull) {
        var fullName = String(row[sFull]||'').trim();
        var parts = fullName.split(/\s+/);
        if (parts.length >= 2) {
          first = parts[0];
          // Strip common trailing suffixes (JR, SR, II, III, IV) so we don't
          // pick them up as the "last name".
          var rest = parts.slice(1);
          var suffix = /^(jr|sr|ii|iii|iv|jr\.|sr\.)$/i;
          while (rest.length > 1 && suffix.test(rest[rest.length-1])) rest.pop();
          // Last name is the final remaining token — middle names/initials get
          // dropped so "MARGARET B DISKIN" → first=MARGARET, last=DISKIN
          // and "DANIEL EDISON DISKIN" → first=DANIEL, last=DISKIN.
          last = rest[rest.length - 1];
        } else if (parts.length === 1) {
          last = parts[0];
        }
      }

      var emails = [];
      [sEmail1, sEmail2, sEmail3].forEach(function(c){
        if (!c) return;
        var e = normLoyaltyEmail(row[c]);
        if (e && emails.indexOf(e) === -1) emails.push(e);
      });

      // ── DEALER-INTERNAL EXCLUSION ──────────────────────────────────────
      // Skip rows where the "buyer" is actually the dealership itself
      // (internal recon/used-car-management acquisitions, not real customers).
      // Recognized patterns: dealer email domains, dealer name in the Full Name slot.
      var isDealerInternal = false;
      // Email check — any email at @teamtoyotaglenmills.com used for recon/used-car-mgr
      for (var ei = 0; ei < emails.length; ei++) {
        var em = emails[ei].toLowerCase();
        if (em === 'recon@teamtoyotaglenmills.com' ||
            em === 'usedcarmgrs@teamtoyotaglenmills.com' ||
            em.indexOf('recon@') === 0 ||
            em.indexOf('usedcarmgrs@') === 0) {
          isDealerInternal = true; break;
        }
      }
      // Name check — full dealer name in either name slot
      if (!isDealerInternal) {
        var nameCheck = ((last || '') + ' ' + (first || '')).toLowerCase();
        if (nameCheck.indexOf('team toyota of glen mills') !== -1 ||
            nameCheck.indexOf('team toyota glen mills') !== -1) {
          isDealerInternal = true;
        }
      }
      if (isDealerInternal) return; // skip this row entirely — no customer event, no trade event

      var phones = [];
      var phoneC = sPhoneC ? normLoyaltyPhone(row[sPhoneC]) : '';
      var phoneH = sPhoneH ? normLoyaltyPhone(row[sPhoneH]) : '';
      var phoneW = sPhoneW ? normLoyaltyPhone(row[sPhoneW]) : '';
      [phoneC, phoneH, phoneW].forEach(function(p){
        if (p && phones.indexOf(p) === -1) phones.push(p);
      });

      var tradeVin = sTrade ? normLoyaltyVin(row[sTrade]) : '';
      var dealType = sDealType ? String(row[sDealType]||'').trim() : '';

      events.push({
        type: 'sale',
        vin: vin,
        tradeVin: tradeVin.length === 17 ? tradeVin : '',
        dealType: dealType,
        date: date,
        firstName: first,
        lastName: last,
        phones: phones,
        phoneCell: phoneC,
        phoneHome: phoneH,
        phoneWork: phoneW,
        emails: emails,
        vehicleYear:  sVehYear  ? String(row[sVehYear]||'').trim()  : '',
        vehicleMake:  sVehMake  ? String(row[sVehMake]||'').trim()  : '',
        vehicleModel: sVehModel ? String(row[sVehModel]||'').trim() : '',
        _srcRow: idx
      });

      if (tradeVin.length === 17) {
        events.push({
          type: 'trade-out',
          vin: tradeVin,
          tradeBuyerVin: vin,
          date: date,
          firstName: first,
          lastName: last,
          phones: phones,
          emails: emails,
          // The traded vehicle's year/make/model live in Trade1 columns
          vehicleYear:  sTradeYear  ? String(row[sTradeYear]||'').trim()  : '',
          vehicleMake:  sTradeMake  ? String(row[sTradeMake]||'').trim()  : '',
          vehicleModel: sTradeModel ? String(row[sTradeModel]||'').trim() : '',
          _srcRow: idx
        });
      }
    });
  }

  // Service events
  if (serviceRows && serviceRows.length) {
    var svVin   = findCol(serviceHeaders, ['vin']);
    var svDate  = findCol(serviceHeaders, ['dt close converted', 'dtcloseconverted', 'close date', 'service date', 'date']);
    var svFirst = findCol(serviceHeaders, ['first name', 'firstname', 'fname']);
    var svLast  = findCol(serviceHeaders, ['last name', 'lastname', 'lname']);
    var svEmail1 = findCol(serviceHeaders, ['email1', 'email 1', 'email']);
    var svEmail2 = findCol(serviceHeaders, ['email2', 'email 2']);
    var svEmail3 = findCol(serviceHeaders, ['email3', 'email 3']);
    var svPhoneC = findCol(serviceHeaders, ['phone c clean', 'phonecclean', 'cell phone', 'cell']);
    var svPhoneH = findCol(serviceHeaders, ['phone h clean', 'phonehclean', 'home phone', 'home']);
    var svPhoneW = findCol(serviceHeaders, ['phone w clean', 'phonewclean', 'work phone', 'work']);
    var svVehYear  = findCol(serviceHeaders, ['vinex year', 'vinexyear']) || findCol(serviceHeaders, ['year']);
    var svVehMake  = findCol(serviceHeaders, ['vinex make', 'vinexmake']) || findCol(serviceHeaders, ['make']);
    var svVehModel = findCol(serviceHeaders, ['vinex model', 'vinexmodel']) || findCol(serviceHeaders, ['model']);

    serviceRows.forEach(function(row, idx){
      var vin = svVin ? normLoyaltyVin(row[svVin]) : '';
      if (vin.length !== 17) return;
      var dateRaw = svDate ? row[svDate] : '';
      var date = parseLoyaltyDate(dateRaw);
      if (!date) { unparseableDates++; return; }

      var emails = [];
      [svEmail1, svEmail2, svEmail3].forEach(function(c){
        if (!c) return;
        var e = normLoyaltyEmail(row[c]);
        if (e && emails.indexOf(e) === -1) emails.push(e);
      });

      var phones = [];
      var svPC = svPhoneC ? normLoyaltyPhone(row[svPhoneC]) : '';
      var svPH = svPhoneH ? normLoyaltyPhone(row[svPhoneH]) : '';
      var svPW = svPhoneW ? normLoyaltyPhone(row[svPhoneW]) : '';
      [svPC, svPH, svPW].forEach(function(p){
        if (p && phones.indexOf(p) === -1) phones.push(p);
      });

      var svFirstName = svFirst ? String(row[svFirst]||'').trim() : '';
      var svLastName  = svLast  ? String(row[svLast]||'').trim()  : '';

      // ── DEALER-INTERNAL ATTRIBUTION STRIP ──────────────────────────────
      // Recon department tickets carry dealer recon@ email and the dealer's
      // name in Last Name. Don't drop the event (preserves VIN timeline),
      // but strip the customer attribution so the segment builder treats it
      // as anonymous dealer-prep and skips creating a customer relationship.
      var isInternalService = false;
      for (var ej = 0; ej < emails.length; ej++) {
        var emj = emails[ej].toLowerCase();
        if (emj === 'recon@teamtoyotaglenmills.com' ||
            emj === 'usedcarmgrs@teamtoyotaglenmills.com' ||
            emj.indexOf('recon@') === 0 ||
            emj.indexOf('usedcarmgrs@') === 0) {
          isInternalService = true; break;
        }
      }
      if (!isInternalService) {
        var svNameCheck = (svLastName + ' ' + svFirstName).toLowerCase();
        if (svNameCheck.indexOf('team toyota of glen mills') !== -1 ||
            svNameCheck.indexOf('team toyota glen mills') !== -1) {
          isInternalService = true;
        }
      }
      if (isInternalService) {
        svFirstName = '';
        svLastName  = '';
        emails = [];
        phones = [];
        svPC = ''; svPH = ''; svPW = '';
      }

      events.push({
        type: 'service',
        vin: vin,
        date: date,
        firstName: svFirstName,
        lastName:  svLastName,
        phones: phones,
        phoneCell: svPC,
        phoneHome: svPH,
        phoneWork: svPW,
        emails: emails,
        vehicleYear:  svVehYear  ? String(row[svVehYear]||'').trim()  : '',
        vehicleMake:  svVehMake  ? String(row[svVehMake]||'').trim()  : '',
        vehicleModel: svVehModel ? String(row[svVehModel]||'').trim() : '',
        _srcRow: idx
      });
    });
  }

  // Sort everything globally by date
  events.sort(function(a, b){ return a.date - b.date; });

  return { events: events, unparseableDates: unparseableDates, hasDealTypeColumn: !!hasDealTypeColumn };
}

// ── Split a VIN's event timeline into ownership segments ────────────────────
// A segment runs from one sale event to the next trade-out (or end of timeline).
// Service events in between belong to whichever sale event preceded them.

