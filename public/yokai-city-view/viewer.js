/* Isolated Cesium runtime: no dependency or global-style changes to the Next app.
 * PLATEAU source: https://www.mlit.go.jp/plateau/learning/tpc07-2/
 */
(() => {
  'use strict';
  const status = document.getElementById('status');
  const send = (type, extra = {}) => parent.postMessage({ type, ...extra }, location.origin);
  try {
    const C = window.Cesium;
    if (!C) throw new Error('Cesium unavailable');
    const viewer = new C.Viewer('map', {
      baseLayer: false, baseLayerPicker: false, geocoder: false,
      animation: false, timeline: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      // A flat map of pins needs no multisampling or sky; both cost fill rate on integrated GPUs.
      msaaSamples: 1, skyBox: false,
    });
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Few cores or little memory: draw fewer pixels and coarser tiles, and skip the opening flight.
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) < 4;
    if (lowPower) {
      viewer.resolutionScale = .75;
      viewer.scene.globe.maximumScreenSpaceError = 4;
      viewer.scene.globe.tileCacheSize = 60;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.fog.enabled = false;
    }
    document.body.dataset.lowPower = String(lowPower);
    const journeySource=new C.CustomDataSource('journey-trail');viewer.dataSources.add(journeySource);
    function drawJourney(stops,fit){
      journeySource.entities.removeAll();
      const valid=stops.filter(s=>Array.isArray(s.coordinates)&&s.coordinates.length>=2&&s.coordinates.slice(0,2).every(Number.isFinite)&&Math.abs(s.coordinates[1])<=90&&Math.abs(s.coordinates[0])<=180);
      document.body.classList.toggle('journey-active',valid.length>0);
      const positions=valid.map(s=>C.Cartesian3.fromDegrees(s.coordinates[0],s.coordinates[1],50));
      if(positions.length>1)journeySource.entities.add({polyline:{positions,width:4,clampToGround:true,material:new C.PolylineGlowMaterialProperty({glowPower:.18,color:C.Color.fromCssColorString('#ffc969')})}});
      const shown=new Set();valid.forEach((stop,i)=>{const key=stop.coordinates.slice(0,2).join(',');if(shown.has(key))return;shown.add(key);const entity=journeySource.entities.add({position:positions[i],point:{pixelSize:11,color:C.Color.fromCssColorString('#ffcd74'),outlineColor:C.Color.fromCssColorString('#3a2c18'),outlineWidth:2,disableDepthTestDistance:Infinity},label:{text:String(i+1),font:'bold 13px sans-serif',fillColor:C.Color.fromCssColorString('#fff1cd'),outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-19),disableDepthTestDistance:Infinity}});entity.recordId=stop.id;});
      viewer.scene.requestRender();
      if(fit&&positions.length){cancelIntro();const sphere=C.BoundingSphere.fromPoints(positions);const vertical=viewer.camera.frustum.fovy;const horizontal=2*Math.atan(Math.tan(vertical/2)*viewer.scene.canvas.clientWidth/Math.max(1,viewer.scene.canvas.clientHeight));const range=Math.max(18000,sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.25);viewer.camera.flyToBoundingSphere(sphere,{offset:new C.HeadingPitchRange(0,-Math.PI/2,range),duration:reducedMotion?0:1.5});}
      document.body.dataset.journeyStops=String(valid.length);
    }
    // Story race: the offered stories as lettered pins, the target, and an optional second route.
    // Most stories sit on a prefecture centroid, so pins on one spot fan their labels out in screen space.
    const raceSource=new C.CustomDataSource('story-race');viewer.dataSources.add(raceSource);
    const validStop=s=>s&&Array.isArray(s.coordinates)&&s.coordinates.length>=2&&s.coordinates.slice(0,2).every(Number.isFinite)&&Math.abs(s.coordinates[1])<=90&&Math.abs(s.coordinates[0])<=180;
    function drawRace(race){
      raceSource.entities.removeAll();
      if(!race){viewer.scene.requestRender();return;}
      const all=[];
      const candidates=(race.candidates||[]).filter(validStop);
      const spots=new Map();candidates.forEach(c=>{const k=c.coordinates.slice(0,2).join(',');spots.set(k,(spots.get(k)||0)+1);});
      const seen=new Map();
      candidates.forEach(c=>{
        const k=c.coordinates.slice(0,2).join(',');const total=spots.get(k);const i=seen.get(k)||0;seen.set(k,i+1);
        const angle=total>1?(i/total)*Math.PI*2-Math.PI/2:-Math.PI/2;const radius=total>1?34:22;
        const position=C.Cartesian3.fromDegrees(c.coordinates[0],c.coordinates[1],60);all.push(position);
        const e=raceSource.entities.add({position,point:{pixelSize:16,color:C.Color.fromCssColorString('#7fd3ff'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Infinity},
          label:{text:c.card?c.label:`${c.label} ${c.name||''}`,font:'bold 15px sans-serif',fillColor:C.Color.fromCssColorString('#eaf7ff'),showBackground:true,backgroundColor:C.Color.fromCssColorString('#10283acc'),pixelOffset:new C.Cartesian2(Math.cos(angle)*radius,Math.sin(angle)*radius),disableDepthTestDistance:Infinity}});
        e.recordId=c.id;
      });
      if(validStop(race.target)){const t=race.target;const position=C.Cartesian3.fromDegrees(t.coordinates[0],t.coordinates[1],60);all.push(position);
        const e=raceSource.entities.add({position,point:{pixelSize:16,color:C.Color.fromCssColorString('#ff6f61'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Infinity},
          label:{text:`目的 ${t.name||''}`,font:'bold 13px sans-serif',fillColor:C.Color.WHITE,showBackground:true,backgroundColor:C.Color.fromCssColorString('#7a2119cc'),pixelOffset:new C.Cartesian2(0,26),disableDepthTestDistance:Infinity}});e.recordId=t.id;}
      // Detour prefectures: a pin at the prefecture's representative point, grey once visited.
      (race.detours||[]).filter(validStop).forEach(d=>{const position=C.Cartesian3.fromDegrees(d.coordinates[0],d.coordinates[1],60);all.push(position);
        raceSource.entities.add({position,point:{pixelSize:18,color:C.Color.fromCssColorString(d.done?'#8a8a80':'#f0a030'),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Infinity},
          label:{text:`${d.done?'✓ ':''}寄り道 ${d.name||''}`,font:'bold 13px sans-serif',fillColor:C.Color.WHITE,showBackground:true,backgroundColor:C.Color.fromCssColorString(d.done?'#4a4a44cc':'#7a4a10cc'),pixelOffset:new C.Cartesian2(0,30),disableDepthTestDistance:Infinity}});});
      const compare=(race.compare||[]).filter(validStop);
      if(compare.length>1){const positions=compare.map(s=>C.Cartesian3.fromDegrees(s.coordinates[0],s.coordinates[1],50));positions.forEach(p=>all.push(p));
        raceSource.entities.add({polyline:{positions,width:3,clampToGround:true,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#7fd3ff')})}});}
      (race.frame||[]).filter(validStop).forEach(f=>all.push(C.Cartesian3.fromDegrees(f.coordinates[0],f.coordinates[1],60)));
      if(validStop(race.here))all.push(C.Cartesian3.fromDegrees(race.here.coordinates[0],race.here.coordinates[1],60));
      viewer.scene.requestRender();
      raceFixed=[race.target,...(race.detours||[])].filter(validStop).map(t=>C.Cartesian3.fromDegrees(t.coordinates[0],t.coordinates[1],60));
      buildRaceCards(candidates.filter(c=>c.card));
      if(race.fit&&all.length){cancelIntro();const sphere=C.BoundingSphere.fromPoints(all);const vertical=viewer.camera.frustum.fovy;const horizontal=2*Math.atan(Math.tan(vertical/2)*viewer.scene.canvas.clientWidth/Math.max(1,viewer.scene.canvas.clientHeight));const range=Math.max(raceCards.length?400000:60000,sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*(raceCards.length?1.9:1.3));viewer.camera.flyToBoundingSphere(sphere,{offset:new C.HeadingPitchRange(0,-Math.PI/2,range),duration:reducedMotion?0:1.2});}
    }
    // Offered stories as cards on the map, beside their pins. Cards start fanned around their
    // pin and are pushed apart until none overlap or covers a pin; a line ties each card to its pin.
    const raceLines=document.createElementNS('http://www.w3.org/2000/svg','svg');raceLines.id='race-lines';
    const raceLayer=document.createElement('div');raceLayer.id='race-cards';raceLayer.setAttribute('aria-label','地図上の候補');
    document.body.append(raceLines,raceLayer);
    let raceCards=[];let raceDirty=false;let raceFixed=[];
    function buildRaceCards(list){
      raceLayer.replaceChildren();
      raceCards=list.map(c=>{
        const d=c.card;const el=document.createElement('button');el.type='button';
        el.className='race-card'+(d.target?' target':'')+(d.locked?' locked':'');
        const head=document.createElement('span');head.className='head';
        const letter=document.createElement('span');letter.className='letter';letter.textContent=c.label;
        const name=document.createElement('strong');name.textContent=c.name||'';
        const place=document.createElement('span');place.className='place';place.textContent=`${d.place||''} +${Number(d.km||0).toLocaleString()}km`;
        head.append(letter,name,place);
        if(d.detour){const tag=document.createElement('span');tag.className='detour';tag.textContent='寄り道の県';head.append(tag);}
        el.append(head);
        if(d.note){const note=document.createElement('span');note.className='note-line';note.textContent=d.note;el.append(note);}
        const text=document.createElement('span');text.className='text';
        if(d.word){text.append(d.before||'');const mark=document.createElement('mark');mark.textContent=d.word;text.append(mark,d.after||'');}
        else text.textContent=d.excerpt||'';
        el.append(text);
        if(d.landscape){const l=document.createElement('span');l.className='landscape';l.textContent=d.landscape;el.append(l);}
        el.addEventListener('click',()=>{cancelIntro();send('yokai-city-select',{id:c.id});});
        raceLayer.append(el);
        return {el,position:C.Cartesian3.fromDegrees(c.coordinates[0],c.coordinates[1],60)};
      });
      raceDirty=true;viewer.scene.requestRender();
    }
    function renderRaceCards(){
      if(!raceDirty)return;raceDirty=false;
      raceLines.replaceChildren();
      if(!raceCards.length)return;
      const W=viewer.scene.canvas.clientWidth,H=viewer.scene.canvas.clientHeight,gap=8;
      const items=raceCards.map(r=>{const p=viewer.scene.cartesianToCanvasCoordinates(r.position);return {...r,p,w:r.el.offsetWidth,h:r.el.offsetHeight};}).filter(r=>r.p);
      // Greedy placement: each card tries slots around its pin, nearest ring first, and takes the
      // first one inside the map that covers no placed card and no pin; else the least covered.
      const boxes=raceFixed.map(f=>viewer.scene.cartesianToCanvasCoordinates(f)).filter(Boolean).map(q=>({x:q.x,y:q.y+16,w:150,h:52}));const pins=items.map(r=>r.p);
      const cover=(x,y,w,h)=>{let a=0;for(const b of boxes){const ox=Math.min(x+w/2,b.x+b.w/2)-Math.max(x-w/2,b.x-b.w/2)+gap,oy=Math.min(y+h/2,b.y+b.h/2)-Math.max(y-h/2,b.y-b.h/2)+gap;if(ox>0&&oy>0)a+=ox*oy;}
        for(const q of pins)if(Math.abs(q.x-x)<w/2+10&&Math.abs(q.y-y)<h/2+10)a+=4000;
        const out=Math.max(0,w/2+gap-x)+Math.max(0,x+w/2+gap-W)+Math.max(0,h/2+gap-y)+Math.max(0,y+h/2+gap-H);return a+out*400;};
      const angles=[-90,-45,-135,0,180,45,135,90].map(d=>d*Math.PI/180);
      items.sort((a,b)=>a.p.y-b.p.y);
      for(const r of items){
        let best=null;
        for(const ring of [1,1.8,2.6,3.4])for(const a of angles){
          const x=r.p.x+Math.cos(a)*(r.w/2+18)*ring,y=r.p.y+Math.sin(a)*(r.h/2+18)*ring;const c=cover(x,y,r.w,r.h);
          if(!best||c<best.c)best={x,y,c};if(c===0)break;
        }
        r.x=best.x;r.y=best.y;boxes.push({x:r.x,y:r.y,w:r.w,h:r.h});
      }
      for(const r of items){
        r.el.style.left=`${r.x-r.w/2}px`;r.el.style.top=`${r.y-r.h/2}px`;
        const ex=Math.min(Math.max(r.p.x,r.x-r.w/2),r.x+r.w/2),ey=Math.min(Math.max(r.p.y,r.y-r.h/2),r.y+r.h/2);
        const line=document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1',r.p.x);line.setAttribute('y1',r.p.y);line.setAttribute('x2',ex);line.setAttribute('y2',ey);raceLines.append(line);
      }
    }
    viewer.camera.changed.addEventListener(()=>{if(raceCards.length)raceDirty=true;});
    viewer.scene.postRender.addEventListener(renderRaceCards);
    new ResizeObserver(()=>{raceDirty=true;viewer.scene.requestRender();}).observe(viewer.scene.canvas);
    const controlsObserver = new ResizeObserver(entries => {
      document.body.style.setProperty('--controls-bottom', `${entries[0].target.getBoundingClientRect().bottom + 2}px`);
    });
    controlsObserver.observe(document.querySelector('.controls'));
    const perspective = document.getElementById('perspective');
    let introTimer;
    const cancelIntro = () => { clearTimeout(introTimer); viewer.camera.cancelFlight(); };
    const fly = (lon, lat, range, pitch = Number(perspective.value)) => {
      cancelIntro();
      viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(lon, lat), 1), {
      offset: new C.HeadingPitchRange(0, C.Math.toRadians(pitch), range),
      duration: reducedMotion ? 0 : 1.2,
      });
    };
    let worldLayer;
    // A low-resolution globe remains below the Japan-only detailed imagery.
    C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl('Assets/Textures/NaturalEarthII'))
      .then(provider => { if (!viewer.isDestroyed()) { worldLayer = viewer.imageryLayers.addImageryProvider(provider, 0); viewer.scene.requestRender(); } })
      .catch(error => console.warn('Globe imagery unavailable', error));
    let baseLayer;
    let backgroundGeneration = 0;
    const setBackground = () => {
      const generation = ++backgroundGeneration;
      const background = document.getElementById('background').value;
      const photo = background === 'seamlessphoto';
      const osm = background === 'osm';
      status.textContent = '';
      if (baseLayer) viewer.imageryLayers.remove(baseLayer);
      const provider = new C.UrlTemplateImageryProvider({
        url: osm ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : `https://cyberjapandata.gsi.go.jp/xyz/${background}/{z}/{x}/{y}.${photo ? 'jpg' : 'png'}`,
        minimumLevel: osm ? 0 : 2, maximumLevel: 18,
        rectangle: osm ? undefined : C.Rectangle.fromDegrees(122, 20, 154, 46),
        credit: new C.Credit(osm ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' : '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' + (photo ? ' · Landsat8 (GSI, TSIC, GEO Grid/AIST, USGS) · GEBCO · 世界衛星モザイク画像 (NASA LP DAAC / USGS EROS) · GRUS画像（© Axelspace）' : '')),
      });
      provider.errorEvent.addEventListener(() => { if (generation === backgroundGeneration) status.textContent = '背景地図の一部を取得できません。別の背景に切り替えてご利用ください。'; });
      baseLayer = viewer.imageryLayers.addImageryProvider(provider, worldLayer ? 1 : 0);
      viewer.scene.requestRender();
    };
    document.getElementById('background').addEventListener('change', setBackground);
    setBackground();
    // Use HTTPS XYZ tiles instead of the legacy KML's HTTP NetworkLink.
    // Bounds and title come from Map Warper map 4907 (the original prototype).
    const edoBounds = C.Rectangle.fromDegrees(139.72622998785428, 35.642220906573385, 139.78001585721736, 35.67775506978166);
    const edoToggle = document.getElementById('edo');
    let edoLayer;
    const visitEdo = () => fly(139.7531, 35.66, 7500);
    edoToggle.addEventListener('change', () => {
      if (!edoLayer && edoToggle.checked) {
        const provider = new C.UrlTemplateImageryProvider({
          url: 'https://mapwarper.h-gis.jp/maps/tile/4907/{z}/{x}/{y}.png',
          rectangle: edoBounds, maximumLevel: 18,
          credit: new C.Credit('<a href="https://mapwarper.h-gis.jp/maps/4907" target="_blank" rel="noopener">芝愛宕下絵図（1850） / 日本版Map Warper / 国立国会図書館</a>'),
        });
        provider.errorEvent.addEventListener(() => { status.textContent = '古地図の一部を取得できません。古地図をオフにして現代地図を続けられます。'; });
        edoLayer = viewer.imageryLayers.addImageryProvider(provider);
      }
      if (edoLayer) {
        edoLayer.show = edoToggle.checked;
        edoLayer.alpha = Number(document.getElementById('edo-opacity').value) / 100;
      }
      document.querySelector('.opacity').hidden = !edoToggle.checked;
      document.getElementById('edo-credit').hidden = !edoToggle.checked;
      viewer.scene.requestRender();
    });
    document.getElementById('edo-opacity').addEventListener('input', event => {
      const value = Number(event.target.value);
      if (edoLayer) edoLayer.alpha = value / 100;
      document.getElementById('edo-opacity-value').textContent = `${value}%`;
      viewer.scene.requestRender();
    });
    const visitTokyo = () => fly(139.76, 35.68, 42000);
    perspective.addEventListener('change', () => {
      const canvas = viewer.scene.canvas;
      const target = viewer.camera.pickEllipsoid(new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
      if (!target) return;
      const location = C.Cartographic.fromCartesian(target);
      fly(C.Math.toDegrees(location.longitude), C.Math.toDegrees(location.latitude), C.Cartesian3.distance(target, viewer.camera.positionWC));
    });
    const startJourney = () => {
      cancelIntro();
      if (reducedMotion || lowPower) { viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(139.76, 35.68, 42000), orientation: { heading: 0, pitch: C.Math.toRadians(Number(perspective.value)), roll: 0 } }); return; }
      viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(139.76, 20, 22000000), orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
      introTimer = setTimeout(() => {
        viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(139.76, 35.68), 1), {
          offset: new C.HeadingPitchRange(0, C.Math.toRadians(Number(perspective.value)), 42000), duration: 4,
        });
      }, 1100);
    };
    viewer.scene.canvas.addEventListener('pointerdown', cancelIntro);
    viewer.scene.canvas.addEventListener('wheel', cancelIntro, { passive: true });
    document.querySelector('.controls').addEventListener('pointerdown', cancelIntro);
    document.querySelector('.controls').addEventListener('keydown', cancelIntro);
    startJourney();

    let buildings;
    let buildingsLoading = false;
    const toggle = document.getElementById('buildings');
    toggle.addEventListener('change', async () => {
      if (buildings) {
        buildings.show = toggle.checked;
        viewer.scene.requestRender();
        return;
      }
      if (!toggle.checked || buildingsLoading) return;
      buildingsLoading = true;
      status.textContent = '港区のPLATEAU建物を読み込み中…';
      try {
        buildings = await C.Cesium3DTileset.fromUrl('https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo/13103_minato-ku/low_resolution/tileset.json', {
          maximumScreenSpaceError: 24,
          credit: new C.Credit('<a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">PLATEAU（国土交通省）</a> · CC BY 4.0'),
        });
        viewer.scene.primitives.add(buildings);
        buildings.show = toggle.checked;
        buildings.tileFailed.addEventListener(() => { status.textContent = '一部の建物を読み込めませんでした。PLATEAUをオフにして地図を続けられます。'; });
        status.textContent = 'PLATEAUは港区の建物です。東京の南側を拡大し、視点を「斜め」にすると立体的に見られます。';
        viewer.scene.requestRender();
      } catch (error) {
        console.warn('PLATEAU load failed', error);
        toggle.checked = false;
        status.textContent = 'PLATEAUを取得できませんでした。もう一度オンにすると再試行できます。';
      } finally { buildingsLoading = false; }
    });

    const pins = viewer.scene.primitives.add(new C.PointPrimitiveCollection());
    const markers = document.getElementById('markers');
    const density = document.getElementById('density');
    const densityContext = density.getContext('2d');
    let groups = [];
    let pictured = [];   // groups with a picture: the only ones the overlay looks at unless names or density are on
    let options = {};
    let overlayDirty = true;
    const imageElements = new Map();
    function renderOverlays() {
      if (!overlayDirty) return;
      overlayDirty = false;
      const width = viewer.scene.canvas.clientWidth;
      const height = viewer.scene.canvas.clientHeight;
      density.width = width;
      density.height = height;
      density.hidden = !options.density;
      const occluder = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, viewer.camera.positionWC);
      const candidates = [];
      const heatPoints = [];
      const visible = new Set();

      for (const group of (options.density || options.names ? groups : options.images ? pictured : [])) {
        if (!occluder.isPointVisible(group.position)) continue;
        const point = viewer.scene.cartesianToCanvasCoordinates(group.position);
        if (!point || point.x < -50 || point.y < -50 || point.x > width + 50 || point.y > height + 50) continue;
        if (options.density && densityContext) {
          heatPoints.push({x:point.x,y:point.y,count:group.count});
        }
        if (!(options.images && group.image) && !options.names) continue;
        candidates.push({...group, x: point.x, y: point.y});
      }
      if (options.density && densityContext) YokaiHeatmap.render(densityContext,width,height,heatPoints);
      const placed = YokaiMarkerLayout.layout(candidates, {width, height, altitude: viewer.camera.positionCartographic.height, selectedId: options.selectedId});
      for (const group of placed) {
        const {x, y, size} = group;
        visible.add(group.key);
        let button = imageElements.get(group.key);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'yokai-orb';
          button.dataset.recordId = group.id;
          button.setAttribute('aria-label', `${group.name}を見る`);
          button.addEventListener('click', () => { cancelIntro(); send('yokai-city-select', { id: group.id }); });
          if (options.images && group.image) {
            const image = document.createElement('img');
            image.src = group.image;
            image.alt = '';
            image.referrerPolicy = 'no-referrer';
            image.addEventListener('error', () => { image.remove(); button.classList.add('no-image'); });
            button.append(image);
          } else button.classList.add('no-image');
          const label = document.createElement('span');
          label.textContent = String(group.name).split(/[；;，,、]/).map(value => value.replace(/[（(]俗信[）)]/g, '').trim()).find(Boolean) || '名前のない妖怪';
          button.append(label);
          markers.append(button);
          imageElements.set(group.key, button);
        }
        button.style.width = `${options.images && group.image ? size : 17}px`;
        button.style.height = `${options.images && group.image ? size : 17}px`;
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
      }
      for (const [key, element] of imageElements) if (!visible.has(key)) { element.remove(); imageElements.delete(key); }
    }
    const removeCameraListener = viewer.camera.changed.addEventListener(() => { overlayDirty = true; });
    viewer.camera.percentageChanged = .001;
    const removePostRender = viewer.scene.postRender.addEventListener(renderOverlays);
    const viewportObserver = new ResizeObserver(() => { overlayDirty = true; viewer.scene.requestRender(); });
    viewportObserver.observe(viewer.scene.canvas);
    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(event => {
      const picked = viewer.scene.pick(event.position);
      const entity = picked?.id;
      if (entity?.recordId) send('yokai-city-select', { id: entity.recordId });
      else if (Array.isArray(entity) && entity.length) {
        // Cluster clicks zoom in; a record click opens the existing details panel.
        const position = entity[0].position?.getValue(viewer.clock.currentTime);
        if (position) {
          const cartographic = C.Cartographic.fromCartesian(position);
          fly(C.Math.toDegrees(cartographic.longitude), C.Math.toDegrees(cartographic.latitude), Math.max(800, viewer.camera.positionCartographic.height / 3), -90);
        }
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent) return;
      const data = event.data;
      if(data?.type==='yokai-city-settings'&&data.options){
        const o=data.options;
        for(const [id,value] of [['background',o.background],['perspective',o.perspective],['edo',o.edo],['buildings',o.buildings],['edo-opacity',o.opacity]]){const el=document.getElementById(id);if(!el)continue;const key=el.type==='checkbox'?'checked':'value';if(el[key]===value)continue;el[key]=value;el.dispatchEvent(new Event(id==='edo-opacity'?'input':'change'));}return;
      }
      if(data?.type==='yokai-city-edo-visit'){if(edoToggle.checked)visitEdo();return;}
      if(data?.type==='yokai-city-trail'&&Array.isArray(data.stops)){drawJourney(data.stops,Boolean(data.fit));return;}
      if(data?.type==='yokai-city-race'){drawRace(data.race||null);return;}
      if (data?.type === 'yokai-city-init') send('yokai-city-ready');
      if (data?.type === 'yokai-city-focus' && Array.isArray(data.coordinates) && data.coordinates.slice(0, 2).every(Number.isFinite)) {
        fly(data.coordinates[0], data.coordinates[1], Number.isFinite(data.range) ? Math.max(500, data.range) : 18000);
      }
      if (data?.type === 'yokai-city-options') {
        // Toggles and the selection: no record is rebuilt.
        const before = options;
        options = { ...options, points: data.points, names: data.names, images: data.images, density: data.density, selectedId: data.selectedId };
        if (Boolean(before.points) !== Boolean(options.points)) for (let i = 0; i < pins.length; i++) pins.get(i).show = Boolean(options.points);
        if (Boolean(before.images) !== Boolean(options.images) || Boolean(before.names) !== Boolean(options.names)) { markers.replaceChildren(); imageElements.clear(); }
        overlayDirty = true;
        viewer.scene.requestRender();
        return;
      }
      if (data?.type !== 'yokai-city-records' || !Array.isArray(data.records)) return;
        pins.removeAll();
        if ('points' in data) options = data;
        markers.replaceChildren();
        imageElements.clear();
        const colors = new Map();
        const colorOf = css => { let c = colors.get(css); if (!c) { c = C.Color.fromCssColorString(css) || C.Color.GOLD; colors.set(css, c); } return c; };
        groups = data.records.filter(record => {
          const [lon, lat] = record.coordinates || [];
          return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
        }).map(record => ({ ...record, key: String(record.id), count: 1,
          position: C.Cartesian3.fromDegrees(record.coordinates[0], record.coordinates[1], 30) }));
        pictured = groups.filter(group => group.image);
        for (const record of groups) {
          pins.add({
            position: record.position,
            id: { recordId: String(record.id) },
            show: Boolean(options.points), pixelSize: 10, color: colorOf(record.color), outlineColor: C.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Infinity,
          });
        }
      overlayDirty = true;
      viewer.scene.requestRender();
    });
    window.addEventListener('pagehide', () => { clearTimeout(introTimer); controlsObserver.disconnect(); viewportObserver.disconnect(); removeCameraListener(); removePostRender(); handler.destroy(); viewer.destroy(); }, { once: true });
    status.textContent = '';
    send('yokai-city-ready');
  } catch (error) {
    console.error(error);
    status.textContent = '地図を開始できません。再読み込みしてお試しください。';
    send('yokai-city-error');
  }
})();
