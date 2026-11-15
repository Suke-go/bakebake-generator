/* Isolated Cesium runtime for /hyakki: no dependency or global-style changes to the Next app.
 *
 * A flat, top-down Cesium map (SCENE2D, so the view can only pan and zoom, never tilt or turn) over a night
 * rendering of GSI tiles. Everything that moves on top of it (mists, glows, trails) is drawn by one small WebGL
 * canvas that is re-projected after every Cesium render; pictures, silhouettes and tease bubbles are DOM.
 * The parent talks to this page only with postMessage (see src/components/hyakki/HyakkiMap.tsx). Colours that are
 * not data live in viewer.css (:root variables); the five caller colours and the wave length come from the parent.
 */
(() => {
  'use strict';
  const send = (type, extra = {}) => parent.postMessage({ type, ...extra }, location.origin);
  const fail = (code, detail) => { console.warn('hyakki viewer:', code, detail || ''); send('hyakki-error', { code }); };

  // ---------- small helpers ----------
  const hex = (s) => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const bytes = (s) => hex(s).map((v) => Math.round(v * 255));
  const REGION_COLOR = {
    'hokkaido-tohoku': hex('#5b82c4'), kanto: hex('#cc6683'), chubu: hex('#4fae8f'),
    kinki: hex('#d2a24c'), 'chugoku-shikoku': hex('#8f72cf'), 'kyushu-okinawa': hex('#d0704f'),
  };
  const REGION_KEYS = Object.keys(REGION_COLOR);
  // One colour per chosen yokai (caller 0-4): replaced by the parent's list (src/components/hyakki/colors.ts) on start.
  let CALLER = ['#ff7a7a', '#ffc857', '#5ad1e6', '#b79cff', '#7be495'].map(hex);
  let CALLER_CSS = ['#ff7a7a', '#ffc857', '#5ad1e6', '#b79cff', '#7be495'];
  let WAVE_S = 10;
  const PIN_COLOR = hex('#fff1d0');
  const LINE_COLOR = hex('#ffeccb');
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
  const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
  const lerp = (a, b, t) => a + (b - a) * t;
  const LAT0 = 37, LON0 = 135, COS0 = Math.cos((LAT0 * Math.PI) / 180);
  const hashSeed = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return (h >>> 0); };

  const WAVE_POP = 0.35; // a light shows at home, then
  const WAVE_RUN = 1.6; // runs to its caller
  const PARADE_WALK = 7; // seconds for the leader to run the whole road (the parade is about 10 s in all)
  const MARCH_S = 11; // the last scene: all hundred cross the screen from right to left, as in the picture scrolls
  const CALL_S = 2.2; // one chosen yokai's friends answer its call over this long
  const MAX_LIGHTS = 240;
  const MAX_DOTS = 700;
  const MAX_SEGS = 900;

  const state = {
    view: 'japan', pin: null, mists: [], figures: [], lights: [], summon: 'off', parade: false, still: false, inset: 0,
    called: [], sheet: false, peeked: [],
    handlers: { region: false, pick: false, mist: false, figure: false },
  };

  let boot;
  try { boot = start(); } catch (e) { fail(e && e.code ? e.code : 'other', e && e.message); }
  if (boot && boot.catch) boot.catch((e) => fail(e && e.code ? e.code : 'other', e && e.message));

  async function start() {
    const C = window.Cesium;
    if (!C || !window.HyakkiGeo) throw Object.assign(new Error('Cesium unavailable'), { code: 'cesium' });
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw Object.assign(new Error('no webgl'), { code: 'webgl' });
    const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');

    const file = await fetch('/hyakki/japan.json').then((r) => { if (!r.ok) throw Object.assign(new Error(`japan.json ${r.status}`), { code: 'data' }); return r.json(); })
      .catch((e) => { throw e && e.code ? e : Object.assign(new Error('japan.json'), { code: 'data' }); });
    const polys = HyakkiGeo.buildPolys(file);
    const frames = file.frames;

    const SEA_B = bytes(cssVar('--hk-sea') || '#0b0818');
    const LAND_DARK = bytes(cssVar('--hk-land-dark') || '#1c1438');
    const LAND_LIGHT = bytes(cssVar('--hk-land-light') || '#82749f');
    const RIVER = bytes(cssVar('--hk-river') || '#78b0ec');
    const MIST_COLOR = hex(cssVar('--hk-mist') || '#e6d8ff');
    const SEA = C.Color.fromCssColorString(cssVar('--hk-sea') || '#0b0818');
    const viewer = new C.Viewer('map', {
      sceneMode: C.SceneMode.SCENE2D, mapProjection: new C.WebMercatorProjection(C.Ellipsoid.WGS84),
      baseLayer: false, baseLayerPicker: false, geocoder: false,
      animation: false, timeline: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      terrainProvider: new C.EllipsoidTerrainProvider(), msaaSamples: 1, skyBox: false,
    });
    const scene = viewer.scene, camera = viewer.camera, canvas = scene.canvas;
    // Test hook: readable only when the page address ends with #debug.
    const hook = { viewer, C, state };
    Object.defineProperty(window, '__hv', { get: () => (location.hash === '#debug' ? hook : undefined) });
    scene.backgroundColor = SEA;
    scene.globe.baseColor = SEA;
    scene.globe.showGroundAtmosphere = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) < 4;
    if (lowPower) { viewer.resolutionScale = 0.75; scene.globe.maximumScreenSpaceError = 4; scene.globe.tileCacheSize = 60; }
    // A flat map: panning and pinching only; no tilt, no spin, no look-around.
    const ctl = scene.screenSpaceCameraController;
    ctl.enableTilt = false; ctl.enableRotate = false; ctl.enableLook = false; ctl.enableTranslate = true; ctl.enableZoom = true;
    ctl.inertiaTranslate = 0.7; ctl.inertiaZoom = 0.7;

    // ---------- night tiles: GSI hillshade for the relief, GSI pale only to find rivers and the sea ----------
    const GSI = 'https://cyberjapandata.gsi.go.jp/xyz';
    const credit = new C.Credit('<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院(地理院タイル)を加工して作成</a>');
    const mk = (layer) => new C.UrlTemplateImageryProvider({ url: `${GSI}/${layer}/{z}/{x}/{y}.png`, minimumLevel: 2, maximumLevel: 16, credit });
    const hill = mk('hillshademap');
    const pale = mk('pale');
    const baseRequest = C.UrlTemplateImageryProvider.prototype.requestImage;
    const scratch = [document.createElement('canvas'), document.createElement('canvas')];
    const scratchCtx = scratch.map((c) => c.getContext('2d', { willReadFrequently: true }));
    const pixels = (img, i) => {
      const c = scratch[i], x = scratchCtx[i];
      if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
      // Hillshade tiles carry part of the shading in their alpha (flat ground and sea are transparent at low zoom): lay them on flat grey.
      if (i === 0) { x.fillStyle = '#b2b2b2'; x.fillRect(0, 0, img.width, img.height); }
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, img.width, img.height).data;
    };
    // A coarse land mask from the outlines (grown by about 700 m): relief that belongs to Korea or China stays dark.
    const maskCanvas = document.createElement('canvas');
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    function landMask(x, y, level, size) {
      const rr = hill.tilingScheme.tileXYToRectangle(x, y, level);
      const west = C.Math.toDegrees(rr.west), east = C.Math.toDegrees(rr.east), north = C.Math.toDegrees(rr.north), south = C.Math.toDegrees(rr.south);
      const yN = mercY(north), yS = mercY(south);
      maskCanvas.width = maskCanvas.height = size;
      maskCtx.clearRect(0, 0, size, size);
      maskCtx.setTransform(1, 0, 0, -1, 0, size); // Cesium's tile bitmaps arrive flipped vertically; the mask must match them
      maskCtx.fillStyle = '#fff'; maskCtx.strokeStyle = '#fff'; maskCtx.lineJoin = 'round';
      const mPerPx = ((east - west) * 111320 * Math.cos((((north + south) / 2) * Math.PI) / 180)) / size;
      maskCtx.lineWidth = Math.max(2, 1400 / mPerPx);
      for (const p of polys) {
        const b = p.bbox;
        if (b[0] > east + 0.05 || b[2] < west - 0.05 || b[1] > north + 0.05 || b[3] < south - 0.05) continue;
        maskCtx.beginPath();
        for (const ring of p.rings) {
          for (let i = 0; i < ring.length; i += 2) {
            const px = ((ring[i] - west) / (east - west)) * size, py = ((yN - mercY(ring[i + 1])) / (yN - yS)) * size;
            if (i === 0) maskCtx.moveTo(px, py); else maskCtx.lineTo(px, py);
          }
          maskCtx.closePath();
        }
        maskCtx.fill('evenodd');
        maskCtx.stroke();
      }
      return maskCtx.getImageData(0, 0, size, size).data;
    }
    // Sea and lakes are one flat colour on the pale map; rivers are darker blue lines. Land takes its tone from the hillshade.
    const tone = (g, o, k) => {
      const t = Math.pow(clamp01((g / 255 - 0.28) / 0.55), 1.15);
      o[k] = LAND_DARK[0] + (LAND_LIGHT[0] - LAND_DARK[0]) * t;
      o[k + 1] = LAND_DARK[1] + (LAND_LIGHT[1] - LAND_DARK[1]) * t;
      o[k + 2] = LAND_DARK[2] + (LAND_LIGHT[2] - LAND_DARK[2]) * t;
    };
    const compose = (h, p, level, tx, ty) => {
      const hd = pixels(h, 0), pd = pixels(p, 1);
      const md = landMask(tx, ty, level, h.width);
      const w = h.width, ht = h.height, n = w * ht;
      const out = document.createElement('canvas');
      out.width = w; out.height = ht;
      const ctx = out.getContext('2d');
      const img = ctx.createImageData(w, ht);
      const o = img.data;
      // Names and boundary lines over the sea fall outside the land mask; lakes are the flat sea colour.
      const sea = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const k = i * 4;
        if (Math.abs(pd[k] - 190) < 8 && Math.abs(pd[k + 1] - 210) < 8 && Math.abs(pd[k + 2] - 255) < 6) sea[i] = 1;
      }
      const sw = w + 1, sat = new Int32Array(sw * (ht + 1));
      for (let y = 0; y < ht; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) { row += sea[y * w + x]; sat[(y + 1) * sw + x + 1] = sat[y * sw + x + 1] + row; }
      }
      const nearSea = new Uint8Array(n);
      for (let y = 0; y < ht; y++) {
        const Y0 = Math.max(0, y - 7), Y1 = Math.min(ht, y + 8);
        for (let x = 0; x < w; x++) {
          const X0 = Math.max(0, x - 7), X1 = Math.min(w, x + 8);
          const c2 = sat[Y1 * sw + X1] - sat[Y0 * sw + X1] - sat[Y1 * sw + X0] + sat[Y0 * sw + X0];
          if (c2 > 0.15 * (X1 - X0) * (Y1 - Y0)) nearSea[y * w + x] = 1; // coast lines and names over the sea are not rivers
        }
      }
      const river = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const k = i * 4, r = pd[k], b = pd[k + 2];
        if (level >= 7 && !nearSea[i] && !sea[i] && md[k + 3] >= 128 && b - r > 40 && b > 150 && r < 185) river[i] = 1;
      }
      for (let y = 0; y < ht; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, k = i * 4;
          if (sea[i] || md[k + 3] < 128) { o[k] = SEA_B[0]; o[k + 1] = SEA_B[1]; o[k + 2] = SEA_B[2]; }
          else if (river[i]) { o[k] = RIVER[0]; o[k + 1] = RIVER[1]; o[k + 2] = RIVER[2]; }
          else {
            tone(hd[k], o, k);
            if ((x > 0 && river[i - 1]) || (x < w - 1 && river[i + 1]) || (y > 0 && river[i - w]) || (y < ht - 1 && river[i + w])) {
              // one pixel of glow beside a river line
              o[k] = o[k] * 0.55 + RIVER[0] * 0.45; o[k + 1] = o[k + 1] * 0.55 + RIVER[1] * 0.45; o[k + 2] = o[k + 2] * 0.55 + RIVER[2] * 0.45;
            }
          }
          o[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // Cesium uploads canvases without flipping, but its own tile bitmaps arrive pre-flipped: hand it a flipped copy.
      const flipped = document.createElement('canvas');
      flipped.width = w; flipped.height = ht;
      const fctx = flipped.getContext('2d');
      fctx.translate(0, ht); fctx.scale(1, -1); fctx.drawImage(out, 0, 0);
      return flipped;
    };
    // Tiles that touch no Japanese land are plain sea: no request at all (and no Korea or China relief at the map's edge).
    const seaTile = document.createElement('canvas');
    seaTile.width = seaTile.height = 4;
    { const c = seaTile.getContext('2d'); c.fillStyle = cssVar('--hk-sea') || '#0b0818'; c.fillRect(0, 0, 4, 4); }
    const touchesJapan = (x, y, level) => {
      const r = hill.tilingScheme.tileXYToRectangle(x, y, level);
      const w = C.Math.toDegrees(r.west) - 0.2, e = C.Math.toDegrees(r.east) + 0.2, so = C.Math.toDegrees(r.south) - 0.2, n = C.Math.toDegrees(r.north) + 0.2;
      return polys.some((p) => p.bbox[0] <= e && p.bbox[2] >= w && p.bbox[1] <= n && p.bbox[3] >= so);
    };
    hill.requestImage = function (x, y, level, request) {
      if (!touchesJapan(x, y, level)) return Promise.resolve(seaTile);
      const a = baseRequest.call(hill, x, y, level, request);
      if (!a) return undefined;
      const b = baseRequest.call(pale, x, y, level);
      if (!b) return undefined;
      return Promise.all([a, b]).then(([h, p]) => compose(h, p, level, x, y));
    };
    let tileTrouble = false;
    let tileErrors = 0;
    // A single missing tile is normal (404 at the data's edge); only a run of failures means the network is the problem.
    hill.errorEvent.addEventListener(() => { if (++tileErrors >= 8 && !tileTrouble) { tileTrouble = true; send('hyakki-tiles-trouble'); } });
    viewer.imageryLayers.addImageryProvider(hill);
    Object.assign(hook, { hill, landMask, compose });

    // ---------- region tints (one primitive per region so a region can fade on its own) ----------
    const regionPrims = {};
    const colorScratch = new C.Color();
    for (const key of REGION_KEYS) {
      const instances = [];
      const ids = [];
      polys.forEach((p, n) => {
        if (p.region !== key) return;
        try {
          const ring = (r) => C.Cartesian3.fromDegreesArray(Array.from(r));
          const hier = new C.PolygonHierarchy(ring(p.rings[0]), p.rings.slice(1).map((h) => new C.PolygonHierarchy(ring(h))));
          const id = `${key}:${n}`;
          ids.push(id);
          instances.push(new C.GeometryInstance({
            id,
            geometry: new C.PolygonGeometry({ polygonHierarchy: hier, height: 0, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT }),
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(new C.Color(0, 0, 0, 0)) },
          }));
        } catch (e) { /* a degenerate part is skipped */ }
      });
      const prim = new C.Primitive({
        geometryInstances: instances, asynchronous: true, releaseGeometryInstances: false, allowPicking: false,
        appearance: new C.PerInstanceColorAppearance({ translucent: true, closed: false, flat: true }),
      });
      scene.primitives.add(prim);
      regionPrims[key] = { prim, ids, applied: -1, fa: 0 };
    }
    function applyRegionAlpha(key, a) {
      const R = regionPrims[key];
      if (!R.prim.ready) return false;
      const c = REGION_COLOR[key];
      colorScratch.red = c[0]; colorScratch.green = c[1]; colorScratch.blue = c[2]; colorScratch.alpha = a;
      const v = C.ColorGeometryInstanceAttribute.toValue(colorScratch);
      for (const id of R.ids) { const at = R.prim.getGeometryInstanceAttributes(id); if (at) at.color = v; }
      R.applied = a;
      return true;
    }

    // ---------- prefecture borders and names: shown once a region is open, so people can find where they live ----------
    const borders = scene.primitives.add(new C.PolylineCollection());
    const prefNames = scene.primitives.add(new C.LabelCollection());
    {
      const line = C.Material.fromType('Color', { color: C.Color.fromCssColorString('#efe6fb').withAlpha(0.42) });
      const biggest = new Map(); // prefecture -> its largest part, where the name goes
      for (const p of polys) {
        try { borders.add({ positions: C.Cartesian3.fromDegreesArray(Array.from(p.rings[0])), width: 1.2, material: line, loop: true }); } catch (e) { /* a degenerate part is skipped */ }
        const area = (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]);
        if (!biggest.has(p.name) || biggest.get(p.name).area < area) biggest.set(p.name, { area, lon: (p.bbox[0] + p.bbox[2]) / 2, lat: (p.bbox[1] + p.bbox[3]) / 2 });
      }
      for (const [name, at] of biggest) {
        prefNames.add({
          position: C.Cartesian3.fromDegrees(at.lon, at.lat), text: name.replace(/[都府県]$/, ''),
          font: "600 13px 'Kaisei Tokumin', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
          fillColor: C.Color.fromCssColorString('#f1eef8'), outlineColor: C.Color.fromCssColorString('#14121f'), outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    }
    const showBorders = () => { const on = state.view !== 'japan' && !state.sheet; borders.show = on; prefNames.show = on && state.summon === 'off'; };
    showBorders();

    // ---------- camera ----------
    const proj = new C.WebMercatorProjection(C.Ellipsoid.WGS84);
    const merc = (lon, lat) => proj.project(C.Cartographic.fromDegrees(lon, lat));
    const unmerc = (x, y) => { const c = proj.unproject(new C.Cartesian3(x, y, 0)); return [C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude)]; };
    let userMoved = false;
    let camReady = false;
    function targetFor(view) {
      const W = Math.max(canvas.clientWidth, 100), H = Math.max(canvas.clientHeight, 100);
      const f = frames[view];
      const a = merc(f[0], f[2]), b = merc(f[1], f[3]);
      const availH = Math.max(H - state.inset, 120);
      const scale = Math.max((b.x - a.x) / W, (b.y - a.y) / availH) / 0.94; // metres per px
      // The frame sits in the visible upper part: the camera centre moves down by half the inset.
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 - (state.inset / 2) * scale, w: W * scale };
    }
    // Cesium's flyTo cannot tween a 2D frustum exactly, so the camera is placed and eased by hand.
    let anim = null;
    function place(cx, cy, w) {
      const fr = camera.frustum;
      const h = (w * Math.max(canvas.clientHeight, 100)) / Math.max(canvas.clientWidth, 100);
      camera.position.x = cx; camera.position.y = cy;
      fr.right = w / 2; fr.left = -w / 2; fr.top = h / 2; fr.bottom = -h / 2;
    }
    function current() {
      const fr = camera.frustum;
      return { cx: camera.position.x, cy: camera.position.y, w: fr.right - fr.left };
    }
    let framedInset = 0;
    // While mists are out, the map is framed on the town and the mists nearest to it, close enough for their clouds
    // to be read; the rest of the region is a drag away. The frame is set once, when the first mists arrive.
    let focus = null;
    function setFocus() {
      const c = state.pin || state.figures[0] || state.mists[0];
      const o = merc(c.lon, c.lat);
      const near = state.mists.map((m) => merc(m.lon, m.lat)).sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y)).slice(0, 7);
      const pts = [o, ...near, ...state.figures.map((f) => merc(f.lon, f.lat))];
      focus = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
    }
    function focusTarget() {
      const W = Math.max(canvas.clientWidth, 100), availH = Math.max(Math.max(canvas.clientHeight, 100) - state.inset, 120);
      const scale = Math.max((focus.x1 - focus.x0) / W, (focus.y1 - focus.y0) / availH, 60) / 0.62; // room for the clouds
      return { cx: (focus.x0 + focus.x1) / 2, cy: (focus.y0 + focus.y1) / 2 - (state.inset / 2) * scale, w: W * scale };
    }
    function goView(instant) {
      const to = focus ? focusTarget() : targetFor(state.view);
      userMoved = false; framedInset = state.inset;
      if (instant || state.still) { anim = null; place(to.cx, to.cy, to.w); }
      else anim = { t0: performance.now() / 1000, dur: 1.4, from: current(), to };
      wake();
    }
    scene.preRender.addEventListener(() => {
      if (!anim) return;
      const k = smooth((performance.now() / 1000 - anim.t0) / anim.dur);
      const { from, to } = anim;
      place(lerp(from.cx, to.cx, k), lerp(from.cy, to.cy, k), Math.exp(lerp(Math.log(from.w), Math.log(to.w), k)));
      if (k >= 1) anim = null;
      scene.requestRender();
    });
    // Keep the map near Japan, and between a whole-country view and street level.
    const jf = frames.japan;
    const jmin = merc(jf[0] - 1, jf[2] - 1), jmax = merc(jf[1] + 1, jf[3] + 1);
    scene.preRender.addEventListener(() => {
      if (!camReady || scene.mode !== C.SceneMode.SCENE2D) return;
      const fr = camera.frustum;
      const width = fr.right - fr.left;
      // The widest view must still hold the whole country in the part the panel leaves free.
      const aspect = Math.max(canvas.clientWidth, 100) / Math.max(canvas.clientHeight - state.inset, 120);
      const maxW = Math.max(jmax.x - jmin.x, (jmax.y - jmin.y) * aspect) * 1.1, minW = Math.max(canvas.clientWidth, 100) * 20; // 20 m per px: closer than this the map tiles run out
      const target = Math.min(maxW, Math.max(minW, width));
      if (Math.abs(target - width) > 1) { const k = target / width; fr.right *= k; fr.left *= k; fr.top *= k; fr.bottom *= k; }
      const p = camera.position;
      const nx = Math.min(jmax.x, Math.max(jmin.x, p.x)), ny = Math.min(jmax.y, Math.max(jmin.y, p.y));
      if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; }
    });

    // A drag or a pinch from the player: from then on the map is theirs until the next view change.
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { userMoved = true; anim = null; } });
    canvas.addEventListener('pointerup', () => { down = null; });
    canvas.addEventListener('pointercancel', () => { down = null; });
    canvas.addEventListener('wheel', () => { userMoved = true; anim = null; }, { passive: true });

    // ---------- the overlay canvas (WebGL) ----------
    const fx = document.getElementById('fx');
    const gl = fx.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw Object.assign(new Error('overlay webgl'), { code: 'webgl' });
    const mkProg = (vs, fs) => {
      const p = gl.createProgram();
      for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(t);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
      return p;
    };
    const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
    const toClip = 'vec2 clip(vec2 px) { return vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0); }\n';

    // Mist: a soft, wobbling blob with no hard outline. uDensity follows the tier, uAppear is the fade in/out.
    const mistProg = mkProg(
      `attribute vec2 aPos; uniform vec2 uRes; uniform vec2 uCenter; uniform float uHalf; varying vec2 vUv;\n${toClip}
       void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(clip(uCenter + aPos * uHalf), 0.0, 1.0); }`,
      `${PREC}uniform float uTime; uniform float uDensity; uniform float uAppear; uniform float uSeed; uniform vec3 uColor; varying vec2 vUv;
       float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
       float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
         return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
       float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
       void main() {
         vec2 p = vUv * 2.0 - 1.0; float r = length(p);
         vec2 q = p * 1.5 + vec2(uSeed, uSeed * 0.7);
         vec2 w = vec2(fbm(q + vec2(uTime * 0.07, -uTime * 0.05)), fbm(q + vec2(5.2, 1.3) - vec2(uTime * 0.04, uTime * 0.06)));
         float n = fbm(q * 1.2 + w * 1.4 + vec2(0.0, uTime * 0.03));
         float shape = 1.0 - smoothstep(0.04, 0.9, r + (n - 0.5) * 0.8);
         shape *= 1.0 - smoothstep(0.62, 0.98, r);
         float a = clamp(shape * (0.4 + 0.6 * n) * uDensity * uAppear, 0.0, 1.0);
         vec3 col = mix(uColor * 0.72, uColor, n);
         gl_FragColor = vec4(col * a, a);
       }`,
    );
    // Glow dots (lights, pin, halos): size in px, with an optional expanding ring.
    const dotProg = mkProg(
      `attribute vec2 aCorner; attribute vec2 aPos; attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aPulse;
       uniform vec2 uRes; varying vec2 vP; varying vec3 vColor; varying float vAlpha; varying float vPulse;\n${toClip}
       void main() { vP = aCorner; vColor = aColor; vAlpha = aAlpha; vPulse = aPulse; gl_Position = vec4(clip(aPos + aCorner * aSize), 0.0, 1.0); }`,
      `${PREC}varying vec2 vP; varying vec3 vColor; varying float vAlpha; varying float vPulse;
       void main() {
         float d = length(vP); if (d > 1.0) discard;
         float core = smoothstep(0.3, 0.1, d);
         float glow = pow(1.0 - d, 2.4) * 0.55;
         float ring = vPulse > 0.0 ? smoothstep(0.08, 0.0, abs(d - vPulse)) * (1.0 - vPulse) * 1.3 : 0.0;
         float a = clamp((core + glow + ring) * vAlpha, 0.0, 1.0);
         vec3 col = mix(vColor, vec3(1.0), core * 0.65);
         gl_FragColor = vec4(col * a, a);
       }`,
    );
    const segProg = mkProg(
      `attribute vec2 aXY; attribute float aV; attribute vec3 aColor; attribute float aAlpha; uniform vec2 uRes; varying float vV; varying vec3 vColor; varying float vAlpha;\n${toClip}
       void main() { vV = aV; vColor = aColor; vAlpha = aAlpha; gl_Position = vec4(clip(aXY), 0.0, 1.0); }`,
      `${PREC}varying float vV; varying vec3 vColor; varying float vAlpha;
       void main() { float a = (1.0 - smoothstep(0.35, 1.0, abs(vV))) * vAlpha; gl_FragColor = vec4(vColor * a, a); }`,
    );
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const quadIndex = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
    const idx = new Uint16Array(Math.max(MAX_DOTS, MAX_SEGS) * 6);
    for (let i = 0; i < idx.length / 6; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const DOT_F = 10, SEG_F = 7;
    const dotData = new Float32Array(MAX_DOTS * 4 * DOT_F), segData = new Float32Array(MAX_SEGS * 4 * SEG_F);
    const dotBuf = gl.createBuffer(), segBuf = gl.createBuffer();
    let nDots = 0, nSegs = 0;
    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
    function pushDot(x, y, size, c, a, pulse) {
      if (nDots >= MAX_DOTS || a <= 0.003) return;
      for (let q = 0; q < 4; q++) {
        const o = (nDots * 4 + q) * DOT_F;
        dotData[o] = CORNERS[q * 2]; dotData[o + 1] = CORNERS[q * 2 + 1]; dotData[o + 2] = x; dotData[o + 3] = y; dotData[o + 4] = size;
        dotData[o + 5] = c[0]; dotData[o + 6] = c[1]; dotData[o + 7] = c[2]; dotData[o + 8] = a; dotData[o + 9] = pulse || 0;
      }
      nDots++;
    }
    function pushSeg(ax, ay, bx, by, prog, width, c, a) {
      if (nSegs >= MAX_SEGS || a <= 0.003 || prog <= 0.001) return;
      const ex = ax + (bx - ax) * prog, ey = ay + (by - ay) * prog;
      const dx = ex - ax, dy = ey - ay, len = Math.hypot(dx, dy);
      if (len < 0.01) return;
      const nx = (-dy / len) * width, ny = (dx / len) * width;
      const o = nSegs * 4 * SEG_F;
      const set = (q, x, y, v) => { const p = o + q * SEG_F; segData[p] = x; segData[p + 1] = y; segData[p + 2] = v; segData[p + 3] = c[0]; segData[p + 4] = c[1]; segData[p + 5] = c[2]; segData[p + 6] = a; };
      set(0, ax + nx, ay + ny, 1); set(1, ex + nx, ey + ny, 1); set(2, ex - nx, ey - ny, -1); set(3, ax - nx, ay - ny, -1);
      nSegs++;
    }
    function bind(prog, names) { for (const [n, size, stride, off] of names) { const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4); } }
    const U = (prog, n) => gl.getUniformLocation(prog, n);
    const mistU = { res: U(mistProg, 'uRes'), center: U(mistProg, 'uCenter'), half: U(mistProg, 'uHalf'), time: U(mistProg, 'uTime'), density: U(mistProg, 'uDensity'), appear: U(mistProg, 'uAppear'), seed: U(mistProg, 'uSeed'), color: U(mistProg, 'uColor') };
    let FW = 400, FH = 400, DPR = 1;
    function resizeFx() {
      const w = fx.clientWidth, h = fx.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
      if (w === FW && h === FH && d === DPR && fx.width) return;
      FW = w; FH = h; DPR = d;
      fx.width = Math.max(1, Math.round(w * d)); fx.height = Math.max(1, Math.round(h * d));
    }
    function useBlend(additive) {
      gl.enable(gl.BLEND);
      if (additive) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    function flushSegs() {
      if (!nSegs) return;
      gl.useProgram(segProg); gl.uniform2f(U(segProg, 'uRes'), FW, FH); useBlend(true);
      gl.bindBuffer(gl.ARRAY_BUFFER, segBuf); gl.bufferData(gl.ARRAY_BUFFER, segData.subarray(0, nSegs * 4 * SEG_F), gl.DYNAMIC_DRAW);
      bind(segProg, [['aXY', 2, SEG_F, 0], ['aV', 1, SEG_F, 2], ['aColor', 3, SEG_F, 3], ['aAlpha', 1, SEG_F, 6]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
      gl.drawElements(gl.TRIANGLES, nSegs * 6, gl.UNSIGNED_SHORT, 0);
      nSegs = 0;
    }
    function flushDots() {
      if (!nDots) return;
      gl.useProgram(dotProg); gl.uniform2f(U(dotProg, 'uRes'), FW, FH); useBlend(true);
      gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferData(gl.ARRAY_BUFFER, dotData.subarray(0, nDots * 4 * DOT_F), gl.DYNAMIC_DRAW);
      bind(dotProg, [['aCorner', 2, DOT_F, 0], ['aPos', 2, DOT_F, 2], ['aSize', 1, DOT_F, 4], ['aColor', 3, DOT_F, 5], ['aAlpha', 1, DOT_F, 8], ['aPulse', 1, DOT_F, 9]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
      gl.drawElements(gl.TRIANGLES, nDots * 6, gl.UNSIGNED_SHORT, 0);
      nDots = 0;
    }
    function drawMist(seed, cx, cy, half, density, appear, time) {
      gl.useProgram(mistProg); useBlend(false);
      gl.uniform2f(mistU.res, FW, FH); gl.uniform2f(mistU.center, cx, cy); gl.uniform1f(mistU.half, half);
      gl.uniform1f(mistU.time, time); gl.uniform1f(mistU.density, density); gl.uniform1f(mistU.appear, appear);
      gl.uniform1f(mistU.seed, seed); gl.uniform3f(mistU.color, MIST_COLOR[0], MIST_COLOR[1], MIST_COLOR[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const l = gl.getAttribLocation(mistProg, 'aPos'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // ---------- projection to the screen (no allocation per call) ----------
    const c3 = new C.Cartesian3(), c2 = new C.Cartesian2();
    function scrInto(lon, lat, out) {
      C.Cartesian3.fromDegrees(lon, lat, 0, C.Ellipsoid.WGS84, c3);
      const p = scene.cartesianToCanvasCoordinates(c3, c2);
      if (p) { out[0] = p.x; out[1] = p.y; } else { out[0] = -9999; out[1] = -9999; }
      return out;
    }
    const tmpA = [0, 0], tmpB = [0, 0];
    // Screen pixels per metre of ground near a point (a Mercator map stretches by 1/cos(lat), ground metres do not).
    function pxPerMetre(lon, lat, cx, cy) {
      const dLon = 1000 / (111320 * Math.cos((lat * Math.PI) / 180));
      scrInto(lon + dLon, lat, tmpB);
      return Math.hypot(tmpB[0] - cx, tmpB[1] - cy) / 1000;
    }
    const projX = (lon) => (lon - LON0) * COS0, projY = (lat) => lat - LAT0;

    // ---------- mists, kept by id across updates ----------
    const mists = new Map();
    function reconcileMists() {
      const now = performance.now() / 1000;
      const incoming = new Set();
      for (const m of state.mists) {
        incoming.add(m.id);
        const cur = mists.get(m.id);
        if (!cur) { mists.set(m.id, { id: m.id, lon: m.lon, lat: m.lat, level: m.level, tierFrom: m.tier, tierTo: m.tier, tierT0: now, appear: 0, leaving: false, seed: (hashSeed(m.id) % 1000) / 10, x: 0, y: 0, vis: 0, ap: 0, tier: m.tier }); continue; }
        cur.leaving = false; cur.level = m.level; cur.lon = m.lon; cur.lat = m.lat;
        if (cur.tierTo !== m.tier) {
          cur.tierFrom = lerp(cur.tierFrom, cur.tierTo, smooth(now - cur.tierT0));
          cur.tierTo = m.tier; cur.tierT0 = now;
        }
      }
      for (const [, o] of mists) if (!incoming.has(o.id)) o.leaving = true;
      wake();
    }
    const tierDensity = () => 1.1; // every mist looks the same: which one to open is told by its cloud, not its thickness

    // ---------- shared picture loading: one request per URL ----------
    const pics = new Map(); // url -> { loaded, waiting: [fn] }
    function whenLoaded(url, fn) {
      let e = pics.get(url);
      if (!e) {
        e = { loaded: false, waiting: [] };
        pics.set(url, e);
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { e.loaded = true; e.waiting.splice(0).forEach((f) => f()); };
        img.onerror = () => { e.waiting.length = 0; };
        img.src = url;
        e.img = img;
      }
      if (e.loaded) fn(); else e.waiting.push(fn);
    }

    // The player's pin: a solid 18 px dot with a 2 px bright ring, so it reads even on a 400 px screen.
    const pinEl = document.createElement('div');
    pinEl.className = 'hk-pin';
    document.getElementById('figs').before(pinEl);

    // ---------- figures (the chosen yokai) ----------
    const figs = []; // { id, el, seenAt, lon, lat, sx, sy, x, y, a, sc }
    const figsLayer = document.getElementById('figs');
    let firstFrame = true;
    function syncFigures() {
      const ids = new Set(state.figures.map((c) => c.id));
      for (let i = figs.length - 1; i >= 0; i--) if (!ids.has(figs[i].id)) { figs[i].el.remove(); figs.splice(i, 1); }
      const byId = new Map(figs.map((f) => [f.id, f]));
      const next = state.figures.map((c, i) => {
        let f = byId.get(c.id);
        if (!f) {
          const el = document.createElement('div');
          el.className = 'fig';
          figsLayer.append(el);
          f = { id: c.id, el, seenAt: firstFrame ? -100 : performance.now() / 1000, sx: 0, sy: 0, x: 0, y: 0, a: 0, sc: 1, lon: 0, lat: 0 };
          whenLoaded(c.picture, () => { el.style.backgroundImage = `url("${c.picture}")`; wake(); });
        }
        f.lon = c.lon; f.lat = c.lat;
        f.el.style.borderColor = CALLER_CSS[i % 5];
        return f;
      });
      figs.length = 0; figs.push(...next);
      wake();
    }

    // ---------- lights: DOM silhouettes + per-light state ----------
    const lightsLayer = document.createElement('div');
    lightsLayer.id = 'lights';
    figsLayer.before(lightsLayer);
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:var(--hk-sea)';
    lightsLayer.before(veil);
    const callT = []; // caller index -> time its call went out
    let lts = []; // { lon, lat, caller, tl, slot, seed, hx, hy, gx, gy, x, y, a, sc, pulse, glow, el, ie, url, loadAt, req }
    function syncLights() {
      for (const l of lts) l.el.remove();
      const src = state.lights.slice(0, MAX_LIGHTS);
      const maxOrder = src.reduce((m, l) => Math.max(m, l.order), 0);
      lts = src.map((l, i) => {
        const el = document.createElement('div');
        el.className = 'lt';
        el.style.setProperty('--c', CALLER_CSS[l.caller % 5]);
        const ie = document.createElement('i');
        el.append(ie);
        lightsLayer.append(el);
        return {
          lon: l.lon, lat: l.lat, caller: l.caller, order: l.order, tl: 0, slot: 0, seed: hashSeed(`${i}:${l.caller}`),
          hx: 0, hy: 0, gx: 0, gy: 0, x: -9999, y: -9999, a: 0, sc: 1, pulse: 0, glow: 0, ta: 0, tx: 0, ty: 0, el, ie, url: l.silhouette, req: false,
        };
      });
      // Each caller's friends answer in their own order, spread over CALL_S from the moment the player taps that caller.
      for (let c = 0; c < 5; c++) {
        const mine = lts.filter((l) => l.caller === c).sort((a, b) => a.order - b.order);
        mine.forEach((l, k) => { l.tl = (k / Math.max(1, mine.length)) * CALL_S; });
      }
      for (const l of lts) requestSilhouette(l); // all at once: a skipped wave must not leave blank discs
      callT.length = 0;
      par.done = false;
      rebuildGroups();
    }
    // Silhouettes load in the order the wave needs them, a little before they light (same URL: one request).
    function requestSilhouette(l) {
      if (l.req || !l.url) return;
      l.req = true;
      whenLoaded(l.url, () => { l.ie.style.backgroundImage = `url("${l.url}")`; });
    }
    function pumpSilhouettes(all) {
      for (const l of lts) if (!l.req && (all || callT[l.caller] !== undefined)) requestSilhouette(l);
    }

    // ---------- groups and the parade road ----------
    let groups = []; // { c, fig (index or -1), lights: [idx] }
    let members = []; // global parade order: figure, its lights, next figure, ...
    function rebuildGroups() {
      const callers = Array.from(new Set([...figs.map((_, i) => i), ...lts.map((l) => l.caller)])).sort((a, b) => a - b);
      groups = callers.map((c, gi) => {
        const ls = [];
        lts.forEach((l, i) => { if (l.caller === c) { l.slot = ls.length; ls.push(i); } });
        return { c, gi, fig: figs[c] ? c : -1, lights: ls };
      });
      members = [];
      groups.forEach((g) => {
        if (g.fig >= 0) members.push({ g, fig: true, i: g.fig, seed: 7 + g.gi * 31, x: 0, y: 0, a: 0, sc: 1 });
        g.lights.forEach((li) => members.push({ g, fig: false, i: li, seed: lts[li].seed, x: 0, y: 0, a: 0, sc: 1 }));
      });
      roadKey = '';
      wake();
    }
    // The road: through the chosen yokai's places in the order chosen, then to the player's town.
    let road = { pts: [], cum: [0], total: 0 };
    let roadKey = '';
    function buildRoad() {
      const key = JSON.stringify([state.figures.map((f) => [f.lon, f.lat]), state.pin]);
      if (key === roadKey) return;
      roadKey = key;
      const pts = state.figures.map((f) => ({ lon: f.lon, lat: f.lat }));
      if (state.pin) pts.push({ lon: state.pin.lon, lat: state.pin.lat });
      if (!pts.length) pts.push({ lon: LON0, lat: LAT0 });
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(projX(pts[k].lon) - projX(pts[k - 1].lon), projY(pts[k].lat) - projY(pts[k - 1].lat)));
      road = { pts, cum, total: cum[cum.length - 1] };
    }
    function roadPoint(arc, out) {
      const { pts, cum } = road;
      if (arc <= 0 || pts.length === 1) { out[0] = pts[0].lon; out[1] = pts[0].lat; return out; }
      for (let k = 1; k < pts.length; k++) {
        if (arc <= cum[k]) {
          const seg = cum[k] - cum[k - 1] || 1, t = (arc - cum[k - 1]) / seg;
          out[0] = lerp(pts[k - 1].lon, pts[k].lon, t); out[1] = lerp(pts[k - 1].lat, pts[k].lat, t);
          return out;
        }
      }
      out[0] = pts[pts.length - 1].lon; out[1] = pts[pts.length - 1].lat;
      return out;
    }

    // ---------- tease bubbles ----------
    const teaseLayer = document.getElementById('teases');
    const bubbles = []; // { id, leaving, el, inner, p1, p2, w, h, x, y, init }
    const mistScreen = new Map(); // id -> { x, y, r } this frame
    const tierOf = (id) => { const m = mists.get(id); return m ? Math.round(m.tier) : 1; };
    const teaseOf = (id) => { const m = state.mists.find((q) => q.id === id); return m && m.tease ? m.tease : ''; };
    // The thought cloud is the shared drawing /hyakki/cloud.svg (viewBox 260x196), inlined so its colour variables
    // work; it is only ever scaled uniformly. Text sits in the box x 50-210, y 46-132, in two lines.
    const K = 0.75, CW = 260 * K, CH = 196 * K;
    const CLOUD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 196" width="' + CW + '" height="' + CH + '" aria-hidden="true">'
      + '<g fill="var(--cloud-line)"><circle cx="84" cy="58" r="40"/><circle cx="134" cy="48" r="44"/><circle cx="182" cy="64" r="36"/><circle cx="210" cy="96" r="34"/><circle cx="176" cy="124" r="38"/><circle cx="128" cy="132" r="40"/><circle cx="82" cy="124" r="37"/><circle cx="50" cy="92" r="36"/><circle cx="34" cy="160" r="15"/><circle cx="12" cy="184" r="9"/></g>'
      + '<g fill="var(--cloud-paper)"><circle cx="84" cy="58" r="36"/><circle cx="134" cy="48" r="40"/><circle cx="182" cy="64" r="32"/><circle cx="210" cy="96" r="30"/><circle cx="176" cy="124" r="34"/><circle cx="128" cy="132" r="36"/><circle cx="82" cy="124" r="33"/><circle cx="50" cy="92" r="32"/><ellipse cx="130" cy="90" rx="80" ry="46"/><circle cx="34" cy="160" r="11"/><circle cx="12" cy="184" r="5.5"/></g></svg>';
    // Two lines, broken at a natural pause near the middle when there is one.
    function twoLines(text) {
      const chars = [...text];
      if (chars.length <= 8) return [text];
      const mid = chars.length / 2;
      let best = Math.round(mid), bestD = Infinity;
      chars.forEach((c, i) => { if (i > 1 && i < chars.length - 1 && /[\s、。,・]/.test(chars[i - 1]) && Math.abs(i - mid) < bestD) { bestD = Math.abs(i - mid); best = i; } });
      return [chars.slice(0, best).join('').trim(), chars.slice(best).join('').trim()];
    }
    function makeBubble(id, tier) {
      const text = teaseOf(id);
      const el = document.createElement('div');
      el.className = 'hk-tease';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', text);
      el.style.width = `${CW}px`; el.style.height = `${CH}px`; el.style.zIndex = String(tier * 10);
      const inner = document.createElement('div');
      inner.className = 'hk-tease-in';
      inner.style.cssText = `position:relative;width:${CW}px;height:${CH}px`;
      const art = document.createElement('div');
      art.className = 'hk-cloud-art';
      art.innerHTML = CLOUD_SVG;
      const label = document.createElement('span');
      label.style.cssText = `left:${50 * K}px;top:${46 * K}px;width:${160 * K}px;height:${86 * K}px`;
      label.innerHTML = twoLines(text).map((l) => `<span>${l.replace(/[&<>]/g, '')}</span>`).join('');
      inner.append(art, label); el.append(inner);
      el.addEventListener('click', () => { if (state.handlers.mist) send('hyakki-mist', { id }); });
      teaseLayer.append(el);
      return { id, leaving: false, el, inner, art, w: CW, h: CH, x: 0, y: 0, init: false, flip: false };
    }
    function retire(b) {
      if (b.leaving) return;
      b.leaving = true;
      b.inner.className = 'hk-tease-out';
      setTimeout(() => { b.el.remove(); const i = bubbles.indexOf(b); if (i >= 0) bubbles.splice(i, 1); }, 700);
    }
    // Clouds follow the player's view, not a clock: every mist now on screen has one, and a cloud whose mist has
    // left the screen goes. This runs when the mists change and each time the camera comes to rest.
    function inView(id) {
      const m = mistScreen.get(id);
      if (!m) return mistScreen.size === 0;
      return m.x > 0 && m.x < FW && m.y > 0 && m.y < Math.max(canvas.clientHeight - state.inset, 120);
    }
    function teaseTick() {
      for (const b of bubbles) if (!b.leaving && (!teaseOf(b.id) || !inView(b.id))) retire(b);
      const live = bubbles.filter((b) => !b.leaving);
      for (const b of live) b.init = false; // places are picked again for the new view
      const keep = new Set(live.map((b) => b.id));
      const pool = state.mists.filter((m) => m.tease && m.tease.trim() && !keep.has(m.id) && inView(m.id));
      const looked = pool.filter((m) => state.peeked.includes(m.id));
      const rest = pool.filter((m) => !state.peeked.includes(m.id)).sort((a, b) => b.tier - a.tier);
      for (const m of [...looked, ...rest]) bubbles.push(makeBubble(m.id, tierOf(m.id)));
      wake();
    }
    let camKey = '', camRest = 0;
    function watchCamera() {
      const c = current(), key = `${Math.round(c.cx)},${Math.round(c.cy)},${Math.round(c.w)}`;
      if (key === camKey) return;
      const first = !camKey;
      camKey = key;
      if (first) return;
      clearTimeout(camRest);
      camRest = setTimeout(() => { if (state.mists.length) teaseTick(); }, 350);
    }
    let teaseKey = '';
    let teaseFirst = 0;
    function refreshTease() {
      const key = state.mists.map((m) => `${m.id}:${m.tease}`).join('|') + '#' + state.peeked.join(',');
      if (key === teaseKey) return;
      teaseKey = key;
      clearTimeout(teaseFirst);
      document.body.classList.toggle('hk-still', state.still);
      for (const b of [...bubbles]) if (!teaseOf(b.id)) retire(b);
      if (!state.mists.length) return;
      teaseFirst = setTimeout(teaseTick, 400);
    }
    const rects = [];
    const hitRect = (a, b) => a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6 && a.y < b.y + b.h + 6 && b.y < a.y + a.h + 6;
    // Sizes are fixed (the cloud is scaled once), so only transforms are written here. The cloud sits up and to the
    // right of its mist with the tail pointing down-left at it; at an edge it flips so the tail points down-right.
    // The slot (side and height beside the mist) is chosen once, when the cloud appears; after that the cloud is
    // pinned to its mist and moves only when the player moves the map.
    // Mists outside the view each get a puff on the nearest edge.
    const edges = new Map(); // id -> element
    function layoutEdges() {
      const top = 26, left = 26, right = FW - 26, bottom = Math.max(canvas.clientHeight - state.inset, 120) - 26;
      for (const [id, el] of edges) if (!mistScreen.has(id) || inView(id) || !state.handlers.mist) { el.remove(); edges.delete(id); }
      if (!state.handlers.mist) return;
      for (const [id, m] of mistScreen) {
        if (inView(id)) continue;
        let el = edges.get(id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'hk-edge';
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', '画面の外のもやへ動く');
          el.addEventListener('click', () => {
            const o = mists.get(id);
            if (!o) return;
            const q = merc(o.lon, o.lat), c = current(), scale = c.w / Math.max(canvas.clientWidth, 100);
            userMoved = true;
            anim = { t0: performance.now() / 1000, dur: 0.9, from: c, to: { cx: q.x, cy: q.y - (state.inset / 2) * scale, w: c.w } };
            wake();
          });
          teaseLayer.append(el);
          edges.set(id, el);
        }
        const x = Math.min(right, Math.max(left, m.x)), y = Math.min(bottom, Math.max(top, m.y));
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.setProperty('--a', `${Math.atan2(m.y - y, m.x - x)}rad`);
      }
    }
    function layoutBubbles() {
      watchCamera();
      layoutEdges();
      if (!bubbles.length) return;
      rects.length = 0;
      // Clouds keep clear of the yokai already chosen (the town's pin sits under the first of them).
      for (const f of figs) if (Number.isFinite(f.x)) rects.push({ x: f.x - 38, y: f.y - 38, w: 76, h: 76 });
      const tipX = 10 * K, tipY = 186 * K;
      for (const b of bubbles) {
        const m = mistScreen.get(b.id);
        if (!m || b.leaving) { if (!m) b.el.style.visibility = 'hidden'; continue; }
        const w = b.w, h = b.h;
        if (!b.init) {
          b.init = true; b.shown = false;
          // Every mist on screen shows its cloud. Free places are tried first; with none free, the cloud takes
          // the place that stays on screen and overlaps its neighbours (zooming in pulls them apart).
          let fall = null;
          for (let q = 0; q < 14 && !b.shown; q++) {
            const flip = q % 2 === 1, dy = [0, -h * 0.5, h * 0.4, -h * 1.0, h * 0.8, -h * 1.5, h * 1.3][q >> 1];
            const ox = flip ? -m.r * 0.35 - (w - tipX) : m.r * 0.35 - tipX, oy = -m.r * 0.45 - tipY + dy;
            const r = { x: m.x + ox, y: m.y + oy, w, h };
            if (r.x < 4 || r.y < 4 || r.x + w > FW - 4) continue;
            if (!fall) fall = { ox, oy, flip };
            if (rects.some((o) => hitRect(r, o))) continue;
            b.ox = ox; b.oy = oy; b.shown = true;
            b.art.style.transform = flip ? 'scaleX(-1)' : '';
          }
          if (!b.shown && fall) { b.ox = fall.ox; b.oy = fall.oy; b.shown = true; b.art.style.transform = fall.flip ? 'scaleX(-1)' : ''; }
          b.el.style.zIndex = String(tierOf(b.id) * 10);
        }
        b.el.style.visibility = b.shown ? 'visible' : 'hidden';
        if (!b.shown) continue;
        b.x = m.x + b.ox; b.y = m.y + b.oy;
        rects.push({ x: b.x, y: b.y, w, h });
        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
    }

    // ---------- the frame ----------
    let last = performance.now() / 1000;
    let animT = 0;
    let busyUntil = 0;
    const press = { key: null, t: 0 };
    const sm = { last: 'off', t0: 0, fired: false };
    const par = { on: false, t0: 0, fired: false, done: false, w0: 0 };
    const pinS = { key: '', t0: 0 };
    const wake = () => { busyUntil = performance.now() / 1000 + 2; scene.requestRender(); };
    const hop = (seed, t, amp) => -Math.abs(Math.sin(t * 7 + (seed % 100))) * amp;
    const pinPos = [0, 0], roadLL = [0, 0], headLL = [0, 0];
    const lastHits = [];

    function frame() {
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.1);
      last = now;
      resizeFx();
      const W = FW, H = FH;
      const still = state.still;
      const s = Math.min(1.5, Math.max(0.85, Math.min(W, H) / 520));
      if (!still) animT += dt;
      gl.viewport(0, 0, fx.width, fx.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Region tints.
      const camW = current().w;
      const kf = 1 - Math.exp(-dt * 5);
      for (const key of REGION_KEYS) {
        const R = regionPrims[key];
        let fa;
        // In the whole-country view the regions are tinted; once the map is zoomed in (the parade arriving) the tint fades.
        if (state.view === 'japan') fa = lerp(0.08, 0.4, smooth((camW / (jmax.x - jmin.x) - 0.35) / 0.9)); else if (state.view === key) fa = 0.08; else fa = 0.03;
        if (press.key === key) fa += 0.35 * Math.max(0, 1 - (now - press.t) / 0.5);
        R.fa += (fa - R.fa) * (still ? 1 : kf);
        if (Math.abs(R.fa - R.applied) > 0.003 || R.applied < 0) {
          const ok = applyRegionAlpha(key, R.fa);
          if (!ok || Math.abs(R.fa - fa) > 0.003) busyUntil = Math.max(busyUntil, now + 0.3);
        }
      }

      // Where the chosen yokai are on screen.
      for (const f of figs) { scrInto(f.lon, f.lat, tmpA); f.sx = tmpA[0]; f.sy = tmpA[1]; }

      // ---------- mists ----------
      mistScreen.clear();
      lastHits.length = 0;
      const tierDur = still ? 0.3 : 1;
      for (const [id, o] of mists) {
        const k = smooth((now - o.tierT0) / tierDur);
        o.tier = lerp(o.tierFrom, o.tierTo, k);
        o.appear = o.leaving ? o.appear - dt / (still ? 0.3 : 0.9) : Math.min(1, o.appear + dt / (still ? 0.3 : 1.3));
        if (o.leaving && o.appear <= 0) { mists.delete(id); continue; }
        if (k < 1 || o.appear < 1 || o.leaving) busyUntil = Math.max(busyUntil, now + 0.3);
        scrInto(o.lon, o.lat, tmpA);
        o.x = tmpA[0]; o.y = tmpA[1];
        o.ap = easeOut(o.appear);
        // Ground size (about 7 km / 16 km radius): small enough that the dozen mists of a region stay separate things.
        // The floor keeps one thumb-sized when zoomed out.
        const groundM = o.level === 'place' ? 7000 : 16000;
        const minPx = (o.level === 'place' ? 26 : 44) * s;
        o.vis = Math.min(Math.max(groundM * pxPerMetre(o.lon, o.lat, o.x, o.y), minPx), 150 * s) * (0.8 + 0.2 * o.ap);
        if (!o.leaving && o.appear > 0.35) {
          lastHits.push({ id, x: o.x, y: o.y, hit: Math.max(o.vis * 1.15, 26) });
          mistScreen.set(id, { x: o.x, y: o.y, r: Math.min(o.vis, 160 * s) });
        }
      }

      // ---------- bookkeeping for summon / parade ----------
      const mode = state.summon;
      if (mode !== sm.last) { sm.last = mode; if (mode === 'wave') { sm.t0 = now; sm.fired = false; } if (mode === 'off') { par.done = false; callT.length = 0; } }
      if (state.parade && !par.on) { par.on = true; par.t0 = now; par.fired = false; par.done = false; par.placed = false; par.w0 = current().w; }
      if (!state.parade && par.on) par.on = false;

      const nL = lts.length;
      // Seen from far away (the whole country), the pictures shrink so that they do not bury each other and the map.
      const farK = Math.min(1, Math.max(0.5, 1500 / (current().w / Math.max(canvas.clientWidth, 100))));
      for (const f of figs) {
        f.a = easeOut((now - f.seenAt) / 0.6);
        f.x = f.sx; f.y = f.sy; f.sc = (0.35 + 0.65 * f.a) * farK;
        if (f.a < 1) busyUntil = Math.max(busyUntil, now + 0.3);
      }
      for (const l of lts) {
        scrInto(l.lon, l.lat, tmpA); l.hx = tmpA[0]; l.hy = tmpA[1];
        const f = figs[l.caller];
        if (f) { const ang = l.slot * 2.399963, r = (22 + 9 * Math.sqrt(l.slot)) * s; l.gx = f.sx + Math.cos(ang) * r; l.gy = f.sy + Math.sin(ang) * r; } else { l.gx = l.hx; l.gy = l.hy; }
        l.x = -9999; l.y = -9999; l.a = 0; l.sc = farK; l.pulse = 0; l.glow = 0; l.ta = 0;
      }
      let linkAlpha = 1;
      let roadAlpha = 0, roadHead = 0;
      let marchK = 0;
      const parading = state.parade || par.done;

      if (state.sheet) {
        // The parade's line-up on one map: every friend's home, joined to the town in its caller's colour.
        const pin = state.pin || (figs[0] ? { lon: figs[0].lon, lat: figs[0].lat } : null);
        if (pin) scrInto(pin.lon, pin.lat, pinPos);
        linkAlpha = 0;
        for (const l of lts) { l.glow = 1; l.ta = 0.32; l.tx = pinPos[0]; l.ty = pinPos[1]; pushDot(l.hx, l.hy, 9 * s, CALLER[l.caller % 5], 0.95); }
      } else if (parading) {
        buildRoad();
        const M = members.length;
        const dtm = Math.min(0.03, 2.5 / Math.max(1, M));
        const tEnd = Math.max(10, PARADE_WALK + (M - 1) * dtm + 1);
        let tp = state.parade ? now - par.t0 : tEnd + 10;
        const waiting = M === 0 && !still && state.parade && tp < 3;
        if (waiting) par.t0 = now;
        if (still) tp = tEnd + 10;
        if (state.parade && tp >= tEnd + (still ? 0 : MARCH_S) && !par.fired && !waiting) { par.fired = true; par.done = true; setTimeout(() => send('hyakki-paraded'), 0); }
        linkAlpha = 1 - smooth(tp / 0.8);
        const L = road.total;
        const head = L * smooth(tp / PARADE_WALK);
        roadAlpha = 0.45; roadHead = head;
        // The player's town: where the road ends and the ring forms.
        const pin = state.pin || (figs[0] ? { lon: figs[0].lon, lat: figs[0].lat } : null);
        if (pin) scrInto(pin.lon, pin.lat, pinPos); else { pinPos[0] = W / 2; pinPos[1] = H / 2; }
        const stillRing = still || tp >= tEnd;
        for (let j = 0; j < M; j++) {
          const m = members[j], g = m.g;
          const tau = tp - j * dtm, r = clamp01(tau / PARADE_WALK);
          const arcJoin = g.fig >= 0 ? road.cum[g.fig] : 0;
          let hx, hy;
          if (m.fig) { hx = figs[m.i].sx; hy = figs[m.i].sy; } else { hx = lts[m.i].gx; hy = lts[m.i].gy; }
          let x = hx, y = hy;
          const a0 = 1;
          if (tau > 0) {
            const wob = L * 0.012 * Math.sin(2 * Math.PI * (0.3 * tp + (m.seed % 100) / 100)) * Math.sin(Math.PI * r);
            const arc = Math.min(L, Math.max(0, L * smooth(r) + wob));
            const joined = arc >= arcJoin;
            if (joined) {
              roadPoint(arc, roadLL); scrInto(roadLL[0], roadLL[1], tmpA);
              const b = L > 1e-9 && arcJoin > 0 ? smooth((arc - arcJoin) / (0.04 * L + 1e-9)) : smooth(r * 10);
              x = lerp(hx, tmpA[0], b); y = lerp(hy, tmpA[1], b);
              if (r < 1) {
                // Running about: a hop on every step, a dart sideways and back now and then, and a spin on the spot.
                const run = b * (1 - smooth((r - 0.9) / 0.1));
                y += hop(m.seed, tp, 7 * s) * run;
                const ph = (m.seed % 1000) / 1000, period = 3 + (m.seed % 3);
                const dart = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (tp / period + ph))), 8) * 30 * s * Math.sin(Math.PI * r) * run;
                const da = (m.seed % 628) / 100;
                x += Math.cos(da) * dart; y += Math.sin(da) * dart;
                const spin = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (tp / (5 + (m.seed % 4)) + ph * 3))), 12) * 14 * s * run;
                x += Math.cos(tp * 8) * spin; y += Math.sin(tp * 8) * spin;
              }
            }
          }
          // Everyone ends up circling the town: the chosen yokai on the outside, the ones they called inside.
          const rb = smooth((r - 0.85) / 0.15);
          if (rb > 0 || stillRing) {
            const rad = m.fig ? 108 * s : (42 + (m.seed % 4) * 17) * s;
            const dir = m.fig ? 1 : (m.seed % 2 ? 1 : -1);
            const base = m.fig ? (m.i / Math.max(1, figs.length)) * Math.PI * 2 : (m.seed % 628) / 100;
            const ang = base + (m.fig ? 0.28 : 0.55 + (m.seed % 5) * 0.06) * dir * (still ? 0 : animT);
            const rx = pinPos[0] + Math.cos(ang) * rad, ry = pinPos[1] + Math.sin(ang) * rad * 0.9;
            const k = stillRing ? 1 : rb;
            x = lerp(x, rx, k); y = lerp(y, ry, k);
          }
          // The crossing: everyone darts off to the right, then runs across to the left in one long procession,
          // each chosen yokai ahead of the ones it called. Screen space, not map space: this is the picture scroll.
          let big = 0;
          const tm = tp - tEnd;
          if (tm > 0 && !still) {
            // Large, as if passing just in front of the player: the line is long, so only a part is on screen at a time.
            const span = W * 3.2, gap = span / Math.max(1, M);
            const mx = W + 80 * s + j * gap - tm * ((W + span + 160 * s) / MARCH_S);
            const lane = m.fig ? 0 : ((m.seed % 5) - 2) * 58 * s;
            const my = (H - state.inset) * 0.5 + lane + hop(m.seed, tp, (m.fig ? 18 : 26) * s);
            big = smooth(tm / 0.9);
            x = lerp(x, mx, big); y = lerp(y, my, big);
            marchK = Math.min(big, smooth((MARCH_S - tm) / 0.8));
          }
          m.x = x; m.y = y; m.a = a0;
          if (m.fig) { const f = figs[m.i]; f.x = x; f.y = y; f.sc *= 1 + 2.4 * big; } else if (big > 0) lts[m.i].sc = 1 + 2 * big;
          if (m.fig) { /* placed above */ } else { const l = lts[m.i]; l.x = x; l.y = y; l.a = a0; l.glow = 1; l.ta = 0.14; l.tx = l.gx; l.ty = l.gy; }
        }
        // Camera: one calm move at the start, to a frame that holds the five and the town; no chasing, no dive.
        if (state.parade && !par.placed && figs.length) {
          par.placed = true;
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          const add = (lon, lat) => { const q = merc(lon, lat); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); };
          for (const f of figs) add(f.lon, f.lat);
          if (pin) add(pin.lon, pin.lat);
          const availH = Math.max(H - state.inset, 120);
          const scale = Math.max((x1 - x0) / W, (y1 - y0) / availH, 300) / 0.55; // metres per px; never closer than about 550 m/px
          const to = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (state.inset / 2) * scale, w: W * scale };
          userMoved = false;
          if (still) { anim = null; place(to.cx, to.cy, to.w); } else anim = { t0: now, dur: 1.6, from: current(), to };
        }
        busyUntil = Math.max(busyUntil, now + 0.3);
      } else if (mode === 'wave' || mode === 'on') {
        const wavePlaying = mode === 'wave';
        if (wavePlaying) {
          for (const c of state.called) if (callT[c] === undefined) callT[c] = now;
          const need = groups.filter((g) => g.lights.length).map((g) => g.c);
          const allCalled = nL > 0 && need.every((c) => callT[c] !== undefined);
          const last = allCalled ? Math.max(...need.map((c) => callT[c])) : Infinity;
          if (allCalled && !sm.fired && now - last >= (still ? 0 : CALL_S + WAVE_POP + WAVE_RUN + 0.2)) { sm.fired = true; setTimeout(() => send('hyakki-summoned'), 0); }
          // A chosen yokai that has not called yet beats slowly: tap me.
          for (let i = 0; i < figs.length; i++) if (callT[i] === undefined) pushDot(figs[i].sx, figs[i].sy, 96 * s, CALLER[i % 5], 0.5, still ? 0.5 : (animT / 1.3) % 1);
          busyUntil = Math.max(busyUntil, now + 0.3);
          pumpSilhouettes(false);
        } else pumpSilhouettes(true);
        for (let i = 0; i < nL; i++) {
          const l = lts[i];
          const t0 = callT[l.caller];
          const e = !wavePlaying ? Infinity : t0 === undefined ? -Infinity : still ? Infinity : now - t0 - l.tl;
          // The caller's voice goes out first: a ring spreads from the chosen yokai just before a light answers.
          if (wavePlaying && !still && i % 3 === 0 && e > -0.7 && e < 0.5) {
            const f = figs[l.caller];
            if (f) pushDot(f.sx, f.sy, 70 * s, CALLER[l.caller % 5], 0.45, clamp01((e + 0.7) / 1.2) * 0.98);
          }
          if (e < 0) continue;
          l.glow = 1;
          if (e === Infinity) { l.x = l.gx; l.y = l.gy; l.a = 1; l.ta = 0.16; l.tx = l.gx; l.ty = l.gy; continue; }
          // Lights up at home, then runs to the chosen yokai that called it, leaving a faint line behind.
          l.a = easeOut(e / WAVE_POP);
          if (e < WAVE_POP) { l.x = l.hx; l.y = l.hy; l.pulse = Math.min(0.98, e / WAVE_POP); continue; }
          const u = easeOut((e - WAVE_POP) / WAVE_RUN);
          l.x = lerp(l.hx, l.gx, u); l.y = lerp(l.hy, l.gy, u) + (u < 1 ? hop(l.seed, e, 8 * s) : 0);
          l.ta = 0.26 - 0.1 * u; l.tx = l.x; l.ty = l.y;
          if (u >= 1) { l.tx = l.gx; l.ty = l.gy; const q = e - WAVE_POP - WAVE_RUN; if (q < 0.8) l.pulse = Math.min(0.98, q / 0.8); }
        }
      }

      // ---------- draw: lines ----------
      if (roadAlpha > 0 && road.pts.length > 1) {
        for (let k = 1; k < road.pts.length; k++) {
          const seg = road.cum[k] - road.cum[k - 1];
          const prog = seg > 0 ? clamp01((roadHead - road.cum[k - 1]) / seg) : roadHead >= road.cum[k] ? 1 : 0;
          scrInto(road.pts[k - 1].lon, road.pts[k - 1].lat, tmpA); scrInto(road.pts[k].lon, road.pts[k].lat, tmpB);
          pushSeg(tmpA[0], tmpA[1], tmpB[0], tmpB[1], prog, 1.6 * s, LINE_COLOR, roadAlpha);
        }
      }
      for (let i = 1; i < figs.length; i++) {
        const f = figs[i], p = figs[i - 1];
        const prog = easeOut((now - f.seenAt - 0.15) / 0.9);
        if (prog < 1) busyUntil = Math.max(busyUntil, now + 0.3);
        if (linkAlpha > 0) pushSeg(p.sx, p.sy, f.sx, f.sy, prog, 1.5, LINE_COLOR, 0.8 * linkAlpha);
      }
      for (const l of lts) if (l.ta > 0 && l.glow) pushSeg(l.hx, l.hy, l.tx, l.ty, 1, 1 * s, CALLER[l.caller % 5], l.ta);
      flushSegs();

      // ---------- draw: mists ----------
      for (const o of mists.values()) drawMist(o.seed, o.x, o.y, o.vis / 0.7, tierDensity(o.tier), o.ap, animT);

      // ---------- pin, halos, lights (dots) ----------
      if (state.pin) {
        const key = `${state.pin.lat},${state.pin.lon}`;
        if (key !== pinS.key) { pinS.key = key; pinS.t0 = now; }
        scrInto(state.pin.lon, state.pin.lat, tmpA);
        const drop = Math.max(0, 1 - (now - pinS.t0) / 0.4);
        pushDot(tmpA[0], tmpA[1], 24 * s * (1 + 1.5 * drop * drop), PIN_COLOR, 1, still ? 0 : (animT / 1.6) % 1);
        if (!still) busyUntil = Math.max(busyUntil, now + 0.3);
      } else pinS.key = '';
      pinEl.style.opacity = state.pin ? '1' : '0';
      if (state.pin) { scrInto(state.pin.lon, state.pin.lat, tmpA); pinEl.style.transform = `translate(${tmpA[0]}px, ${tmpA[1]}px) scale(${s})`; }
      for (let i = 0; i < figs.length; i++) { const f = figs[i]; pushDot(f.x, f.y, 52 * s * f.sc, CALLER[i % 5], 0.55 * f.a); }
      for (const l of lts) if (l.glow) pushDot(l.x, l.y, 24 * s * l.sc, CALLER[l.caller % 5], 0.7 * l.a, l.pulse);
      flushDots();

      veil.style.opacity = String(0.62 * marchK);

      // ---------- DOM: pictures and silhouettes ----------
      for (const f of figs) {
        f.el.style.opacity = f.a > 0.01 ? String(f.a) : '0';
        f.el.style.transform = `translate(${f.x}px, ${f.y}px) scale(${(s * f.sc) / 3})`; // drawn at 3x and scaled down, so it stays sharp when it grows
      }
      for (const l of lts) {
        l.el.style.opacity = l.a > 0.01 ? String(l.a) : '0';
        if (l.a > 0.01) l.el.style.transform = `translate(${l.x}px, ${l.y}px) scale(${(s * l.sc * (0.6 + 0.4 * l.a)) / 3})`;
      }

      layoutBubbles(H - state.inset);
      if (!still && (mists.size || bubbles.length)) busyUntil = Math.max(busyUntil, now + 0.3);
      firstFrame = false;
    }
    scene.postRender.addEventListener(frame);

    // Keep drawing while anything moves; sit idle (no frames at all) otherwise.
    (function pump() {
      if (performance.now() / 1000 < busyUntil) scene.requestRender();
      requestAnimationFrame(pump);
    })();
    // Tiles arrive long after the last wake on a slow line; each arrival needs a frame or the map stays blank.
    scene.globe.tileLoadProgressEvent.addEventListener(wake);
    new ResizeObserver(() => { wake(); if (camReady && !userMoved && !state.parade) goView(true); }).observe(canvas);

    // ---------- taps ----------
    const lonLatAt = (pos) => {
      const c = camera.pickEllipsoid(pos, scene.globe.ellipsoid);
      if (!c) return null;
      const g = C.Cartographic.fromCartesian(c);
      return [C.Math.toDegrees(g.longitude), C.Math.toDegrees(g.latitude)];
    };
    const handler = new C.ScreenSpaceEventHandler(canvas);
    handler.setInputAction((click) => {
      const pos = click.position;
      if (state.handlers.figure) {
        let best = -1, bestD = 48;
        figs.forEach((f, i) => { const d = Math.hypot(f.sx - pos.x, f.sy - pos.y); if (d < bestD) { bestD = d; best = i; } });
        if (best >= 0) { send('hyakki-figure', { index: best }); return; }
      }
      if (state.handlers.mist) {
        let best = null, bestD = Infinity;
        for (const h of lastHits) { const d = Math.hypot(h.x - pos.x, h.y - pos.y); if (d <= h.hit && d < bestD) { bestD = d; best = h.id; } }
        if (best) { send('hyakki-mist', { id: best }); return; }
      }
      const ll = lonLatAt(pos);
      if (!ll) return;
      if (state.view === 'japan') {
        if (!state.handlers.region) return;
        // 24 px of slack so a finger just off a small island still counts.
        scrInto(ll[0], ll[1], tmpA);
        const pp = pxPerMetre(ll[0], ll[1], tmpA[0], tmpA[1]);
        const slackDeg = pp > 0 ? 24 / pp / 111320 : 0.1;
        const region = HyakkiGeo.landAt(polys, ll[0], ll[1]) || HyakkiGeo.nearestRegion(polys, ll[0], ll[1], slackDeg);
        if (region) { press.key = region; press.t = performance.now() / 1000; wake(); send('hyakki-region', { region }); }
      } else if (state.handlers.pick) {
        if (HyakkiGeo.landAt(polys, ll[0], ll[1])) send('hyakki-pick', { lat: ll[1], lon: ll[0] });
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    // ---------- messages from the page ----------
    function set(key, value) {
      switch (key) {
        case 'config':
          if (Array.isArray(value.callerColors) && value.callerColors.length >= 5) { CALLER_CSS = value.callerColors; CALLER = value.callerColors.map(hex); }
          if (Number.isFinite(value.waveMs)) WAVE_S = value.waveMs / 1000;
          break;
        case 'view': { const changed = state.view !== value; state.view = value; if (camReady && changed) goView(false); break; }
        case 'pin': state.pin = value; roadKey = ''; break;
        case 'mists':
          state.mists = value || []; reconcileMists(); refreshTease();
          if (!state.mists.length) focus = null;
          else if (!focus) { setFocus(); if (camReady && !userMoved) goView(false); }
          break;
        // A newly chosen yokai may stand where a cloud is: the clouds pick their places again, once.
        case 'figures': state.figures = value || []; syncFigures(); rebuildGroups(); for (const b of bubbles) b.init = false; break;
        case 'lights': state.lights = value || []; syncLights(); break;
        case 'inset': {
          const next = Math.max(0, Number(value) || 0), changed = next !== state.inset, shrank = next < framedInset;
          state.inset = next;
          document.body.style.setProperty('--inset', `${state.inset}px`);
          // A panel growing over the map (a hint opening) never re-frames it: mists must not slide under the player's
          // eyes. Only a panel smaller than the one the map was framed for puts the region back in the free part.
          // The line-up always fits the whole country above its sheet.
          if (camReady && !userMoved && (state.sheet ? changed : shrank && !state.parade && state.summon === 'off')) goView(false);
          else if (changed) wake();
          break;
        }
        case 'still': state.still = !!value; refreshTease(); break;
        case 'called': state.called = value || []; break;
        case 'peeked': state.peeked = value || []; refreshTease(); break;
        case 'sheet': { const on = !!value, changed = on !== state.sheet; state.sheet = on; if (on && changed && camReady) { goView(false); if (anim) anim.dur = 2.2; } break; }
        // While a yokai is being met the mists cannot be tapped, and their clouds step back.
        case 'handlers': state.handlers = value; document.body.classList.toggle('hk-quiet', !(value && value.mist)); break;
        default: state[key] = value;
      }
      wake();
    }
    let ready = false;
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== parent) return;
      const d = event.data;
      if (!d || typeof d.type !== 'string') return;
      if (d.type === 'hyakki-init') { if (ready) send('hyakki-ready'); return; }
      if (d.type === 'hyakki-set' && typeof d.key === 'string') {
        if (d.key === 'view' && !camReady) { state.view = d.value; camReady = true; goView(true); showBorders(); return; }
        set(d.key, d.value);
        showBorders(); wake();
      }
    });
    state.still = reducedMotionQuery.matches;
    window.addEventListener('pagehide', () => { handler.destroy(); viewer.destroy(); }, { once: true });
    ready = true;
    send('hyakki-ready');
  }
})();
