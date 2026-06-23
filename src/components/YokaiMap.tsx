'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap, Popup } from 'maplibre-gl';

type ViewMode = 'points' | 'density' | 'terrain';

type YokaiProperties = {
  id: string | null;
  name: string | null;
  major_category: string | null;
  phenomenon: string | null;
  prefecture: string | null;
  admin2: string | null;
  geo_level: string | null;
  geocoded_place: string | null;
  geocode_method: string | null;
  geocode_source: string | null;
  dist_water_km: number | null;
  dist_coast_km: number | null;
  terrain_class: string | null;
  terrain_coord_only: string | null;
  terrain_text_aware: string | null;
  pref_area_km2: number | null;
  pref_coastline_km_per_1000km2: number | null;
  pref_river_km_per_1000km2: number | null;
  pref_lake_area_pct: number | null;
  admin2_area_km2: number | null;
  admin2_coastline_km_per_1000km2: number | null;
  admin2_river_km_per_1000km2: number | null;
  admin2_lake_area_pct: number | null;
  river_source: string | null;
  lake_source: string | null;
  coastline_source: string | null;
  summary?: string | null;
  categoryColor: string;
  terrainBand: string;
  terrainColor: string;
};

type YokaiFeature = GeoJSON.Feature<GeoJSON.Point, YokaiProperties>;
type YokaiFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, YokaiProperties>;

const JAPAN_CENTER: [number, number] = [137, 37];
const MAX_FULL_POINTS_BELOW_ZOOM = 5000;
const EMPTY_COLLECTION: YokaiFeatureCollection = { type: 'FeatureCollection', features: [] };
const CATEGORY_COLORS = ['#4e79a7', '#59a14f', '#f28e2b', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#9c755f'];

const TERRAIN_LEGEND = [
  { key: 'coastal', label: 'coastal: dist_coast < 10 km', color: '#1b9e9a' },
  { key: 'near_water', label: 'near_water: dist_water < 2 km', color: '#4fb3d9' },
  { key: 'valley', label: 'valley: inland and near water', color: '#7aa95c' },
  { key: 'mountain', label: 'mountain: mountain terrain terms', color: '#8c5a32' },
  { key: 'plain', label: 'plain: remaining lowland records', color: '#c8a951' },
  { key: 'inland_water', label: 'inland_water: lake, pond, marsh terms', color: '#2b83ba' },
];

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function categoryColor(category: string | null, categories: string[]) {
  if (!category) return '#9aa0a6';
  const index = Math.max(0, categories.indexOf(category));
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function terrainBand(properties: Partial<YokaiProperties>) {
  const terrain = properties.terrain_class ?? 'plain';
  const coast = properties.dist_coast_km;
  const water = properties.dist_water_km;
  if (terrain === 'coastal' || (coast !== null && coast !== undefined && coast < 10)) return 'coastal';
  if (terrain === 'mountain') return 'mountain';
  if (terrain === 'inland_water') return 'inland_water';
  if (terrain === 'valley') return 'valley';
  if (water !== null && water !== undefined && water < 2) return 'near_water';
  return 'plain';
}

function terrainColor(band: string) {
  return TERRAIN_LEGEND.find((item) => item.key === band)?.color ?? '#c8a951';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}

function popupHtml(properties: YokaiProperties) {
  const summary = properties.summary ? `<p>${escapeHtml(properties.summary)}</p>` : '';
  const riverContext = properties.admin2_river_km_per_1000km2 ?? properties.pref_river_km_per_1000km2;
  const coastContext = properties.admin2_coastline_km_per_1000km2 ?? properties.pref_coastline_km_per_1000km2;
  const contextLevel = properties.admin2_river_km_per_1000km2 != null || properties.admin2_coastline_km_per_1000km2 != null
    ? 'admin2'
    : 'prefecture';
  const riverDensity = riverContext === null ? 'n/a' : `${riverContext.toFixed(1)} km / 1,000 km2`;
  const coastDensity = coastContext === null ? 'n/a' : `${coastContext.toFixed(1)} km / 1,000 km2`;
  return `
    <div class="yokai-popup">
      <strong>${escapeHtml(properties.name ?? 'Unknown')}</strong>
      <div><span>Category</span>${escapeHtml(properties.major_category ?? '')}</div>
      <div><span>Prefecture</span>${escapeHtml(properties.prefecture ?? '')}</div>
      <div><span>Admin2</span>${escapeHtml(properties.geocoded_place ?? properties.admin2 ?? '')}</div>
      <div><span>Geo level</span>${escapeHtml(properties.geo_level ?? '')}</div>
      <div><span>Method</span>${escapeHtml(properties.geocode_method ?? '')}</div>
      <div><span>Terrain band</span>${escapeHtml(properties.terrainBand)}</div>
      <div><span>Context</span>${escapeHtml(contextLevel)}</div>
      <div><span>River density</span>${escapeHtml(riverDensity)}</div>
      <div><span>Coast density</span>${escapeHtml(coastDensity)}</div>
      ${summary}
    </div>
  `;
}

function deterministicTenPercent(features: YokaiFeature[]) {
  return features.filter((feature) => {
    const id = String(feature.properties.id ?? feature.properties.name ?? '');
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return hash % 10 === 0;
  });
}

export default function YokaiMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const collectionRef = useRef<YokaiFeatureCollection>(EMPTY_COLLECTION);
  const modeRef = useRef<ViewMode>('points');
  const [allFeatures, setAllFeatures] = useState<YokaiFeature[]>([]);
  const [mode, setMode] = useState<ViewMode>('points');
  const [category, setCategory] = useState('all');
  const [coastMax, setCoastMax] = useState(300);
  const [zoom, setZoom] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(allFeatures.map((feature) => feature.properties.major_category).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }, [allFeatures]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/yokai-geo?limit=10000&include_summary=true', { cache: 'no-store' });
        if (!response.ok) throw new Error(`/api/yokai-geo returned ${response.status}`);
        const collection = (await response.json()) as YokaiFeatureCollection;
        const features = (collection.features ?? []).map((feature) => {
          const properties = feature.properties;
          const distWater = asNumber(properties.dist_water_km);
          const distCoast = asNumber(properties.dist_coast_km);
          const prefRiverDensity = asNumber(properties.pref_river_km_per_1000km2);
          const prefCoastDensity = asNumber(properties.pref_coastline_km_per_1000km2);
          const prefArea = asNumber(properties.pref_area_km2);
          const prefLakeShare = asNumber(properties.pref_lake_area_pct);
          const admin2RiverDensity = asNumber(properties.admin2_river_km_per_1000km2);
          const admin2CoastDensity = asNumber(properties.admin2_coastline_km_per_1000km2);
          const admin2Area = asNumber(properties.admin2_area_km2);
          const admin2LakeShare = asNumber(properties.admin2_lake_area_pct);
          const band = terrainBand({ ...properties, dist_water_km: distWater, dist_coast_km: distCoast });
          return {
            ...feature,
            properties: {
              ...properties,
              dist_water_km: distWater,
              dist_coast_km: distCoast,
              pref_river_km_per_1000km2: prefRiverDensity,
              pref_coastline_km_per_1000km2: prefCoastDensity,
              pref_area_km2: prefArea,
              pref_lake_area_pct: prefLakeShare,
              admin2_river_km_per_1000km2: admin2RiverDensity,
              admin2_coastline_km_per_1000km2: admin2CoastDensity,
              admin2_area_km2: admin2Area,
              admin2_lake_area_pct: admin2LakeShare,
              categoryColor: '#9aa0a6',
              terrainBand: band,
              terrainColor: terrainColor(band),
            },
          } satisfies YokaiFeature;
        });
        if (!cancelled) setAllFeatures(features);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load yokai geography data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const coloredFeatures = useMemo(() => {
    return allFeatures.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        categoryColor: categoryColor(feature.properties.major_category, categories),
      },
    }));
  }, [allFeatures, categories]);

  const filteredFeatures = useMemo(() => {
    return coloredFeatures.filter((feature) => {
      const categoryMatch = category === 'all' || feature.properties.major_category === category;
      const coast = feature.properties.dist_coast_km;
      const coastMatch = mode !== 'terrain' || coast === null || coast <= coastMax;
      return categoryMatch && coastMatch;
    });
  }, [category, coastMax, coloredFeatures, mode]);

  const displayedFeatures = useMemo(() => {
    if (mode === 'density') return filteredFeatures;
    if (filteredFeatures.length <= MAX_FULL_POINTS_BELOW_ZOOM || zoom >= 7) return filteredFeatures;
    return deterministicTenPercent(filteredFeatures);
  }, [filteredFeatures, mode, zoom]);

  const collection = useMemo<YokaiFeatureCollection>(() => ({ type: 'FeatureCollection', features: displayedFeatures }), [displayedFeatures]);

  useEffect(() => {
    collectionRef.current = collection;
  }, [collection]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  function syncMapLayers(map: MapLibreMap, nextCollection: YokaiFeatureCollection, nextMode: ViewMode) {
    if (!map.isStyleLoaded()) return;
    (map.getSource('yokai') as GeoJSONSource | undefined)?.setData(nextCollection);
    if (map.getLayer('yokai-density')) {
      map.setLayoutProperty('yokai-density', 'visibility', nextMode === 'density' ? 'visible' : 'none');
    }
    if (map.getLayer('yokai-points')) {
      map.setLayoutProperty('yokai-points', 'visibility', nextMode === 'density' ? 'none' : 'visible');
      map.setPaintProperty('yokai-points', 'circle-color', nextMode === 'terrain' ? ['get', 'terrainColor'] : ['get', 'categoryColor']);
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: JAPAN_CENTER,
      zoom: 5,
      minZoom: 3,
      maxZoom: 12,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('zoomend', () => setZoom(map.getZoom()));

    map.on('load', () => {
      map.addSource('yokai', { type: 'geojson', data: collectionRef.current });
      map.addLayer({
        id: 'yokai-density',
        type: 'heatmap',
        source: 'yokai',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 20, 9, 60],
          'heatmap-opacity': 0.72,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,255,0)',
            0.25,
            '#2b83ba',
            0.55,
            '#ffffbf',
            0.8,
            '#fdae61',
            1,
            '#d7191c',
          ],
        },
      });
      map.addLayer({
        id: 'yokai-points',
        type: 'circle',
        source: 'yokai',
        paint: {
          'circle-color': ['get', 'categoryColor'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7, 11, 10],
          'circle-opacity': 0.82,
          'circle-stroke-color': '#111',
          'circle-stroke-width': 1,
        },
      });
      map.on('click', 'yokai-points', (event) => {
        const feature = event.features?.[0] as YokaiFeature | undefined;
        if (!feature) return;
        popupRef.current?.remove();
        const [lng, lat] = feature.geometry.coordinates;
        popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
          .setLngLat([lng, lat])
          .setHTML(popupHtml(feature.properties))
          .addTo(map);
      });
      map.on('mouseenter', 'yokai-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'yokai-points', () => {
        map.getCanvas().style.cursor = '';
      });
      syncMapLayers(map, collectionRef.current, modeRef.current);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncMapLayers(map, collection, mode);
  }, [collection, mode]);

  const legend = mode === 'terrain'
    ? TERRAIN_LEGEND
    : categories.map((item) => ({ key: item, label: item, color: categoryColor(item, categories) }));

  return (
    <main className="geoPage" data-yokai-zone="map-main">
      <div className="toolbar">
        <div>
          <h1>Yokai Geographic Atlas</h1>
          <p>{filteredFeatures.length.toLocaleString()} filtered / {displayedFeatures.length.toLocaleString()} rendered</p>
        </div>
        <div className="tabs" aria-label="map view">
          {(['points', 'density', 'terrain'] as ViewMode[]).map((item) => (
            <button key={item} className={mode === item ? 'active' : ''} type="button" onClick={() => setMode(item)}>
              {item === 'points' ? 'Points' : item === 'density' ? 'Density' : 'Terrain'}
            </button>
          ))}
        </div>
      </div>
      <div className="layout">
        <aside className="panel">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {mode === 'terrain' && (
            <label>
              <span>dist_coast_km range: 0-{coastMax} km</span>
              <input min="0" max="300" step="5" type="range" value={coastMax} onChange={(event) => setCoastMax(Number(event.target.value))} />
            </label>
          )}
          {mode === 'terrain' && <p className="terrainNote">Yanagita Terrain Bands: displayed terrain bands combine MLIT river proximity, coastline distance, and the separated terrain labels.</p>}
          <div className="legend">
            {legend.map((item) => (
              <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>
            ))}
          </div>
          {filteredFeatures.length > MAX_FULL_POINTS_BELOW_ZOOM && zoom < 7 && mode !== 'density' && (
            <p className="sampling">Showing deterministic 10% sample below zoom 7.</p>
          )}
        </aside>
        <section className="mapStage">
          <div ref={containerRef} className="map" />
          {loading && <div className="status">Loading yokai geography...</div>}
          {error && <div className="status error">{error}</div>}
        </section>
      </div>
      <style jsx global>{`
        .maplibregl-popup-content { background: #151515; color: #f2efe7; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; padding: 0; }
        .yokai-popup { padding: 12px; display: grid; gap: 6px; font-family: var(--font-label), sans-serif; }
        .yokai-popup strong { font-size: 15px; }
        .yokai-popup div { display: grid; grid-template-columns: 90px 1fr; gap: 8px; font-size: 12px; }
        .yokai-popup span { color: rgba(242,239,231,0.58); }
        .yokai-popup p { margin: 4px 0 0; line-height: 1.55; color: rgba(242,239,231,0.82); }
      `}</style>
      <style jsx>{`
        .geoPage { min-height: 100dvh; background: #111; color: #f2efe7; padding: 18px; font-family: var(--font-label), sans-serif; }
        .toolbar { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin: 0 auto 14px; max-width: 1500px; }
        h1 { margin: 0; font-size: 24px; font-weight: 500; letter-spacing: 0; }
        p { margin: 5px 0 0; color: rgba(242,239,231,0.66); font-size: 13px; line-height: 1.45; }
        .tabs { display: flex; gap: 4px; padding: 4px; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(255,255,255,0.06); }
        button { min-width: 86px; border: 0; border-radius: 6px; padding: 9px 12px; color: #f2efe7; background: transparent; cursor: pointer; font: inherit; }
        button.active { background: #f2efe7; color: #111; }
        .layout { max-width: 1500px; margin: 0 auto; display: grid; grid-template-columns: 310px minmax(0,1fr); gap: 14px; min-height: calc(100dvh - 92px); }
        .panel { display: flex; flex-direction: column; gap: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(255,255,255,0.05); overflow: auto; }
        label { display: grid; gap: 8px; font-size: 13px; color: rgba(242,239,231,0.72); }
        select { height: 38px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); background: #1b1b1b; color: #f2efe7; padding: 0 10px; font: inherit; }
        input { width: 100%; }
        .terrainNote, .sampling { padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.22); }
        .legend { display: grid; gap: 9px; }
        .legend span { display: grid; grid-template-columns: 14px minmax(0,1fr); align-items: center; gap: 8px; font-size: 12px; color: rgba(242,239,231,0.76); line-height: 1.35; }
        .legend i { width: 12px; height: 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.28); }
        .mapStage { position: relative; min-height: 620px; overflow: hidden; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: #202020; }
        .map { position: absolute; inset: 0; }
        .status { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); padding: 9px 12px; border-radius: 6px; background: rgba(17,17,17,0.88); border: 1px solid rgba(255,255,255,0.16); color: #f2efe7; font-size: 13px; z-index: 2; }
        .status.error { color: #ffb4a8; }
        @media (max-width: 860px) {
          .toolbar { align-items: stretch; flex-direction: column; }
          .tabs { width: 100%; }
          button { flex: 1; min-width: 0; }
          .layout { grid-template-columns: 1fr; min-height: auto; }
          .panel { order: 2; }
          .mapStage { order: 1; min-height: 64dvh; }
        }
      `}</style>
    </main>
  );
}
