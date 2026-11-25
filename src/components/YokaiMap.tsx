'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import YokaiCityView, {type MapViewOptions,type RaceOverlay,type RaceStop} from './YokaiCityView';
import YokaiRace from './YokaiRace';
import {recommendedYokai} from '@/lib/yokai-recommendations';
import { catalogScore } from '@/lib/catalog-search';
import { relatedYokai } from '@/lib/related-yokai';
import YokaiJourney, { JourneyImage, JourneyPassage, type JourneyResult, type JourneyStop } from './YokaiJourney';

type MapLayers = { points: boolean; density: boolean; regions: boolean; terrain: boolean; images: boolean };
const INITIAL_LAYERS: MapLayers = { points: true, density: false, regions: false, terrain: false, images: true };

type YokaiProperties = {
  id: string | null;
  name: string | null;
  name_reading?: string | null;
  primary_image_url?: string | null;
  record_source?: string | null;
  source_url?: string | null;
  location_evidence?: string | null;
  location_evidence_field?: string | null;
  location_context_reason?: string | null;
  location_context_source?: string | null;
  location_text?: string | null;
  image_author?: string | null;
  image_title?: string | null;
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

function displayName(name: string | null | undefined): string {
  const first = (name || '').split(/[；;，,、]/).map(value => value.replace(/[（(]俗信[）)]/g, '').trim()).find(Boolean);
  return first || '名前のない妖怪';
}

type YokaiFeature = GeoJSON.Feature<GeoJSON.Point, YokaiProperties>;
type YokaiFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, YokaiProperties>;

function featurePosition(feature: YokaiFeature): [number, number] {
  return [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
}

const EMPTY_COLLECTION: YokaiFeatureCollection = { type: 'FeatureCollection', features: [] };
const CATEGORY_COLORS = ['#4e79a7', '#59a14f', '#f28e2b', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#9c755f'];

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
  const colors: Record<string, string> = { coastal: '#1b9e9a', near_water: '#4fb3d9', valley: '#7aa95c', mountain: '#8c5a32', plain: '#c8a951', inland_water: '#2b83ba' };
  return colors[band] ?? '#c8a951';
}

export default function YokaiMap() {
  const [mobilePane,setMobilePane]=useState<'search'|'map'|'detail'>('map');
  const [detailTab,setDetailTab]=useState<'story'|'related'>('story');
  const [showLayers,setShowLayers]=useState(false);
  const [viewOptions,setViewOptions]=useState<MapViewOptions>({background:'seamlessphoto',perspective:'-90',edo:false,buildings:false,opacity:'75'});
  const [edoVisit,setEdoVisit]=useState(0);
  const [journeyResult,setJourneyResult]=useState<JourneyResult|null>(null);
  const [journeyTrail,setJourneyTrail]=useState<JourneyStop[]>([]);
  useEffect(()=>{if(!journeyResult)return;const timer=setTimeout(()=>setJourneyResult(null),10000);return()=>clearTimeout(timer);},[journeyResult]);
  const collectionRef = useRef<YokaiFeatureCollection>(EMPTY_COLLECTION);
  const [allFeatures, setAllFeatures] = useState<YokaiFeature[]>([]);
  const [layers, setLayers] = useState<MapLayers>(INITIAL_LAYERS);
  const [prefectureInput, setPrefectureInput] = useState('');
  const [prefectureFilter, setPrefectureFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [coastMax, setCoastMax] = useState(300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(()=>{if(selectedId){setMobilePane('detail');setDetailTab('story');}},[selectedId]);
  const [resultsPage, setResultsPage] = useState(0);
  const [resultsPerPage,setResultsPerPage]=useState(3);
  const resultListRef=useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState('');
  const [cityFocus, setCityFocus] = useState<{ coordinates: [number, number]; range: number } | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [relatedHistory, setRelatedHistory] = useState<string[]>([]);
  const [journeyMode, setJourneyMode] = useState(false);
  const [raceMode,setRaceMode]=useState(false),[raceOverlay,setRaceOverlay]=useState<RaceOverlay|null>(null),[raceFit,setRaceFit]=useState(false),[racePick,setRacePick]=useState<{id:string;serial:number}|null>(null);
  const raceTrail=useCallback((stops:RaceStop[],fit:boolean)=>{setJourneyTrail(stops);setRaceFit(fit);},[]);
  const exitRace=useCallback(()=>{setRaceMode(false);setRaceOverlay(null);setJourneyTrail([]);setRaceFit(false);setMobilePane('map');},[]);
  const [journeyPhase,setJourneyPhase]=useState('write');
  useEffect(()=>{const list=resultListRef.current;if(!list)return;const observer=new ResizeObserver(()=>{const available=list.clientHeight-(list.querySelector('h2')?.clientHeight||22)-(list.querySelector('.pager')?.clientHeight||34)-40;const count=Math.max(1,Math.min(8,Math.floor((available+6)/70)));setResultsPerPage(previous=>{if(previous!==count)setResultsPage(0);return count;});});observer.observe(list);return()=>observer.disconnect();},[journeyMode]);
  const [journeyHint,setJourneyHint] = useState<{label:string;serial:number}|null>(null);
  const selectedFeature = useMemo(() => allFeatures.find(feature => String(feature.properties.id) === selectedId), [allFeatures, selectedId]);
  const related = useMemo(() => selectedFeature ? relatedYokai(selectedFeature, allFeatures) : [], [selectedFeature, allFeatures]);
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [selectedId]);

  const categories = useMemo(() => {
    return Array.from(new Set(allFeatures.map((feature) => feature.properties.major_category).filter(value => Boolean(value) && value !== '怪異・妖怪画像DB') as string[]))
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }, [allFeatures]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let offset: number | null = 0;
        // Every commit re-filters all records and rebuilds the map's pins, so batches are shown
        // in a few large steps: the first 1,000 at once, then about 12,000 at a time.
        let pending: YokaiFeature[] = [], first = true;
        while (offset !== null && !cancelled) {
          const response = await fetch(`/api/yokai-geo?limit=${offset === 0 ? 1000 : 4000}&offset=${offset}&include_summary=true&compact=1`, { signal: controller.signal });
          if (!response.ok) throw new Error(`/api/yokai-geo returned ${response.status}`);
          const batch = await response.json() as YokaiFeatureCollection & { metadata: { next_offset: number | null } };
          if (cancelled) return;
          offset = batch.metadata.next_offset ?? null;
          const features = (batch.features ?? []).map((feature) => {
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
          pending.push(...features);
          if (!first && pending.length < 12000 && offset !== null) continue;
          const ready = pending; pending = []; first = false;
          if (!cancelled) setAllFeatures(current => {
            const existingIds = new Set(current.map(feature => String(feature.properties.id)));
            const additions = ready.filter(feature => !existingIds.has(String(feature.properties.id)));
            return [...current.filter(feature => feature.properties.major_category !== '怪異・妖怪画像DB'), ...additions, ...current.filter(feature => feature.properties.major_category === '怪異・妖怪画像DB')];
          });
          // Let React paint this batch before parsing the next one.
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch {
        if (!cancelled) setError('一部の伝承を読み込めませんでした。読み込み済みの妖怪は引き続き探せます。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let lastImages = '';
    async function refreshImages() {
      try {
        const response = await fetch('/youkai-gazou-geo.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('画像資料の位置情報を準備中です。');
        const raw = await response.text();
        if (raw === lastImages) return;
        lastImages = raw;
        const data = JSON.parse(raw) as YokaiFeatureCollection;
        const images = data.features.map(feature => ({ ...feature, properties: {
          ...feature.properties, dist_water_km: null, dist_coast_km: null,
          categoryColor: '#9e6bb5', terrainBand: 'unknown', terrainColor: '#9aa0a6',
        } }));
        if (controller.signal.aborted) return;
        setAllFeatures(current => [...current.filter(feature => feature.properties.major_category !== '怪異・妖怪画像DB'), ...images]);
        setImageError('');
      } catch (error) {
        if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : '画像資料を読み込めませんでした。');
      }
    }
    void refreshImages();
    const timer = setInterval(refreshImages, 300000);
    return () => { controller.abort(); clearInterval(timer); };
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
    const typed = searchQuery.trim() !== '';
    return coloredFeatures.filter((feature) => {
      const categoryMatch = category === 'all' || feature.properties.major_category === category;
      const coast = feature.properties.dist_coast_km;
      const coastMatch = !layers.terrain || coast === null || coast <= coastMax;
      if (!categoryMatch || !coastMatch || (prefectureFilter && feature.properties.prefecture !== prefectureFilter)) return false;
      if (!typed) return true;
      const text = [feature.properties.name, feature.properties.prefecture, feature.properties.admin2,
        feature.properties.summary, feature.properties.phenomenon, feature.properties.major_category,
        feature.properties.image_title, feature.properties.location_evidence, feature.properties.geocoded_place].filter(Boolean).join(' ');
      return catalogScore(text, searchQuery) > 0;
    });
  }, [category, coastMax, coloredFeatures, layers.terrain, searchQuery, prefectureFilter]);

  const recommended=useMemo(()=>recommendedYokai(coloredFeatures),[coloredFeatures]);
  const resultFeatures=searchQuery||prefectureFilter||category!=='all'||layers.terrain?filteredFeatures:recommended;
  const prefectures = useMemo(() => [...new Set(allFeatures.map(feature => feature.properties.prefecture).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ja')), [allFeatures]);

  function findPrefecture(input: string) {
    const normalize = (value: string) => value.normalize('NFKC').trim().replace(/^東京都$/, '東京').replace(/[府県]$/, '');
    const found = prefectures.find(value => normalize(value) === normalize(input));
    setPrefectureInput(input);
    setResultsPage(0); setSelectedId(null); 
    if (!found) {
      setPrefectureFilter('');
      if (!input.trim()) { setCityFocus({ coordinates: [137, 37], range: 2600000 }); }
      return;
    }
    setPrefectureFilter(found);
    setSearchInput(''); setSearchQuery(''); setCategory('all'); setCoastMax(300);
    setResultsPage(0); setSelectedId(null); 
    const records = allFeatures.filter(feature => feature.properties.prefecture === found);
    if (records.length) {
      const positions = records.map(featurePosition);
      const west = Math.min(...positions.map(p => p[0]));
      const east = Math.max(...positions.map(p => p[0]));
      const south = Math.min(...positions.map(p => p[1]));
      const north = Math.max(...positions.map(p => p[1]));
      setCityFocus({ coordinates: [(west + east) / 2, (south + north) / 2], range: Math.max(30000, (east - west) * 180000, (north - south) * 230000) });
    }
  }

  const selectRecord = useCallback((feature: YokaiFeature, focus = false, keepHistory = false) => {
    if (!keepHistory) setRelatedHistory([]);
    setSelectedId(String(feature.properties.id));
    if (focus) {
      setCityFocus({ coordinates: featurePosition(feature), range: 18000 });
      
    }
  }, []);

  const openMapRecord = useCallback((feature: YokaiFeature) => {
    selectRecord(feature, true);
  }, [selectRecord]);

  const openCityRecord = useCallback((id: string) => {
    const feature = collectionRef.current.features.find(item => String(item.properties.id) === id);
    if (feature) openMapRecord(feature);
  }, [openMapRecord]);
  // In the race, a pin click is a move (YokaiRace ignores pins that are not on offer).
  const raceSelect = useCallback((id: string) => setRacePick({ id, serial: Date.now() }), []);
  const visitJourney = useCallback((id: string) => {
    const feature = allFeatures.find(item => String(item.properties.id) === id);
    if (feature) selectRecord(feature, true);
  }, [allFeatures, selectRecord]);

  function closeDetail() {
    setSelectedId(null);
    
  }

  const displayedFeatures = useMemo(() => {
    const records = selectedFeature && !filteredFeatures.some(f => f.properties.id === selectedFeature.properties.id) ? [...filteredFeatures, selectedFeature] : filteredFeatures;
    return records;
  }, [filteredFeatures, selectedFeature]);

  const collection = useMemo<YokaiFeatureCollection>(() => ({ type: 'FeatureCollection', features: displayedFeatures }), [displayedFeatures]);

  useEffect(() => {
    collectionRef.current = collection;
  }, [collection]);

  return (
    <main className={`geoPage mobile-${mobilePane}`} data-yokai-zone="map-main">
      <div className="toolbar">
        <div>
          <h1>妖怪マップ</h1>
        </div>
        <button className="displayToggle" aria-expanded={showLayers} onClick={()=>setShowLayers(v=>!v)}>地図の表示</button>
        <div className={`tabs${showLayers?' visible':''}`} aria-label="地図の設定">
          <fieldset><legend>背景と見え方</legend>
            <label>背景<select value={viewOptions.background} onChange={e=>setViewOptions(v=>({...v,background:e.target.value}))}><option value="seamlessphoto">航空写真</option><option value="osm">OpenStreetMap</option><option value="std">地理院地図</option></select></label>
            <label>視点<select value={viewOptions.perspective} onChange={e=>setViewOptions(v=>({...v,perspective:e.target.value}))}><option value="-90">真上</option><option value="-45">斜め</option></select></label>
          </fieldset>
          <fieldset><legend>古地図・建物</legend>
            <label className="checkSetting"><input type="checkbox" checked={viewOptions.edo} onChange={e=>setViewOptions(v=>({...v,edo:e.target.checked}))}/>江戸切絵図（1850）</label>
            {viewOptions.edo&&<><label>古地図の濃さ<input type="range" min="0" max="100" value={viewOptions.opacity} onChange={e=>setViewOptions(v=>({...v,opacity:e.target.value}))}/></label><button onClick={()=>{setEdoVisit(v=>v+1);setShowLayers(false);}}>この古地図の範囲を見る</button></>}
            <label className="checkSetting"><input type="checkbox" checked={viewOptions.buildings} onChange={e=>setViewOptions(v=>({...v,buildings:e.target.checked}))}/>立体の建物（港区）</label>
          </fieldset>
          <fieldset><legend>地図に重ねる情報</legend>
          {([['points', '妖怪のいる場所'], ['images', '絵を表示'], ['density', '妖怪伝承ヒートマップ'], ['terrain', '地形で色分け']] as const).map(([key, label]) => (
            <button key={key} className={layers[key] ? 'active' : ''} aria-pressed={layers[key]} type="button" onClick={() => { setResultsPage(0); setLayers(current => ({ ...current, [key]: !current[key], ...(key === 'terrain' && !current.terrain ? { points: true } : {}) })); }}>
              {label}
            </button>
          ))}
          </fieldset>
        </div>
      </div>
      <div className={`layout${selectedFeature ? ' reading' : ''}${journeyMode?` journeyLayout ${journeyPhase==='browse'?'journeyBrowsing':'journeyEntrance'}`:''}`}>
        <aside className="panel">
          {journeyMode && <YokaiJourney records={allFeatures} selectedId={selectedId} onPhase={setJourneyPhase} onTrail={setJourneyTrail} onVisit={visitJourney} onFinish={result=>{setJourneyMode(false);setJourneyHint(null);setJourneyResult(result.stories?result:null);setMobilePane('map');}} loading={loading} hint={journeyHint} />}
          {raceMode && <YokaiRace records={allFeatures} mapPick={racePick} onVisit={visitJourney} onCloseStory={() => setSelectedId(null)} onTrail={raceTrail} onOverlay={setRaceOverlay} onExit={exitRace} />}
          {!journeyMode && !raceMode && <>
          <div className="searchBlock">
          <h2 className="blockHeading">妖怪を探す</h2>
          <form onSubmit={event => { event.preventDefault(); setSearchQuery(searchInput); setResultsPage(0);  setSelectedId(null); }}>
            <input id="map-search" aria-label="妖怪名や伝承を検索" value={searchInput} onChange={event => { const value = event.target.value; setSearchInput(value); if (!value.trim()) { setSearchQuery(''); setResultsPage(0); setSelectedId(null);  } }} placeholder="妖怪名・伝承の言葉" />
            <button type="submit">検索</button>
          </form>
          <div className="searchFilters">
          <label htmlFor="prefecture-search">地域
          <input id="prefecture-search" list="prefecture-names" value={prefectureInput} onChange={event => findPrefecture(event.target.value)} placeholder="都道府県" />
          </label>
          <datalist id="prefecture-names">{prefectures.map(name => <option key={name} value={name} />)}</datalist>
          <label>
            種類
            <select value={category} onChange={(event) => { setCategory(event.target.value); setResultsPage(0);  }}>
              <option value="all">すべて</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          </div>
          </div>
          {imageError && <p role="status">{imageError}</p>}
          <div className="recordList" ref={resultListRef}>
            <h2>{searchQuery||prefectureFilter||category!=='all'?'検索結果':'おすすめの妖怪'}</h2>
            {resultFeatures.slice(resultsPage * resultsPerPage, (resultsPage + 1) * resultsPerPage).map(feature => <button className={String(feature.properties.id) === selectedId ? 'chosen' : ''} key={String(feature.properties.id)} onClick={() => selectRecord(feature, true)}>
              <span className="resultHeading"><strong>{displayName(feature.properties.name)}</strong><span className="resultPlace">{feature.properties.prefecture}</span></span><small>{feature.properties.summary || '絵と資料を見てみる'}</small>
            </button>)}
            <div className="pager"><button disabled={resultsPage === 0} onClick={() => setResultsPage(resultsPage - 1)}>前へ</button><span>{resultsPage + 1}</span><button disabled={(resultsPage + 1) * resultsPerPage >= resultFeatures.length} onClick={() => setResultsPage(resultsPage + 1)}>次へ</button></div>
          </div>
          <div className="exploreLinks">
            <a href="/hyakki" className="pictureLink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg><span>百鬼夜行をはじめる<small>相棒を選んで、全国の仲間をよぶ</small></span><span aria-hidden="true">↗</span></a>
            <a href="/yokai-images" className="pictureLink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m4 18 6-6 4 4 3-3 4 5"/></svg><span>絵から探す<small>姿かたちから出会う</small></span><span aria-hidden="true">↗</span></a>
            <button className="journeyToggle" aria-label="妖怪をめぐる →" onClick={()=>{setJourneyPhase('write');setJourneyTrail([]);setJourneyMode(true);setMobilePane('map');}}><span>妖怪をめぐる<small>あなたの体験を入口に</small></span><span aria-hidden="true">→</span></button>
          </div>
          {layers.terrain && (
            <label>
              <span>代表位置から海岸まで：0〜{coastMax} km</span>
              <input min="0" max="300" step="5" type="range" value={coastMax} onChange={(event) => { setCoastMax(Number(event.target.value)); setResultsPage(0); }} />
            </label>
          )}
          {layers.terrain && <p className="terrainNote">地形の色は、代表座標の水域・海岸との距離や地形分類から算出した参考情報です。</p>}
          </>}
        </aside>
        <section className="mapStage">
          <YokaiCityView viewOptions={viewOptions} edoVisit={edoVisit} trail={journeyTrail} fitTrail={Boolean(journeyResult)||raceFit} race={raceMode?raceOverlay:null} features={displayedFeatures} selectedId={selectedId} terrain={layers.terrain} points={layers.points&&!raceMode} names={layers.regions} images={layers.images&&!raceMode} density={layers.density} focus={cityFocus} onSelect={raceMode?raceSelect:openCityRecord} />
          {loading && allFeatures.length === 0 && <div className="status" role="status">妖怪を読み込んでいます…</div>}
          {error && <div className="status error">{error}</div>}
          {journeyMode && <div id="journey-dock" className="journeyDock" />}
          <details className="mapCredits">
            <summary>出典・データについて</summary>
            <p>伝承：<a href="https://www.nichibun.ac.jp/YoukaiDB/" target="_blank" rel="noreferrer">国際日本文化研究センター「怪異・妖怪伝承データベース」</a></p>
            <p>画像：<a href="https://www.nichibun.ac.jp/YoukaiGazou/" target="_blank" rel="noreferrer">同「怪異・妖怪画像データベース」</a>。各画像の詳細から原資料に移動できます。</p>
            <p>歴史地名：『日本歴史地名大系』<a href="https://doi.org/10.20676/00000448" target="_blank" rel="noreferrer">地名項目</a>・<a href="https://doi.org/10.20676/00000456" target="_blank" rel="noreferrer">施設・地点項目</a>（CODH作成、<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>）。</p>
            <p>位置照合：<a href="https://gadm.org/" target="_blank" rel="noreferrer">GADM</a>、<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames（CC BY 4.0）</a>、Wikipedia・Wikidata、国土地理院。</p>
            <p>表示位置は資料の記述から推定した代表位置です。出来事の正確な地点を確認したものではありません。</p>
          </details>
        </section>
        <section ref={detailRef} className={`detail${selectedFeature ? ' opened' : ''}`} aria-live="polite" aria-label="選択した妖怪の詳細">
          {selectedFeature && <>
            <button className="closeDetail" aria-label="話を閉じる" onClick={()=>{closeDetail();setMobilePane('map');}}><span aria-hidden="true">×</span></button>
            <h2>{displayName(selectedFeature.properties.name)}</h2>
            {!journeyMode&&!raceMode&&<nav className="detailTabs" aria-label="妖怪の情報"><button aria-pressed={detailTab==='story'} onClick={()=>setDetailTab('story')}>この話</button><button aria-pressed={detailTab==='related'} onClick={()=>setDetailTab('related')}>似ている妖怪</button></nav>}
            {(journeyMode||raceMode||detailTab==='story')&&<div className="storyBody">
            {selectedFeature.properties.primary_image_url && <figure className="recordImage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedFeature.properties.primary_image_url} alt={`${selectedFeature.properties.name}の登録画像`} />
            </figure>}
            {journeyMode && !selectedFeature.properties.primary_image_url && <JourneyImage name={selectedFeature.properties.name || ''} />}
            {selectedFeature.properties.source_url && <a href={selectedFeature.properties.source_url} target="_blank" rel="noreferrer">出典を見る ↗</a>}
            {journeyMode ? <><p className="readingHint">気になる言葉を押して、話の先へ。</p><JourneyPassage feature={selectedFeature} onPick={label=>{setJourneyHint({label,serial:Date.now()});setMobilePane('map');}}/></> : <p>{selectedFeature.properties.summary}</p>}
            </div>}
            {!journeyMode && !raceMode && relatedHistory.length > 0 && <button className="relatedBack" onClick={() => {
              const previous = allFeatures.find(f => String(f.properties.id) === relatedHistory[relatedHistory.length - 1]);
              setRelatedHistory(history => history.slice(0, -1));
              if (previous) selectRecord(previous, true, true);
            }}>← 前の妖怪へ</button>}
            {!journeyMode && !raceMode && detailTab==='related' && <div className="relatedRecords">
              <h3>似ている妖怪</h3>
              <p>名前や本文の共通する言葉から</p>
              {related.map(({ feature, reason }) => <button key={feature.properties.id} onClick={() => {
                setRelatedHistory(history => [...history, String(selectedFeature.properties.id)].slice(-20));
                selectRecord(feature, true, true);
              }}>
                {feature.properties.primary_image_url && /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={feature.properties.primary_image_url} alt="" loading="lazy" />}
                <span><strong>{displayName(feature.properties.name)}</strong><em>{reason}</em><small>{feature.properties.summary}</small></span>
              </button>)}
              {!related.length && <p>{loading ? 'ほかの妖怪を読み込んでいます…' : '共通する言葉のある妖怪は見つかりませんでした。'}</p>}
            </div>}
          </>}
        </section>
      </div>
      {journeyResult&&<aside className="journeyResult" role="status" aria-label="探索の振り返り"><button aria-label="振り返りを閉じる" onClick={()=>setJourneyResult(null)}>×</button><h2>妖怪めぐりの足あと</h2><p>{journeyResult.stories}件の話{journeyResult.regions>0?`、${journeyResult.regions}つの地域`:''}に出会いました</p><div className="resultRoute">{journeyResult.route.length>5?<>{journeyResult.route.slice(0,2).join(' → ')} → … → {journeyResult.route.slice(-2).join(' → ')}</>:journeyResult.route.join(' → ')}</div></aside>}
      <nav className="mobileNav" aria-label="画面を切り替える">{!journeyMode&&!raceMode&&<button aria-pressed={mobilePane==='search'} onClick={()=>setMobilePane('search')}>探す</button>}<button aria-pressed={mobilePane==='map'} onClick={()=>setMobilePane('map')}>地図</button><button disabled={!selectedFeature} aria-pressed={mobilePane==='detail'} onClick={()=>setMobilePane('detail')}>妖怪の話</button></nav>
      <style jsx global>{`
        .geoPage a { color: #e6cf94; }
        .geoPage button, .geoPage input, .geoPage select, .geoPage textarea { font-family: var(--font-main); }
        .yokai-orb { position: absolute; width: 88px; height: 88px; padding: 0; border: 3px solid #fff4d5; border-radius: 50%; background: #f3eddc; cursor: pointer; box-shadow: 0 3px 12px #0006; color: #29271f; font: 11px sans-serif; }
        .yokai-orb img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
        .yokai-orb > span { position: absolute; top: calc(100% + 5px); left: 50%; transform: translateX(-50%); max-width: 112px; width: max-content; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; background: #fff7e4; border-radius: 999px; box-shadow: 0 1px 5px #0004; }
        .yokai-orb > small { position: absolute; bottom: calc(100% + 5px); left: 50%; transform: translateX(-50%); white-space: nowrap; border-radius: 999px; background: #26251eee; color: #fff4d5; padding: 3px 7px; }
        .yokai-orb.no-image { width: 22px; height: 22px; background: #8165a6; }
        .yokai-orb.expanded { z-index: 3; }
        .yokai-orb:focus-visible { outline: 3px solid #246ec5; outline-offset: 4px; }
      `}</style>
      <style jsx>{`
        .geoPage { min-height: 100dvh; background: #111; color: #f2efe7; padding: 18px; font-family: var(--font-main); }
        .toolbar { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin: 0 auto 14px; max-width: 1500px; }
        h1 { margin: 0; font-size: 24px; font-weight: 500; letter-spacing: 0; }
        p { margin: 5px 0 0; color: rgba(242,239,231,0.66); font-size: 13px; line-height: 1.45; }
        h1 small { font-size: 13px; opacity: .65; margin-left: 12px; }
        .tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(255,255,255,0.06); }
        button { min-width: 86px; border: 0; border-radius: 6px; padding: 9px 12px; color: #f2efe7; background: transparent; cursor: pointer; font: inherit; }
        button.active { background: #f2efe7; color: #111; }
        .layout { max-width: 1900px; margin: 0 auto; display: grid; grid-template-columns: 260px minmax(0,1fr); gap: 14px; height: calc(100dvh - 110px); min-height: 480px; }
        .panel { display: flex; flex-direction: column; gap: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(255,255,255,0.05); overflow: auto; min-height: 0; }
        .panel > * { flex-shrink: 0; }
        .panel a { color: #e6cf94; }
        .recordList button { padding: 10px 0; }
        .recordList strong { font-size: 15px; font-weight: 600; }
        .recordList small, .groupList small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 1.5; }
        .groupList button { display: flex; gap: 12px; width: 100%; text-align: left; border-bottom: 1px solid #444; padding: 12px 4px; }
        .groupList img { width: 62px; height: 62px; border-radius: 50%; object-fit: contain; flex-shrink: 0; background: #f3eddc; }
        .groupList strong { font-size: 16px; }
        .groupList span { min-width: 0; }
        .sourceInfo { font-size: 12px; margin: 12px 0; }
        .sourceInfo summary { cursor: pointer; }

        label { display: grid; gap: 8px; font-size: 13px; color: rgba(242,239,231,0.72); }
        select { height: 38px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); background: #1b1b1b; color: #f2efe7; padding: 0 10px; font: inherit; }
        input { width: 100%; }
        .detail { display: none; }
        .detail.opened { display: block; grid-column: 3; grid-row: 1; font-family: var(--font-main); padding: 20px; border: 1px solid #555; border-radius: 8px; overflow: auto; min-height: 0; background: #171914; }
        .layout.reading { grid-template-columns: 260px minmax(0,1fr) 400px; }
        .panel { grid-column: 1; grid-row: 1; }
        .mapStage { grid-column: 2; grid-row: 1; }
        .detail > p { font-size: 15px; line-height: 1.9; color: #eee9dc; margin-top: 16px; }
        .relatedRecords { margin-top: 28px; border-top: 1px solid #494b40; }
        .relatedRecords > p { font-size: 12px; color: #c6c2b7; }
        .relatedRecords button { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 16px 0; text-align: left; border-bottom: 1px solid #393b32; }
        .relatedRecords button:hover { background: #ffffff0d; }
        .relatedRecords img { width: 72px; height: 72px; object-fit: contain; background: #f3eddc; border-radius: 50%; flex-shrink: 0; }
        .relatedRecords span { min-width: 0; }
        .relatedRecords em { display: block; font-size: 12px; font-style: normal; color: #e6cf94; margin-top: 5px; }
        .relatedRecords small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.6; }
        .relatedBack { color: #e6cf94; }
        .journeyToggle { background: #e7d7ac; color: #29281f; text-align: left; }
        .journeyDock { position:absolute; bottom:76px; left:14px; right:14px; z-index:5; }
        .readingHint { font-size:12px!important; color:#bbaa84!important; }
        .journeyLayout .panel { background:linear-gradient(160deg,#23271e,#151c18); }
        .journeyLayout .detail { background:#191e18; border-color:#756447; }
        .prefectureStart { background: #eee5cf; color: #282b23; text-align: left; font-weight: 600; }

        .closeDetail { display: block; margin-left: auto; background: #403c31; margin-bottom: 12px; position: sticky; top: 0; }
        .detail h3 { margin: 24px 0 8px; font-size: 16px; } .detail h2, .recordList h2 { font-size: 20px; }
        .detail small { display: block; margin: 8px 0; opacity: .7; }
        .detail .groupList small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; max-height: 3em; margin: 5px 0 0; }
        .detail .groupList button { align-items: center; }
        .recordList { min-height: 0; } .recordList button { width: 100%; text-align: left; border-bottom: 1px solid #444; }
        .recordList small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; opacity: .65; margin-top: 4px; } .chosen { background: #51472e; }
        .pager { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0; } button:disabled { opacity: .35; cursor: default; }
        input:not([type="range"]) { padding: 10px; margin: 8px 0; background: #222; color: #f2efe7; border: 1px solid #777; border-radius: 6px; }
        .terrainNote, .sampling { padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.22); }
        .legend { display: grid; gap: 9px; }
        .legend span { display: grid; grid-template-columns: 14px minmax(0,1fr); align-items: center; gap: 8px; font-size: 12px; color: rgba(242,239,231,0.76); line-height: 1.35; }
        .legend i { width: 12px; height: 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.28); }
        .mapStage { position: relative; min-height: 620px; overflow: hidden; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: #202020; }
        .map { position: absolute; inset: 0; }
        .mapCredits { position: absolute; right: 8px; bottom: 32px; z-index: 4; max-width: min(350px, calc(100% - 16px)); border-radius: 8px; background: #171914ed; padding: 8px 10px; font-size: 12px; }
        .mapCredits[open] { max-height: 45vh; overflow: auto; }
        .mapCredits summary { cursor: pointer; }
        .mapCredits a { color: #e6cf94; text-decoration: underline; }
        .spreadControls { position: absolute; top: 12px; left: 12px; right: 52px; padding: 8px; border-radius: 8px; background: #171914ed; font-size: 12px; text-align: center; }
        .spreadControls button { font-size: 12px; }
        .recordImage { margin: 14px 0; }
        .recordImage img { width: 100%; max-height: 52dvh; min-height: 280px; object-fit: contain; }
        .recordImage figcaption { font-size: 12px; opacity: .7; }
        .status { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); padding: 9px 12px; border-radius: 6px; background: rgba(17,17,17,0.88); border: 1px solid rgba(255,255,255,0.16); color: #f2efe7; font-size: 13px; z-index: 2; }
        .status.error { color: #ffb4a8; }
        .geoPage { height:100dvh; min-height:0; box-sizing:border-box; display:flex; flex-direction:column; padding:12px; overflow:hidden; }
        .toolbar { flex:none; width:100%; max-width:none; margin:0 0 10px; align-items:center; position:relative; z-index:10; }
        h1 { font-size:22px; }
        .displayToggle { margin-left:auto; background:#282a24; font-size:13px; }
        .tabs { display:none; position:absolute; right:0; top:48px; width:240px; background:#24271f; padding:10px; box-shadow:0 8px 30px #0008; }
        .tabs.visible { display:grid; }
        .tabs button { text-align:left; font-size:13px; }
        .layout { flex:1; width:100%; max-width:none; min-height:0; height:auto; grid-template-columns:260px minmax(0,1fr); gap:10px; }
        .layout.reading { grid-template-columns:260px minmax(0,1fr) clamp(300px,27vw,420px); }
        .mapStage { min-height:0; }
        .panel { gap:10px; padding:14px; overflow:hidden; }
        .panel form { display:grid; grid-template-columns:1fr auto; align-items:center; gap:6px; }
        .panel form label { grid-column:1/-1; }
        .panel label { gap:5px; font-size:12px; }
        .panel input:not([type=range]) { box-sizing:border-box; min-width:0; margin:0; padding:9px; font-size:13px; }
        .panel form button { min-width:0; background:#dfd1ad; color:#27251e; }
        .panel a { font-size:12px; }
        .panel .recordList { flex:1; display:flex; flex-direction:column; min-height:0; border-top:1px solid #4b4a3b; margin-top:3px; }
        .recordList h2 { font-size:13px; color:#c5bda8; margin:12px 0 4px; }
        .recordList > button { flex:none; min-height:0; overflow:hidden; padding:8px 3px; }
        .recordList strong { font-size:15px; }
        .recordList small { -webkit-line-clamp:1; }
        .pager { flex:none; margin:auto 0 0; font-size:12px; }
        .pager button { min-width:0; }
        .detail.opened { display:flex; flex-direction:column; overflow:hidden; padding:16px; position:relative; }
        .detail h2 { margin:0 90px 14px 0; font-size:24px; flex:none; }
        .closeDetail { position:absolute; top:12px; right:12px; padding:6px 10px; font-size:12px; }
        .detailTabs { display:flex; gap:12px; border-bottom:1px solid #575443; margin-bottom:14px; flex:none; }
        .detailTabs button { min-width:0; font-size:13px; border-radius:0; }
        .detailTabs button[aria-pressed=true] { color:#ead39e; border-bottom:2px solid #ead39e; }
        .storyBody,.relatedRecords { min-height:0; overflow:auto; overscroll-behavior:contain; }
        .storyBody > p { font-size:15px; line-height:1.95; color:#eee9dc; margin:14px 0; }
        .storyBody > a { font-size:12px; }
        .recordImage { margin:0 0 12px; }
        .recordImage img { min-height:0; max-height:29dvh; width:100%; }
        .relatedRecords { margin:0; border:0; }
        .relatedRecords h3 { display:none; }
        .mobileNav { display:none; }
        .journeyDock { bottom:64px; left:10px; right:10px; }
        .mapStage :global(.cityView) { bottom:var(--journey-space,0px); }
        .layout { grid-template-columns:300px minmax(0,1fr); gap:16px; }
        .layout.reading { grid-template-columns:300px minmax(0,1fr) clamp(300px,27vw,420px); }
        .panel { padding:0; gap:14px; background:transparent; border:0; border-radius:0; }
        .searchBlock { padding:18px; border:1px solid #3b3c34; border-radius:12px; background:#1c1e19; }
        .blockHeading { margin:0 0 16px; font-size:18px; font-weight:500; }
        .panel form { gap:8px; }
        .panel form input { height:42px; }
        .panel form button { height:42px; padding:0 12px; font-size:13px; }
        .searchFilters { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:12px; margin-top:16px; }
        .searchFilters label { min-width:0; font-size:12px; color:#bcb7a9; gap:7px; }
        .searchFilters input,.searchFilters select { width:100%; height:36px; min-width:0; font-size:12px; }
        .panel .searchFilters input { padding:7px 9px; border-color:#4a4c41; background:#24261f; }
        .searchFilters select { background:#24261f; padding:0 8px; }
        .panel .recordList { border:1px solid #3b3c34; border-radius:12px; background:#1c1e19; margin:0; padding:14px; gap:6px; overflow:hidden; }
        .recordList h2 { margin:0 0 5px; font-size:14px; font-weight:500; color:#e7dfce; }
        .recordList > button { flex:0 1 64px; min-height:0; overflow:hidden; border:1px solid transparent; border-bottom-color:#34382e; padding:6px 12px; text-align:left; border-radius:8px; display:flex; flex-direction:column; justify-content:center; gap:2px; }
        .recordList > button:hover { background:#ffffff06; border-color:#65614f; }
        .recordList > button.chosen { background:#bba36a14; border-color:#bba36a; }
        .resultHeading { display:flex; align-items:baseline; justify-content:space-between; gap:10px; width:100%; }
        .recordList strong { font-size:16px; font-weight:500; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .resultPlace { font-size:11px; color:#b2ae9e; flex-shrink:0; }
        .recordList small { -webkit-line-clamp:1; flex-shrink:0; font-size:12px; line-height:1.5; margin:0; opacity:.75; }
        .pager { justify-content:space-between; padding-top:3px; margin:auto 0 0; }
        .pager button { padding:7px 10px; font-size:12px; }
        .exploreLinks { display:grid; gap:1px; border:1px solid #494638; background:#494638; border-radius:12px; overflow:hidden; }
        .exploreLinks .pictureLink,.exploreLinks .journeyToggle { display:flex; align-items:center; gap:12px; padding:13px 16px; margin:0; min-width:0; text-align:left; background:#24251e; text-decoration:none; color:#e6d7b4; font-size:14px; border-radius:0; }
        .exploreLinks .pictureLink:hover,.exploreLinks .journeyToggle:hover { background:#323329; }
        .pictureLink svg { width:24px; height:24px; flex:none; }
        .exploreLinks small { display:block; margin-top:4px; font-size:11px; font-weight:400; color:#aaa694; }
        .exploreLinks > :global(*) > span:last-child { margin-left:auto; }
        .exploreLinks .journeyToggle { padding-left:52px; }
        .journeyLayout .panel { padding:16px; border:1px solid #494638; border-radius:12px; }
        .journeyResult { position:fixed; z-index:30; left:50%; top:80px; transform:translateX(-50%); width:min(500px,calc(100vw - 32px)); padding:24px; border:1px solid #baab83; border-radius:14px; background:#eee4ce; color:#28291f; box-shadow:0 12px 50px #0006; }
        .journeyResult h2 { font-size:19px; margin:0 28px 10px 0; }
        .journeyResult p { color:#5a574a; font-size:14px; }
        .journeyResult button { position:absolute; right:10px; top:10px; min-width:0; color:#383a2e; font-size:22px; padding:3px 10px; }
        .resultRoute { margin-top:16px; padding-top:14px; border-top:1px solid #bbb096; line-height:1.9; font-size:15px; }
        @media (min-width:861px) and (max-width:1200px) {
          .layout { grid-template-columns:270px minmax(0,1fr); }
          .layout.reading { grid-template-columns:270px minmax(0,1fr) 300px; }
          .searchBlock { padding:14px; }
        }
        @media (max-width:860px) {
          .geoPage { padding:8px; gap:0; }
          .toolbar { margin-bottom:8px; }
          h1 { font-size:19px; }
          .layout,.layout.reading { display:block; position:relative; min-height:0; }
          .panel,.mapStage,.detail.opened { position:absolute; inset:0; width:auto; height:auto; margin:0; display:none; box-sizing:border-box; }
          .mobile-search .panel { display:flex; }
          .mobile-map .mapStage { display:block; }
          .mobile-detail .detail.opened { display:flex; }
          .mobileNav { display:flex; flex:none; gap:6px; padding:7px 0 0; }
          .mobileNav button { flex:1; padding:9px 5px; font-size:13px; background:#24261f; }
          .mobileNav button[aria-pressed=true] { background:#e8d9ae; color:#27251e; }
          .journeyDock { position:absolute; bottom:64px; left:8px; right:8px; margin:0; padding:0; }
          .recordImage img { max-height:30dvh; }
        }

        .recordList h2 { flex:none; font-size:13px; line-height:1.4; }
        .recordList > button { min-height:64px; padding:8px 10px; gap:5px; }
        .resultHeading { flex:none; line-height:1.4; }
        .recordList strong { font-size:14px; line-height:1.4; }
        .recordList small { font-size:11px; line-height:1.5; }
        .resultPlace { font-size:10px; line-height:1.4; }
        .journeyLayout,.layout.reading.journeyLayout { display:block; position:relative; }
        .journeyLayout .mapStage { position:absolute; inset:0; width:100%; height:100%; display:block; }
        .journeyLayout .panel { position:absolute; top:16px; left:16px; z-index:8; width:340px; height:auto; padding:14px; background:#182018f2; border:1px solid #716849; border-radius:12px; }
        .journeyLayout .detail.opened { position:absolute; top:16px; right:16px; bottom:16px; z-index:7; width:350px; height:auto; background:#182018f5; }
        .journeyLayout.reading .journeyDock { right:382px; }
        .journeyLayout.reading .mapCredits { right:382px; }
        .journeyBrowsing .mapStage :global(.controls) { top:120px; }
        .journeyEntrance .panel { inset:0; width:100%; height:100%; border:0; border-radius:8px; background:#0e1713bf; display:flex; align-items:center; justify-content:center; padding:28px; backdrop-filter:blur(5px); }
        .journeyEntrance .detail.opened { display:none; }
        .journeyEntrance .panel :global(section[aria-label="妖怪をめぐる"]) { flex:0 1 auto!important; width:min(600px,100%); max-height:100%; padding:30px; border:1px solid #8b7a52; border-radius:18px; background:#1d251eea; box-shadow:0 12px 60px #0004; }
        .geoPage:has(.journeyEntrance) .mobileNav { display:none; }
        @media(max-height:740px) {
          .searchBlock { padding:12px 16px; }
          .blockHeading { margin-bottom:10px; font-size:16px; }
          .searchFilters { margin-top:10px; }
          .exploreLinks .pictureLink,.exploreLinks .journeyToggle { padding-top:9px; padding-bottom:9px; }
          .panel { gap:10px; }
        }
        @media(max-width:860px) {
          .journeyLayout .panel { width:auto; right:12px; left:12px; top:12px; }
          .journeyEntrance .panel { inset:0; padding:14px; }
          .journeyEntrance .panel :global(section[aria-label="妖怪をめぐる"]) { padding:20px; }
          .journeyBrowsing .panel { display:none; }
          .mobile-search .journeyBrowsing .panel { display:flex; }
          .journeyLayout .detail.opened { inset:0; width:auto; display:none; }
          .mobile-detail .journeyBrowsing .detail.opened { display:flex; }
          .journeyLayout.reading .journeyDock { right:8px; }
          .journeyLayout.reading .mapCredits { right:8px; }
        }

        .tabs { width:300px; }
        .tabs fieldset { border:0; border-bottom:1px solid #4d4b3c; margin:0; padding:10px 4px; display:grid; gap:9px; }
        .tabs fieldset:last-child { border-bottom:0; }
        .tabs legend { font-size:12px; color:#c8ba97; padding:0; }
        .tabs label { display:flex; align-items:center; justify-content:space-between; font-size:12px; gap:10px; }
        .tabs select { width:170px; font-size:12px; height:34px; }
        .tabs .checkSetting { justify-content:flex-start; }
        .tabs .checkSetting input { width:16px; height:16px; margin:0; }
        .tabs input[type=range] { width:150px; }
        .tabs fieldset>button { padding:7px 9px; font-size:12px; }
        .closeDetail { display:grid; place-items:center; width:44px; height:44px; padding:0; margin:0; background:transparent; font-size:24px; line-height:1; }
        .closeDetail:hover { background:#ffffff0d; }
        .closeDetail:focus-visible { outline:2px solid #e8d8a6; outline-offset:2px; }
        .detail h2 { margin-right:52px; }
        @media(max-width:860px){
          .mobile-map .journeyBrowsing .panel { display:flex; }
          .mobile-search .journeyBrowsing .panel { display:none; }
          .journeyBrowsing .panel { top:8px; bottom:auto; left:8px; right:8px; padding:10px; }
          .tabs { max-width:calc(100vw - 16px); }
        }
      `}</style>
    </main>
  );
}
