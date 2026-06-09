/* ============ ORBIT — shared tree helpers (plain JS) ============
   One source of truth for the view modules (Atlas / Map / Smart).
   Mirrors the pure helpers used inside app.jsx. */
window.OT = (function () {
  const isColl = (n) => n && (n.type === 'collection' || n.type === 'library');

  function countDeep(coll) {
    let films = 0, colls = 0;
    for (const ch of coll.children || []) {
      if (isColl(ch)) { colls++; const r = countDeep(ch); films += r.films; colls += r.colls; }
      else films++;
    }
    return { films, colls };
  }
  // immediate children only
  function countShallow(coll) {
    let films = 0, colls = 0;
    for (const ch of coll.children || []) { if (isColl(ch)) colls++; else films++; }
    return { films, colls };
  }
  function coverFor(coll) {
    for (const ch of coll.children || []) { if (!isColl(ch)) return ch; }
    for (const ch of coll.children || []) { if (isColl(ch)) { const r = coverFor(ch); if (r) return r; } }
    return coll;
  }
  // a few representative title nodes (deep) — for orbital moons / previews
  function sampleTitles(coll, max) {
    const out = [];
    (function w(n) { for (const ch of n.children || []) { if (out.length >= max) return; if (isColl(ch)) w(ch); else out.push(ch); } })(coll);
    return out;
  }
  function findParent(root, id, parent = null) {
    if (root.id === id) return parent;
    for (const ch of root.children || []) { const r = findParent(ch, id, root); if (r) return r; }
    return null;
  }
  function findById(root, id) { let r = null; (function w(n) { if (n.id === id) { r = n; return; } for (const c of n.children || []) w(c); })(root); return r; }
  function idPath(root, id) {
    let res = null;
    (function walk(n, acc) { if (n.id === id) { res = acc; return; } for (const ch of n.children || []) walk(ch, [...acc, ch.id]); })(root, [root.id]);
    return res || [root.id];
  }
  function depthOf(root, id) { return idPath(root, id).length - 1; }

  // content categories
  const KID_GENRES = ['Animation', 'Family', 'Kids', 'Children', 'Kids & Family'];
  const isKid = (n) => KID_GENRES.includes(n.genre);
  const titleCat = (n) => n.type === 'movie' ? (isKid(n) ? 'kids' : 'movies') : (isKid(n) ? 'kidstv' : 'tv');

  // every leaf title in the whole tree, with the path of collection titles to it
  function allTitles(root) {
    const out = [];
    (function w(n, trail) {
      for (const ch of n.children || []) {
        if (isColl(ch)) w(ch, [...trail, ch.title]);
        else out.push({ node: ch, trail });
      }
    })(root, []);
    return out;
  }
  function allCollections(root, includeRoot) {
    const out = includeRoot ? [{ node: root, depth: 0 }] : [];
    (function w(n, d) { for (const ch of n.children || []) { if (isColl(ch)) { out.push({ node: ch, depth: d }); w(ch, d + 1); } } })(root, 1);
    return out;
  }

  return { isColl, countDeep, countShallow, coverFor, sampleTitles, findParent, findById, idPath, depthOf, KID_GENRES, isKid, titleCat, allTitles, allCollections };
})();

export const OT = window.OT;
export default OT;
