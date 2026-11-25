'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type RecordFeature = GeoJSON.Feature<GeoJSON.Point, {
  id: string | null;
  name: string | null;
  categoryColor: string;
  terrainColor: string;
  primary_image_url?: string | null;
  summary?: string | null;
  image_fingerprint?: string;
}>;

export type RaceStop={id:string;name:string;coordinates:number[]};
/** Story race overlay: lettered offered stories, the target, an optional comparison route. */
/** A card drawn on the map beside its pin; text only, the viewer builds it with textContent. */
export type RaceCard={place:string;km:number;detour?:boolean;target?:boolean;locked?:boolean;note?:string;before?:string;word?:string;after?:string;excerpt?:string;landscape?:string};
export type RaceOverlay={candidates:(RaceStop&{label:string;card?:RaceCard})[];target:RaceStop|null;here?:RaceStop|null;compare?:RaceStop[];frame?:RaceStop[];detours?:{name:string;coordinates:number[];done:boolean}[];fit?:boolean};
export type MapViewOptions={background:string;perspective:string;edo:boolean;buildings:boolean;opacity:string};
export default function YokaiCityView({ features, terrain, points, names, images, density, focus, selectedId, onSelect,trail=[],fitTrail=false,race=null,viewOptions,edoVisit=0,src='/yokai-city-view/index.html' }: {
  /** Where the viewer page is served; the static archive edition lives under a base path. */
  src?: string;
  viewOptions?: MapViewOptions;
  edoVisit?: number;
  trail?: {id:string;name:string;coordinates:number[]}[];
  fitTrail?: boolean;
  race?: RaceOverlay|null;
  features: RecordFeature[];
  selectedId: string | null;
  terrain: boolean;
  points: boolean;
  names: boolean;
  images: boolean;
  density: boolean;
  focus: { coordinates: [number, number]; range: number } | null;
  onSelect: (id: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const records = useMemo(() => features.map(feature => ({
    id: String(feature.properties.id),
    name: feature.properties.name || '名前のない妖怪',
    coordinates: feature.geometry.coordinates,
    color: terrain ? feature.properties.terrainColor : feature.properties.categoryColor,
    image: feature.properties.primary_image_url || null,
    // The viewer reads the text only to tell apart pictures of one place.
    summary: feature.properties.primary_image_url ? feature.properties.summary || "" : "",
    imageFingerprint: feature.properties.image_fingerprint,
  })), [features, terrain]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setFailed(true), 30000);
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'yokai-city-ready') {
        clearTimeout(timeout);
        setReady(true);
        setFailed(false);
      }
      if (event.data?.type === 'yokai-city-select' && typeof event.data.id === 'string') onSelect(event.data.id);
      if (event.data?.type === 'yokai-city-error') setFailed(true);
    }
    window.addEventListener('message', receive);
    // The iframe may finish loading before React hydrates the server-rendered page.
    frame.current?.contentWindow?.postMessage({ type: 'yokai-city-init' }, window.location.origin);
    return () => { clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [onSelect, attempt]);

  useEffect(() => {
    // Records are sent only when the set changes; toggles and the selection go in a light message.
    if (ready) frame.current?.contentWindow?.postMessage({ type: 'yokai-city-records', records }, window.location.origin);
  }, [ready, records]);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ type: 'yokai-city-options', points, names, images, density, selectedId }, window.location.origin);
  }, [ready, points, names, images, density, selectedId]);

  useEffect(() => {
    if (ready && focus) frame.current?.contentWindow?.postMessage({ type: 'yokai-city-focus', ...focus }, window.location.origin);
  }, [ready, focus]);
  useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({type:'yokai-city-trail',stops:trail,fit:fitTrail},window.location.origin);},[ready,trail,fitTrail]);
  useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({type:'yokai-city-race',race},window.location.origin);},[ready,race]);
  useEffect(()=>{if(ready&&viewOptions)frame.current?.contentWindow?.postMessage({type:'yokai-city-settings',options:viewOptions},window.location.origin);},[ready,viewOptions]);
  useEffect(()=>{if(ready&&edoVisit)frame.current?.contentWindow?.postMessage({type:'yokai-city-edo-visit'},window.location.origin);},[ready,edoVisit]);

  return <div className="cityView">
    <iframe key={attempt} ref={frame} src={src} title="妖怪と古地図・都市を重ねる地図" onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'yokai-city-init' }, window.location.origin)} />
    {failed && <p role="alert">地図を読み込めませんでした。<button onClick={() => { setReady(false); setFailed(false); setAttempt(value => value + 1); }}>再読み込み</button></p>}
    <style jsx>{`
      .cityView { position: absolute; inset: 0; background: #171914; }
      iframe { width: 100%; height: 100%; border: 0; }
      p { position: absolute; top: 100px; left: 12px; right: 12px; padding: 12px; color: #fff; background: #552d22; border-radius: 8px; }
    `}</style>
  </div>;
}
