// ===========================================================================
//  PROFILES — Synthetic sample dataset
//
//  Hand-crafted to exercise every engine rule, bucket, and anomaly type.
//  No real customer data — names, phones, emails, VINs are all fabricated.
//
//  Scenarios bundled (mirrors ENGINE_VALIDATION_SCENARIOS.md):
//
//   • Pemberton "household" (4 separate people sharing surname / shared phone)
//        - Daniel: 4 sales, trade chain — Home-grown Repeat, Active
//        - Margaret: 1 sale, shares home phone with Daniel → possible_duplicate
//        - Emily: 1 sale, daughter, separate PII
//        - Diana: 1 sale, unrelated 4th Pemberton
//   • 2022 Truck ownership chain — Daniel sells → dealer prep → Victor buys
//        - Tests trade-delimiting, post-trade dealer-custody skip, postTradeOwner
//   • Cross-household trade — Daniel trades in Margaret's Sienna (anomaly)
//   • Inter-owner service — Rachel Kim services Daniel's traded truck (anomaly)
//   • Adopted customer — Marcus Tate services a 2018 Highlander, never bought
//   • Phone drift — Sara Lin's service tickets use a different phone than sale
//   • Likely lease — Aaron Cole's RAV4 + replacement, gap matches lease pattern
//   • Confirmed lease — Tom Phelps row has Deal Type = "Lease"
//   • Stopped servicing — Karen Doyle bought 2020, last service mid-2023
//   • High volume — Apex Logistics LLC fleet account (>20 sales)
//   • Loaner detection — VIN with 30 services, never sold = internal
//   • Dealer-internal records — recon@ and "Dealership Account" rows stripped
//   • Bucket spread — events placed to land customers in every bucket
//
//  All dates are relative to today, so the demo always shows fresh data.
// ===========================================================================

var SAMPLE_DATA = (function() {
  var now = new Date();
  function daysAgo(n) {
    var d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(10 + (n % 8), (n * 7) % 60);
    return d.toISOString().slice(0, 10) + ' ' + (10 + (n % 8)) + ':' + String((n*7)%60).padStart(2,'0');
  }
  function isoDate(n) {
    var d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  // ── VINs (all fake, all 17 chars) ───────────────────────────────────────
  var VIN = {
    DAN_TRUCK22:  'DAN22TRUCK0000001',
    DAN_CAMRY23:  'DAN23CAMRY0000001',
    DAN_TRUCK25:  'DAN25TRUCK0000001',
    DAN_BZ4X24:   'DAN24BZ4XX0000001',
    DAN_TRUCK13:  'DAN13TRUCK0000001',
    MAR_SIENNA15: 'MAR15SIENNA000001',
    MAR_SIENNA23: 'MAR23SIENNA000001',
    EMI_CROSS22:  'EMI22CCROS0000001',
    EMI_CROSS24:  'EMI24CCROSH000001',
    DIA_CAMRY22:  'DIA22CAMRY0000001',
    SAR_CAMRY22:  'SAR22CAMRY0000001',
    TOM_4RUN23:   'TOM234RUNNER00001',
    AAR_RAV21:    'AAR21RAV400000001',
    AAR_RAV25:    'AAR25RAV400000001',
    KAR_CAMRY20:  'KAR20CAMRY0000001',
    MAR_HL18:     'MAR18HIGHLAND0001',
    LIU_PRIUS19:  'LIU19PRIUSX000001',
    LIU_HIGH24:   'LIU24HIGHLAND0001',
    LOAN_RAV:     'LOANER00000RAV001',
    LOAN_CAM:     'LOANER000000CAM01'
  };

  // Fleet VINs for Apex Logistics
  var APEX_VINS = [];
  for (var i = 0; i < 24; i++) APEX_VINS.push('APEX0000FLEET' + String(i).padStart(4, '0'));

  // ── Phones ──────────────────────────────────────────────────────────────
  var PHONE = {
    DAN_CELL:  '6109960910',
    DAN_HOME:  '6106962387',  // shared with Margaret → possible_duplicate
    DAN_WORK:  '6105586800',
    MAR_CELL:  '6109997601',
    MAR_HOME:  '6106962387',  // same as Daniel's home
    EMI_CELL:  '6103167343',
    DIA_CELL:  '6109057322',
    LIU_CELL:  '7323051234',
    MARCUS_CELL: '2153305544',
    SAR_CELL_OLD: '4844441234',
    SAR_CELL_NEW: '4843305678',  // drift
    AAR_CELL:  '6107771234',
    KAR_CELL:  '4843049988',
    TOM_CELL:  '6103366677',
    RACH_CELL: '7173052211',
    APEX_LINE: '8005551111',     // junk pattern (555) — will be filtered
    APEX_FLEET:'9085557777'      // junk (555) — will be filtered, leaving names to cluster
  };

  // ── Sales rows ──────────────────────────────────────────────────────────
  var sales = [];

  function s(row) { sales.push(row); }

  // — Daniel Pemberton, 4 sales —
  s({ 'Vin': VIN.DAN_TRUCK22, 'Trade Vin': VIN.DAN_TRUCK13, 'Purchase Date': isoDate(1340),
      'Full Name': 'DANIEL E PEMBERTON', 'Email': 'danpemberton@outlook.com',
      'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
      'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra', 'Deal Type': 'Retail' });
  s({ 'Vin': VIN.DAN_CAMRY23, 'Trade Vin': VIN.MAR_SIENNA15, 'Purchase Date': isoDate(1148),
      'Full Name': 'DANIEL E PEMBERTON', 'Email': 'danpemberton@outlook.com',
      'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
      'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry', 'Deal Type': 'Retail' });
  s({ 'Vin': VIN.DAN_TRUCK25, 'Trade Vin': VIN.DAN_TRUCK22, 'Purchase Date': isoDate(568),
      'Full Name': 'DANIEL E PEMBERTON', 'Email': 'danpemberton@outlook.com',
      'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
      'Vinex Year': '2025', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra', 'Deal Type': 'Retail' });
  s({ 'Vin': VIN.DAN_BZ4X24, 'Trade Vin': '', 'Purchase Date': isoDate(461),
      'Full Name': 'DANIEL E PEMBERTON', 'Email': 'danpemberton@outlook.com',
      'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
      'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'BZ4X', 'Deal Type': 'Retail' });

  // — Margaret Pemberton, 1 sale —
  s({ 'Vin': VIN.MAR_SIENNA23, 'Trade Vin': '', 'Purchase Date': isoDate(1113),
      'Full Name': 'MARGARET B PEMBERTON', 'Email': 'mbpem@yahoo.com',
      'Phone C Clean': PHONE.MAR_CELL, 'Phone H Clean': PHONE.MAR_HOME, 'Phone W Clean': '',
      'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna', 'Deal Type': 'Retail' });

  // — Emily Pemberton, 1 sale —
  s({ 'Vin': VIN.EMI_CROSS24, 'Trade Vin': VIN.EMI_CROSS22, 'Purchase Date': isoDate(580),
      'Full Name': 'EMILY G PEMBERTON', 'Email': 'emilypem@gmail.com',
      'Phone C Clean': PHONE.EMI_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'Corolla Cross Hybrid', 'Deal Type': 'Retail' });

  // — Diana Pemberton, 1 sale, unrelated 4th Pemberton —
  s({ 'Vin': VIN.DIA_CAMRY22, 'Trade Vin': '', 'Purchase Date': isoDate(1340),
      'Full Name': 'DIANA L PEMBERTON', 'Email': 'olds56conv@aol.com',
      'Phone C Clean': PHONE.DIA_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry', 'Deal Type': 'Retail' });

  // — Victor Rivers, buys DAN's 2022 Truck after Daniel trades it (post-trade owner) —
  s({ 'Vin': VIN.DAN_TRUCK22, 'Trade Vin': '', 'Purchase Date': isoDate(476),
      'Full Name': 'VICTOR T RIVERS', 'Email': 'vrivers@gmail.com',
      'Phone C Clean': '4843301177', 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra', 'Deal Type': 'Retail' });

  // — Sara Lin, will drift phones in service —
  s({ 'Vin': VIN.SAR_CAMRY22, 'Trade Vin': '', 'Purchase Date': isoDate(1280),
      'Full Name': 'SARA J LIN', 'Email': 'sara.lin@gmail.com',
      'Phone C Clean': PHONE.SAR_CELL_OLD, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry', 'Deal Type': 'Retail' });

  // — Tom Phelps, CONFIRMED lease —
  s({ 'Vin': VIN.TOM_4RUN23, 'Trade Vin': '', 'Purchase Date': isoDate(1095),
      'Full Name': 'TOM W PHELPS', 'Email': 'tphelps@aol.com',
      'Phone C Clean': PHONE.TOM_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': '4Runner', 'Deal Type': 'Lease' });

  // — Aaron Cole, LIKELY lease pattern (2021 then 2024 replacement, gap ~41 months) —
  s({ 'Vin': VIN.AAR_RAV21, 'Trade Vin': '', 'Purchase Date': isoDate(1880),
      'Full Name': 'AARON M COLE', 'Email': 'acole@verizon.net',
      'Phone C Clean': PHONE.AAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2021', 'Vinex Make': 'Toyota', 'Vinex Model': 'RAV4', 'Deal Type': 'Lease' });
  s({ 'Vin': VIN.AAR_RAV25, 'Trade Vin': '', 'Purchase Date': isoDate(640),
      'Full Name': 'AARON M COLE', 'Email': 'acole@verizon.net',
      'Phone C Clean': PHONE.AAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2025', 'Vinex Make': 'Toyota', 'Vinex Model': 'RAV4', 'Deal Type': 'Lease' });

  // — Karen Doyle, STOPPED SERVICING (bought 2020, last service mid-2023) —
  s({ 'Vin': VIN.KAR_CAMRY20, 'Trade Vin': '', 'Purchase Date': isoDate(2100),
      'Full Name': 'KAREN E DOYLE', 'Email': 'kdoyle@comcast.net',
      'Phone C Clean': PHONE.KAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2020', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry', 'Deal Type': 'Retail' });

  // — Liu Chen, CROSS-HOUSEHOLD TRADE — trades in his partner Maya's Prius —
  s({ 'Vin': VIN.LIU_HIGH24, 'Trade Vin': VIN.LIU_PRIUS19, 'Purchase Date': isoDate(750),
      'Full Name': 'LIU H CHEN', 'Email': 'liu.chen@outlook.com',
      'Phone C Clean': PHONE.LIU_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'Highlander', 'Deal Type': 'Retail' });

  // — Dealer-internal sale row — should be dropped entirely —
  s({ 'Vin': 'DEALER00000000001', 'Trade Vin': '', 'Purchase Date': isoDate(900),
      'Full Name': 'DEALERSHIP ACCOUNT', 'Email': 'usedcarmgrs@dealership.com',
      'Phone C Clean': '', 'Phone H Clean': '', 'Phone W Clean': '',
      'Vinex Year': '2021', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry', 'Deal Type': 'Wholesale' });

  // — Apex Logistics LLC, high-volume commercial (24 fleet sales) —
  APEX_VINS.forEach(function(v, i) {
    s({ 'Vin': v, 'Trade Vin': '', 'Purchase Date': isoDate(1500 - i * 30),
        'Full Name': 'APEX LOGISTICS LLC', 'Email': 'fleet@apexlogistics.example',
        'Phone C Clean': '6105550100', 'Phone H Clean': '', 'Phone W Clean': '6105550101',
        'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna', 'Deal Type': 'Commercial' });
  });

  // ── Service rows ────────────────────────────────────────────────────────
  var service = [];
  function sv(row) { service.push(row); }

  // Daniel — services across all his vehicles
  // 2022 Truck — sold to Daniel, then post-trade chain
  [1200, 1050, 900, 720, 600].forEach(function(d) {
    sv({ 'Vin': VIN.DAN_TRUCK22, 'Dt Close Converted': isoDate(d),
         'First Name': 'DANIEL', 'Last Name': 'PEMBERTON', 'Email 1': 'danpemberton@outlook.com',
         'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  });
  // POST-TRADE FOLLOW-UP — Daniel brings traded truck back for one more service (day 470)
  sv({ 'Vin': VIN.DAN_TRUCK22, 'Dt Close Converted': isoDate(470),
       'First Name': 'DANIEL', 'Last Name': 'PEMBERTON', 'Email 1': 'danpemberton@outlook.com',
       'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
       'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  // PRE-SALE DEALER PREP — no name (day 478)
  sv({ 'Vin': VIN.DAN_TRUCK22, 'Dt Close Converted': isoDate(478),
       'First Name': '', 'Last Name': '', 'Email 1': '',
       'Phone C Clean': '', 'Phone H Clean': '', 'Phone W Clean': '',
       'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  // INTER-OWNER SERVICE ANOMALY — Rachel Kim services the truck post-trade (day 465)
  sv({ 'Vin': VIN.DAN_TRUCK22, 'Dt Close Converted': isoDate(465),
       'First Name': 'RACHEL', 'Last Name': 'KIM', 'Email 1': 'rkim@gmail.com',
       'Phone C Clean': PHONE.RACH_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
       'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  // Victor services his new truck post-sale (days 400, 300, 150, 30)
  [400, 300, 150, 30].forEach(function(d) {
    sv({ 'Vin': VIN.DAN_TRUCK22, 'Dt Close Converted': isoDate(d),
         'First Name': 'VICTOR', 'Last Name': 'RIVERS', 'Email 1': 'vrivers@gmail.com',
         'Phone C Clean': '4843301177', 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  });

  // Daniel 2023 Camry — services regularly
  [1000, 850, 700, 500, 350, 200, 60].forEach(function(d) {
    sv({ 'Vin': VIN.DAN_CAMRY23, 'Dt Close Converted': isoDate(d),
         'First Name': 'DANIEL', 'Last Name': 'PEMBERTON', 'Email 1': 'danpemberton@outlook.com',
         'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
         'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry' });
  });
  // Daniel 2025 Truck — recent (Active)
  [450, 250, 100, 20].forEach(function(d) {
    sv({ 'Vin': VIN.DAN_TRUCK25, 'Dt Close Converted': isoDate(d),
         'First Name': 'DANIEL', 'Last Name': 'PEMBERTON', 'Email 1': 'danpemberton@outlook.com',
         'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
         'Vinex Year': '2025', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  });
  // Daniel BZ4X — recent
  [380, 180, 50].forEach(function(d) {
    sv({ 'Vin': VIN.DAN_BZ4X24, 'Dt Close Converted': isoDate(d),
         'First Name': 'DANIEL', 'Last Name': 'PEMBERTON', 'Email 1': 'danpemberton@outlook.com',
         'Phone C Clean': PHONE.DAN_CELL, 'Phone H Clean': PHONE.DAN_HOME, 'Phone W Clean': PHONE.DAN_WORK,
         'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'BZ4X' });
  });

  // Margaret — services her old Sienna BEFORE Daniel trades it in
  [1200, 1130].forEach(function(d) {
    sv({ 'Vin': VIN.MAR_SIENNA15, 'Dt Close Converted': isoDate(d),
         'First Name': 'MARGARET', 'Last Name': 'PEMBERTON', 'Email 1': 'mbpem@yahoo.com',
         'Phone C Clean': PHONE.MAR_CELL, 'Phone H Clean': PHONE.MAR_HOME, 'Phone W Clean': '',
         'Vinex Year': '2015', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna' });
  });
  // Margaret services her new Sienna
  [1000, 750, 500, 250, 80].forEach(function(d) {
    sv({ 'Vin': VIN.MAR_SIENNA23, 'Dt Close Converted': isoDate(d),
         'First Name': 'MARGARET', 'Last Name': 'PEMBERTON', 'Email 1': 'mbpem@yahoo.com',
         'Phone C Clean': PHONE.MAR_CELL, 'Phone H Clean': PHONE.MAR_HOME, 'Phone W Clean': '',
         'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna' });
  });

  // Emily — old Corolla Cross + new
  [800, 650, 590].forEach(function(d) {
    sv({ 'Vin': VIN.EMI_CROSS22, 'Dt Close Converted': isoDate(d),
         'First Name': 'EMILY', 'Last Name': 'PEMBERTON', 'Email 1': 'emilypem@gmail.com',
         'Phone C Clean': PHONE.EMI_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Corolla Cross' });
  });
  [400, 200, 40].forEach(function(d) {
    sv({ 'Vin': VIN.EMI_CROSS24, 'Dt Close Converted': isoDate(d),
         'First Name': 'EMILY', 'Last Name': 'PEMBERTON', 'Email 1': 'emilypem@gmail.com',
         'Phone C Clean': PHONE.EMI_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'Corolla Cross Hybrid' });
  });

  // Diana — services occasionally (lands her in At Risk)
  [1300, 1000, 600, 450].forEach(function(d) {
    sv({ 'Vin': VIN.DIA_CAMRY22, 'Dt Close Converted': isoDate(d),
         'First Name': 'DIANA', 'Last Name': 'PEMBERTON', 'Email 1': 'olds56conv@aol.com',
         'Phone C Clean': PHONE.DIA_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry' });
  });

  // Sara Lin — drift! service tickets use a new cell phone
  [1100, 900].forEach(function(d) {
    sv({ 'Vin': VIN.SAR_CAMRY22, 'Dt Close Converted': isoDate(d),
         'First Name': 'SARA', 'Last Name': 'LIN', 'Email 1': 'sara.lin@gmail.com',
         'Phone C Clean': PHONE.SAR_CELL_OLD, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry' });
  });
  [500, 250, 90].forEach(function(d) {
    sv({ 'Vin': VIN.SAR_CAMRY22, 'Dt Close Converted': isoDate(d),
         'First Name': 'SARA', 'Last Name': 'LIN', 'Email 1': 'sara.lin@gmail.com',
         'Phone C Clean': PHONE.SAR_CELL_NEW, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry' });
  });

  // Tom Phelps — leased 4Runner, services
  [950, 700, 450, 220, 60].forEach(function(d) {
    sv({ 'Vin': VIN.TOM_4RUN23, 'Dt Close Converted': isoDate(d),
         'First Name': 'TOM', 'Last Name': 'PHELPS', 'Email 1': 'tphelps@aol.com',
         'Phone C Clean': PHONE.TOM_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': '4Runner' });
  });

  // Aaron Cole — 2021 RAV4 services for ~3 years then stop (likely lease return)
  [1750, 1500, 1250, 1000, 700].forEach(function(d) {
    sv({ 'Vin': VIN.AAR_RAV21, 'Dt Close Converted': isoDate(d),
         'First Name': 'AARON', 'Last Name': 'COLE', 'Email 1': 'acole@verizon.net',
         'Phone C Clean': PHONE.AAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2021', 'Vinex Make': 'Toyota', 'Vinex Model': 'RAV4' });
  });
  [550, 300, 80].forEach(function(d) {
    sv({ 'Vin': VIN.AAR_RAV25, 'Dt Close Converted': isoDate(d),
         'First Name': 'AARON', 'Last Name': 'COLE', 'Email 1': 'acole@verizon.net',
         'Phone C Clean': PHONE.AAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2025', 'Vinex Make': 'Toyota', 'Vinex Model': 'RAV4' });
  });

  // Karen Doyle — stopped servicing (last service ~990 days ago, no current activity)
  [1900, 1500, 1100, 990].forEach(function(d) {
    sv({ 'Vin': VIN.KAR_CAMRY20, 'Dt Close Converted': isoDate(d),
         'First Name': 'KAREN', 'Last Name': 'DOYLE', 'Email 1': 'kdoyle@comcast.net',
         'Phone C Clean': PHONE.KAR_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2020', 'Vinex Make': 'Toyota', 'Vinex Model': 'Camry' });
  });

  // Marcus Tate — ADOPTED customer, 2018 Highlander, never bought here
  [1100, 800, 500, 200, 50].forEach(function(d) {
    sv({ 'Vin': VIN.MAR_HL18, 'Dt Close Converted': isoDate(d),
         'First Name': 'MARCUS', 'Last Name': 'TATE', 'Email 1': 'mtate1972@yahoo.com',
         'Phone C Clean': PHONE.MARCUS_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2018', 'Vinex Make': 'Toyota', 'Vinex Model': 'Highlander' });
  });

  // Liu Chen — cross-household trade context: Maya's Prius gets serviced BEFORE the trade
  [900, 800].forEach(function(d) {
    sv({ 'Vin': VIN.LIU_PRIUS19, 'Dt Close Converted': isoDate(d),
         'First Name': 'MAYA', 'Last Name': 'OKONKWO', 'Email 1': 'maya.okonkwo@gmail.com',
         'Phone C Clean': '7322044477', 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2019', 'Vinex Make': 'Toyota', 'Vinex Model': 'Prius' });
  });
  // Then Liu services his new Highlander
  [600, 400, 200, 30].forEach(function(d) {
    sv({ 'Vin': VIN.LIU_HIGH24, 'Dt Close Converted': isoDate(d),
         'First Name': 'LIU', 'Last Name': 'CHEN', 'Email 1': 'liu.chen@outlook.com',
         'Phone C Clean': PHONE.LIU_CELL, 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2024', 'Vinex Make': 'Toyota', 'Vinex Model': 'Highlander' });
  });

  // Loaner vehicles — 30 services each, never sold (detected as internal)
  [VIN.LOAN_RAV, VIN.LOAN_CAM].forEach(function(v) {
    for (var i = 0; i < 30; i++) {
      sv({ 'Vin': v, 'Dt Close Converted': isoDate(1000 - i * 25),
           'First Name': '', 'Last Name': '', 'Email 1': '',
           'Phone C Clean': '', 'Phone H Clean': '', 'Phone W Clean': '',
           'Vinex Year': v === VIN.LOAN_RAV ? '2023' : '2024',
           'Vinex Make': 'Toyota',
           'Vinex Model': v === VIN.LOAN_RAV ? 'RAV4' : 'Camry' });
    }
  });

  // Dealer-internal service rows — recon@ on a few VINs — PII gets stripped
  [VIN.DAN_TRUCK22, VIN.MAR_SIENNA15].forEach(function(v) {
    sv({ 'Vin': v, 'Dt Close Converted': isoDate(1280),
         'First Name': 'RECON', 'Last Name': 'TECH', 'Email 1': 'recon@dealership.com',
         'Phone C Clean': '', 'Phone H Clean': '', 'Phone W Clean': '',
         'Vinex Year': '2022', 'Vinex Make': 'Toyota', 'Vinex Model': 'Tundra' });
  });

  // Apex Logistics — 2 services per fleet vehicle
  APEX_VINS.slice(0, 12).forEach(function(v, i) {
    sv({ 'Vin': v, 'Dt Close Converted': isoDate(1400 - i * 30),
         'First Name': 'APEX', 'Last Name': 'LOGISTICS', 'Email 1': 'fleet@apexlogistics.example',
         'Phone C Clean': '6105550100', 'Phone H Clean': '', 'Phone W Clean': '6105550101',
         'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna' });
    sv({ 'Vin': v, 'Dt Close Converted': isoDate(700 - i * 20),
         'First Name': 'APEX', 'Last Name': 'LOGISTICS', 'Email 1': 'fleet@apexlogistics.example',
         'Phone C Clean': '6105550100', 'Phone H Clean': '', 'Phone W Clean': '6105550101',
         'Vinex Year': '2023', 'Vinex Make': 'Toyota', 'Vinex Model': 'Sienna' });
  });

  // Sort sales & service rows by date for realism
  sales.sort(function(a, b) { return String(a['Purchase Date']).localeCompare(b['Purchase Date']); });
  service.sort(function(a, b) { return String(a['Dt Close Converted']).localeCompare(b['Dt Close Converted']); });

  return {
    sales: sales,
    salesHeaders: ['Vin','Trade Vin','Purchase Date','Full Name','Email','Phone C Clean','Phone H Clean','Phone W Clean','Vinex Year','Vinex Make','Vinex Model','Deal Type'],
    service: service,
    serviceHeaders: ['Vin','Dt Close Converted','First Name','Last Name','Email 1','Phone C Clean','Phone H Clean','Phone W Clean','Vinex Year','Vinex Make','Vinex Model']
  };
})();
