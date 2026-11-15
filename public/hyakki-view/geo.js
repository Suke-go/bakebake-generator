// Land tests on the outlines in /hyakki/japan.json (lon/lat degrees). Loaded by the viewer page, and by
// scripts/hyakki/check_geo.ts under node, so the same code answers "which region is this point in".
(function (root) {
  'use strict';

  function buildPolys(file) {
    const out = [];
    for (const pref of file.prefectures) {
      for (const rings of pref.polys) {
        const o = rings[0];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < o.length; i += 2) {
          x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]);
          y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]);
        }
        out.push({ region: pref.region, name: pref.name, rings, bbox: [x0, y0, x1, y1] });
      }
    }
    return out;
  }

  function inRing(x, y, r) {
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Region of the polygon containing the point, or null over the sea. `only` limits the search to one region. */
  function landAt(polys, lon, lat, only) {
    for (const p of polys) {
      if (only && p.region !== only) continue;
      const b = p.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!inRing(lon, lat, p.rings[0])) continue;
      let hole = false;
      for (let k = 1; k < p.rings.length && !hole; k++) hole = inRing(lon, lat, p.rings[k]);
      if (!hole) return p.region;
    }
    return null;
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** Region whose outline is nearest within maxDeg (degrees of latitude): a finger that lands just off a small island still counts. */
  function nearestRegion(polys, lon, lat, maxDeg) {
    const k = Math.cos((lat * Math.PI) / 180);
    let best = null, bestD = maxDeg;
    for (const p of polys) {
      const b = p.bbox;
      if (lon < b[0] - maxDeg / k || lon > b[2] + maxDeg / k || lat < b[1] - maxDeg || lat > b[3] + maxDeg) continue;
      const r = p.rings[0];
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const d = segDist(lon * k, lat, r[j] * k, r[j + 1], r[i] * k, r[i + 1]);
        if (d < bestD) { bestD = d; best = p.region; }
      }
    }
    return best;
  }

  const api = { buildPolys, landAt, nearestRegion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HyakkiGeo = api;
})(typeof self !== 'undefined' ? self : this);
