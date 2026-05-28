// ===========================================================================
//  PROFILES — CSV column schema (STRICT for demo)
//
//  Per the requirements: strict column names now, with a TODO marker for the
//  engineering team to add a flexible "column mapping" UI later.
//
//  TODO (engineering team):
//    - Build a column-mapping screen that runs AFTER upload and BEFORE engine
//    - User picks: "which column in your CSV is First Name? Email? VIN?"
//    - Persist the mapping per dealer / per DMS source
//    - Map at ingest time, store the canonical schema in the database
//    - Until then, the demo expects exactly these column names.
// ===========================================================================

var CSV_SCHEMA = {
  sales: {
    required: ['Vin', 'Purchase Date', 'Full Name'],
    optional: ['Trade Vin', 'Email', 'Phone C Clean', 'Phone H Clean', 'Phone W Clean',
               'Vinex Year', 'Vinex Make', 'Vinex Model', 'Deal Type'],
    signature: ['Trade Vin', 'Purchase Date']   // headers that identify a file as sales
  },
  service: {
    required: ['Vin', 'Dt Close Converted'],
    optional: ['First Name', 'Last Name', 'Email 1', 'Phone C Clean', 'Phone H Clean', 'Phone W Clean',
               'Vinex Year', 'Vinex Make', 'Vinex Model'],
    signature: ['Dt Close Converted']
  }
};

function detectCsvType(headers) {
  var lower = (headers || []).map(function(h) { return String(h).toLowerCase().replace(/\s+/g, ''); });
  var saleSig    = CSV_SCHEMA.sales.signature.some(function(s)   { return lower.indexOf(s.toLowerCase().replace(/\s+/g, '')) !== -1; });
  var serviceSig = CSV_SCHEMA.service.signature.some(function(s) { return lower.indexOf(s.toLowerCase().replace(/\s+/g, '')) !== -1; });
  if (serviceSig && !saleSig) return 'service';
  if (saleSig) return 'sales';
  return 'unknown';
}

function validateSchema(headers, type) {
  var spec = CSV_SCHEMA[type];
  if (!spec) return { ok: false, missing: ['<unknown file type>'] };
  var lower = (headers || []).map(function(h) { return String(h).toLowerCase().replace(/\s+/g, ''); });
  var missing = spec.required.filter(function(r) {
    return lower.indexOf(r.toLowerCase().replace(/\s+/g, '')) === -1;
  });
  return { ok: missing.length === 0, missing: missing };
}
