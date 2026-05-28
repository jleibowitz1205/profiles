// ===========================================================================
//  PROFILES — UI: CSV upload flow
//  Uses PapaParse (loaded in index.html). Strict column validation per
//  csvSchema.js. Auto-detects sales vs service by header signature.
// ===========================================================================

var UploadFlow = (function() {
  function handle(files, done) {
    var loaded = { salesRows: null, salesHeaders: null, serviceRows: null, serviceHeaders: null };
    var pending = files.length;
    var errors = [];

    files.forEach(function(file) {
      // PapaParse — header-based parsing produces objects
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
          var headers = results.meta.fields || [];
          var type = detectCsvType(headers);
          if (type === 'unknown') {
            errors.push(file.name + ': could not detect file type (need sales or service headers)');
            done();
          } else {
            var validation = validateSchema(headers, type);
            if (!validation.ok) {
              errors.push(file.name + ': missing required columns: ' + validation.missing.join(', '));
            } else if (type === 'sales' && !loaded.salesRows) {
              loaded.salesRows = results.data;
              loaded.salesHeaders = headers;
            } else if (type === 'service' && !loaded.serviceRows) {
              loaded.serviceRows = results.data;
              loaded.serviceHeaders = headers;
            } else {
              errors.push(file.name + ': second ' + type + ' file ignored (one of each max)');
            }
          }
          pending--;
          if (pending === 0) finish();
        },
        error: function(err) {
          errors.push(file.name + ': parse error — ' + err.message);
          pending--;
          if (pending === 0) finish();
        }
      });
    });

    function finish() {
      if (errors.length) {
        errors.forEach(function(e) { notify(e, 'error'); });
      }
      if (!loaded.salesRows && !loaded.serviceRows) {
        done(null);
        return;
      }
      notify('Parsed ' + (loaded.salesRows ? loaded.salesRows.length + ' sales rows ' : '') +
             (loaded.salesRows && loaded.serviceRows ? '+ ' : '') +
             (loaded.serviceRows ? loaded.serviceRows.length + ' service rows' : ''), 'info');
      done(loaded);
    }
  }

  return { handle: handle };
})();
