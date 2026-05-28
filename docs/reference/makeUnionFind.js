// ===========================================================================
// Extracted from index.html (Convergence List Hygiene Tool - Apps Script v2)
// Functions: makeUnionFind
// ===========================================================================

function makeUnionFind(n) {
  var parent = new Array(n);
  for (var i = 0; i < n; i++) parent[i] = i;
  return {
    find: function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; },
    union: function(x, y) { var px = this.find(x), py = this.find(y); if (px !== py) parent[px] = py; }
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

