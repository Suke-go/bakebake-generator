(function (root) {
  function shortName(value) { return String(value || '').split(/[；;，,、]/)[0].trim(); }
  function layout(records, { height, width, altitude, selectedId }) {
    // At regional/national scale, use a few large representatives at their
    // actual anchors. Never push pictures out to sea to make room for them.
    if (altitude > 100000) {
      const cellDegrees = altitude > 500000 ? 1.5 : .45;
      const size = altitude > 500000 ? 104 : 96;
      const regions = new Map();
      for (const record of records) {
        const key = record.coordinates.map(value => Math.floor(value / cellDegrees)).join(',');
        if (!regions.has(key)) regions.set(key, []);
        regions.get(key).push(record);
      }
      const candidates = [...regions.values()].map(items => {
        const frequency = new Map();
        for (const item of items) frequency.set(shortName(item.name), (frequency.get(shortName(item.name)) || 0) + 1);
        return [...items].sort((a,b) => Number(b.id === selectedId) - Number(a.id === selectedId)
          || Number(Boolean(b.image)) - Number(Boolean(a.image))
          || frequency.get(shortName(b.name)) - frequency.get(shortName(a.name))
          || String(a.id).localeCompare(String(b.id)))[0];
      }).sort((a,b) => Number(b.id === selectedId) - Number(a.id === selectedId) || String(a.id).localeCompare(String(b.id)));
      const placed = [];
      for (const record of candidates) {
        if (placed.length >= (altitude > 500000 ? 12 : 18)) break;
        const {x,y} = record;
        if (x<size/2 || x>width-size/2 || y<size/2 || y>height-size/2-24) continue;
        if (placed.some(item => Math.abs(item.x-x)<size+20 && Math.abs(item.y-y)<size+32)) continue;
        placed.push({...record,size});
      }
      return placed;
    }
    const limit = altitude > 500000 ? 1 : altitude > 100000 ? 2 : altitude > 30000 ? 4 : altitude > 10000 ? 8 : altitude > 3000 ? 16 : 64;
    const size = altitude > 500000 ? 44 : altitude > 100000 ? 56 : altitude > 30000 ? 68 : 88;
    const byAnchor = new Map(), seen = new Set();
    const ordered = [...records].sort((a,b) => Number(b.id === selectedId) - Number(a.id === selectedId) || String(a.id).localeCompare(String(b.id)));
    for (const record of ordered) {
      // Equal names alone are never duplicates. Keep different illustrations.
      const key = record.image && record.summary ? JSON.stringify([record.coordinates, record.imageFingerprint || record.image, record.summary, record.name]) : `id:${record.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const anchor = record.coordinates.join(',');
      if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
      byAnchor.get(anchor).push(record);
    }
    // Round-robin across anchors and names avoids an Oni/teapot wall.
    const queues = [...byAnchor.values()].map(records => {
      const names = new Map();
      for (const record of records) {
        const name = shortName(record.name);
        if (!names.has(name)) names.set(name, []);
        names.get(name).push(record);
      }
      const result = [];
      while (result.length < limit && [...names.values()].some(items => items.length)) {
        for (const items of names.values()) if (items.length && result.length < limit) result.push(items.shift());
      }
      return result;
    });
    const placed = [];
    for (let pass=0; pass<limit; pass++) for (const queue of queues) {
      const record = queue[pass];
      if (!record) continue;
      let slot;
      for (let attempt=0; attempt<40; attempt++) {
        const radius = attempt ? (size + 12) * .62 * Math.sqrt(attempt) : 0;
        if (radius > (altitude > 100000 ? 95 : 260)) break;
        const angle=attempt*2.3999632297;
        const x=record.x+Math.cos(angle)*radius, y=record.y+Math.sin(angle)*radius;
        if (x<size/2 || x>width-size/2 || y<size/2 || y>height-size/2-22) continue;
        if (placed.some(item=>Math.abs(item.x-x)<size/2+item.size/2+10 && Math.abs(item.y-y)<size/2+item.size/2+24)) continue;
        slot={...record,x,y,size}; break;
      }
      if (slot) placed.push(slot);
    }
    return placed;
  }
  if (typeof module !== 'undefined') module.exports = { layout };
  else root.YokaiMarkerLayout = { layout };
})(globalThis);
