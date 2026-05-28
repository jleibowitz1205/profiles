// ===========================================================================
//  PROFILES — Engine module: anomaly aggregation
//  Source: NEW — per ANOMALY_QUEUE_SPEC.md
//
//  Collects engine-flagged data quality concerns into a queryable queue.
//  Pulls from:
//    - segment-builder flags (cross_household_trade, anomalous_inter_owner_service)
//      [stashed on window._loyaltyAnomalies by buildVinSegments]
//    - customer-level rollups (possible_duplicate, high_volume_customer,
//      phone_drift, email_drift, service_gap)
//
//  Port note: lift to src/anomalies/queue.ts. Backend should persist these
//  in the customer_history table with status/resolution metadata.
// ===========================================================================

function collectAnomalies(result) {
  var anomalies = [];
  var seq = 0;

  function add(a) {
    a.id = 'A' + String(++seq).padStart(5, '0');
    a.status = a.status || 'open';
    anomalies.push(a);
  }

  // Pull engine-emitted anomalies (cross-household trades, inter-owner services)
  var engineAnomalies = (typeof window !== 'undefined' && window._loyaltyAnomalies) || [];
  engineAnomalies.forEach(function(a) {
    add({
      type: a.type,
      vin: a.vin,
      vins: [a.vin],
      customerKeys: [],
      detectedAt: a.date,
      detail: a.detail,
      context: { priorOwner: a.priorOwner, trader: a.trader, attribution: a.attribution }
    });
  });

  // Customer-level rollups
  (result.customers || []).forEach(function(c) {
    if (c.mergeConfidence === 'Possible Duplicate') {
      add({
        type: 'possible_duplicate',
        vin: '',
        vins: [].concat(c.currentlyOwns || [], c.previouslyOwned || []),
        customerKeys: [c.customerKey],
        detectedAt: c.lastActivityDate || new Date(),
        detail: 'Linked by PII across non-overlapping VINs — verify before merging',
        context: { phones: c.phones, emails: c.emails }
      });
    }
    if (c.numSales > 20 || c.numServices > 100) {
      add({
        type: 'high_volume_customer',
        vin: '',
        vins: c.currentlyOwns || [],
        customerKeys: [c.customerKey],
        detectedAt: c.lastActivityDate || new Date(),
        detail: 'Sales=' + c.numSales + ', Services=' + c.numServices +
                ' — likely commercial account or unflagged business',
        context: { numSales: c.numSales, numServices: c.numServices }
      });
    }
    if (c.hasPhoneDrift) {
      add({
        type: 'phone_drift',
        vin: (c.currentlyOwns || [])[0] || '',
        vins: c.currentlyOwns || [],
        customerKeys: [c.customerKey],
        detectedAt: c.lastActivityDate || new Date(),
        detail: 'Phone(s) on recent service tickets differ from sale-time phone',
        context: { saleTime: c.mostRecentSalePhones, drifted: c.driftedPhones }
      });
    }
    if (c.hasEmailDrift) {
      add({
        type: 'email_drift',
        vin: (c.currentlyOwns || [])[0] || '',
        vins: c.currentlyOwns || [],
        customerKeys: [c.customerKey],
        detectedAt: c.lastActivityDate || new Date(),
        detail: 'Email(s) on recent service tickets differ from sale-time email',
        context: { saleTime: c.mostRecentSaleEmails, drifted: c.driftedEmails }
      });
    }
    // Service gap anomaly per affected VIN
    (c.lostFromNetwork || []).forEach(function(vin) {
      var v = (c.lostVehicles || []).find(function(x) { return x.vin === vin; }) || {};
      add({
        type: 'service_gap',
        vin: vin,
        vins: [vin],
        customerKeys: [c.customerKey],
        detectedAt: v.lastServiceDate || c.lastActivityDate || new Date(),
        detail: 'Vehicle bought here, no trade-back, no service activity in 18+ months — likely defected',
        context: { vehicle: v.label, saleDate: v.saleDate, lastService: v.lastServiceDate }
      });
    });
  });

  return anomalies;
}

// Anomaly type metadata for UI rendering
var ANOMALY_TYPES = {
  cross_household_trade:        { label: 'Cross-household trade',        color: '#2563EB', bg: '#DBEAFE', tone: 'info' },
  anomalous_inter_owner_service:{ label: 'Inter-owner service',          color: '#DC2626', bg: '#FEE2E2', tone: 'danger' },
  possible_duplicate:           { label: 'Possible duplicate',           color: '#CA8A04', bg: '#FEF9C3', tone: 'warn' },
  high_volume_customer:         { label: 'High-volume customer',         color: '#7C2D12', bg: '#FED7AA', tone: 'warn' },
  phone_drift:                  { label: 'Phone drift',                  color: '#0E7490', bg: '#CFFAFE', tone: 'info' },
  email_drift:                  { label: 'Email drift',                  color: '#0E7490', bg: '#CFFAFE', tone: 'info' },
  service_gap:                  { label: 'Service gap',                  color: '#9F1239', bg: '#FFE4E6', tone: 'danger' }
};
