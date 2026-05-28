// ===========================================================================
//  PROFILES — Engine module: union-find
//  Source: Apps Script v2 (Convergence List Hygiene Tool), verbatim.
//  Port note: pure data structure, lift directly to src/engine/unionFind.ts
// ===========================================================================

function makeUnionFind(n) {
  var parent = new Array(n);
  for (var i = 0; i < n; i++) parent[i] = i;
  return {
    find: function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    },
    union: function(x, y) {
      var px = this.find(x), py = this.find(y);
      if (px !== py) parent[px] = py;
    }
  };
}
