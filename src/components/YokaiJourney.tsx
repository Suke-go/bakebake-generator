'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {journeyChoices,journeyTraits,journeyStarts,randomJourneyStart,type JourneyFeature} from '@/lib/yokai-journey';
import {buildYokaiImageIndex,findYokaiImages,type YokaiImageRecord} from '@/lib/yokai-image-links';
import {PlayLogger} from '@/lib/play-log';
import styles from './YokaiJourney.module.css';

const short=(name:string|null)=> (name||'妖怪').split(/[；;，,、]/)[0];
/* eslint-disable @next/next/no-img-element */
function Flame(){return <img className={styles.flame} src="/journey-hinotama.png" alt=""/>;}
export function JourneyImage({name}:{name:string}) {
 const [records,setRecords]=useState<YokaiImageRecord[]>([]);
 useEffect(()=>{const controller=new AbortController();fetch('/youkai-gazou-catalog.json',{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(data=>setRecords(data.records||[])).catch(()=>{});return()=>controller.abort();},[]);
 const index=useMemo(()=>buildYokaiImageIndex(records),[records]);
 const image=useMemo(()=>findYokaiImages(index,name)[0],[index,name]);
 if(!image)return null;
 return <figure className={styles.illustration}><img src={image.imageUrl} alt={`同名の妖怪を描いた別資料：${image.name}`}/><figcaption>同名の妖怪を描いた別資料。この伝承に付属する画像ではありません。<br/><a href={image.sourceUrl} target="_blank" rel="noreferrer">画像の出典：日文研・怪異・妖怪画像DB ↗</a></figcaption></figure>;
}
export function JourneyPassage({feature,onPick}:{feature:JourneyFeature;onPick:(label:string)=>void}) {
 const traits=journeyTraits(feature);const text=feature.properties.summary||'';
 const words=[...traits].sort((a,b)=>b.word.length-a.word.length);
 const pieces:React.ReactNode[]=[];let start=0,index=0;
 while(index<text.length){const hit=words.find(t=>text.startsWith(t.word,index));if(!hit){index++;continue;}
  if(index>start)pieces.push(text.slice(start,index));
  pieces.push(<button className={styles.word} key={index} onClick={()=>onPick(hit.label)} aria-label={`「${hit.word}」からたどる`}>{hit.word}</button>);
  index+=hit.word.length;start=index;
 }
 pieces.push(text.slice(start));return <p className={styles.passage}>{pieces}</p>;
}
type Appraisal={text:string;sourceSpan:string;basis:string};
type Seed={id:string;name:string;summary:string;prefecture?:string};
type Phase='write'|'reading'|'confirm'|'searching'|'choose'|'browse';
export type JourneyResult={stories:number;regions:number;route:string[]};
export type JourneyStop={id:string;name:string;coordinates:number[]};
export default function YokaiJourney({records,selectedId,onVisit,onFinish,onPhase,onTrail,loading,hint}:{records:JourneyFeature[];selectedId:string|null;onVisit:(id:string)=>void;onFinish:(result:JourneyResult)=>void;onPhase:(phase:string)=>void;onTrail:(stops:JourneyStop[])=>void;loading:boolean;hint?:{label:string;serial:number}|null}) {
 const [account,setAccount]=useState(''),[eventText,setEventText]=useState(''),[appraisal,setAppraisal]=useState('');
 const [appraisals,setAppraisals]=useState<Appraisal[]>([]),[ticket,setTicket]=useState('');
 const [phase,setPhase]=useState<Phase>('write'),[error,setError]=useState('');
 useEffect(()=>onPhase(phase),[phase,onPhase]);
 // Opt-in play log: ids, ranks and timings only; written text is never sent.
 const [consent,setConsent]=useState(false),[logging,setLogging]=useState(false);
 const logger=useRef<PlayLogger|null>(null),ended=useRef(false),lastStep=useRef(0),originalEvent=useRef(''),shownKey=useRef('');
 const play=(type:string,payload:Record<string,unknown>)=>logger.current?.log(type,payload);
 const dwell=()=>{const now=logger.current?.now()??0;const ms=Math.max(0,Math.round(now-lastStep.current));lastStep.current=now;return ms;};
 function beginLog(entry:'experience'|'random'){if(!consent||logger.current)return;logger.current=PlayLogger.start('journey');setLogging(true);ended.current=false;lastStep.current=0;play('play_started',{mode:'journey',entry});}
 const [seeds,setSeeds]=useState<Seed[]>([]),[path,setPath]=useState<string[]>([]),[cursor,setCursor]=useState(-1),[visited,setVisited]=useState<string[]>([]);
 useEffect(()=>{if(phase==='browse'&&selectedId&&path[cursor]!==selectedId){play('hop',{fromId:path[cursor]??null,toId:selectedId,via:'map',rank:null,dwellMs:dwell(),revisit:visited.includes(selectedId)});setPath(p=>[...p.slice(0,cursor+1),selectedId]);setCursor(cursor+1);setVisited(v=>[...v,selectedId]);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[phase,selectedId,path,cursor]);
 useEffect(()=>{onTrail(visited.flatMap(id=>{const r=records.find(r=>String(r.properties.id)===id);return r?[{id,name:short(r.properties.name),coordinates:r.geometry.coordinates}]:[];}));},[visited,records,onTrail]);
 const starts=useMemo(()=>journeyStarts(records),[records]);
 const [picked,setPicked]=useState(''),[dock,setDock]=useState<HTMLElement|null>(null),[travel,setTravel]=useState('');
 const [seedPage,setSeedPage]=useState(0),[forkPage,setForkPage]=useState(0);
 const request=useRef<AbortController|null>(null),travelTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setDock(document.getElementById('journey-dock'));return()=>{request.current?.abort();if(travelTimer.current)clearTimeout(travelTimer.current);};},[]);
 useEffect(()=>{if(!dock)return;const stage=dock.parentElement!;const observer=new ResizeObserver(()=>{const height=dock.getBoundingClientRect().height;stage.style.setProperty('--journey-space',height>0?`${height+78}px`:'0px');});observer.observe(dock);return()=>{observer.disconnect();stage.style.removeProperty('--journey-space');};},[dock]);
 useEffect(()=>{if(hint){play('word_picked',{recordId:selectedId,label:hint.label});setPicked(hint.label);setPhase('browse');}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[hint]);
 const current=records.find(r=>String(r.properties.id)===selectedId);
 const traits=current?journeyTraits(current):[];
 const focus=traits.some(t=>t.label===picked)?picked:'';
 const ids=useMemo(()=>seeds.map(s=>s.id),[seeds]);
 const choices=useMemo(()=>journeyChoices(records,current,visited,ids,visited.length,'all',focus),[records,current,visited,ids,focus]);
 // The choice set matters as much as the pick: log what was offered each time it changes.
 useEffect(()=>{if(phase!=='browse'||!choices.length)return;const items=choices.map(c=>({id:String(c.feature.properties.id),relation:c.relation}));const key=JSON.stringify([selectedId,focus,items]);if(key===shownKey.current)return;shownKey.current=key;play('choices_shown',{fromId:selectedId,...(focus?{focus}:{}),items});
 },[phase,choices,selectedId,focus]);
 const summary=useRef({stories:0,regions:0,path:[] as string[]});
 useEffect(()=>{const explored=visited.map(id=>records.find(r=>String(r.properties.id)===id));summary.current={stories:new Set(visited).size,regions:new Set(explored.map(r=>r?.properties.prefecture).filter(Boolean)).size,path:visited.slice(-500)};},[visited,records]);
 useEffect(()=>()=>{if(logger.current&&!ended.current)logger.current.log('play_ended',{reason:'left',...summary.current});logger.current?.close();},[]);
 function visit(id:string,reset=false,via:'seed'|'card'|'random'='card',rank:number|null=null,relation?:string) {
  const next=records.find(r=>String(r.properties.id)===id);if(!next)return;
  play('hop',{fromId:reset?null:(path[cursor]??null),toId:id,via,rank,...(relation?{relation}:{}),...(focus&&via==='card'?{focus}:{}),dwellMs:dwell(),revisit:!reset&&visited.includes(id)});
  setPath(p=>reset?[id]:[...p.slice(0,cursor+1),id]);setCursor(reset?0:cursor+1);setVisited(v=>reset?[id]:[...v,id]);setPhase('browse');setError('');
  setForkPage(0);setTravel(`${short(next.properties.name)}の話へ`);if(travelTimer.current)clearTimeout(travelTimer.current);travelTimer.current=setTimeout(()=>setTravel(''),1400);onVisit(id);
 }
 function revisit(index:number){const id=path[index];if(!id)return;play('history_moved',{direction:index<cursor?'back':'forward',toId:id});dwell();setCursor(index);setVisited(v=>[...v,id]);onVisit(id);}
 function startRandom(){let previous='';try{previous=sessionStorage.getItem('journey-last-start')||'';}catch{}const next=randomJourneyStart(records,previous);if(next){const id=String(next.properties.id);try{sessionStorage.setItem('journey-last-start',id);}catch{}if(phase!=='browse')beginLog('random');setPicked('');visit(id,phase!=='browse','random');}}
 async function send(action:'interpret'|'search') {
  request.current?.abort();const abort=new AbortController();request.current=abort;setError('');setPhase(action==='interpret'?'reading':'searching');
  if(action==='interpret')beginLog('experience');
  else {const index=appraisals.findIndex(a=>a.text===appraisal);play('entry_confirmed',{appraisalIndex:index,appraisalEdited:index<0,eventEdited:eventText.trim()!==originalEvent.current.trim()});}
  try {
   const response=await fetch('/api/journey-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,experience:account,ticket,eventText,appraisalText:appraisal}),signal:abort.signal});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'検索できませんでした。');
   if(action==='interpret'){setTicket(data.ticket);setEventText(data.eventText);originalEvent.current=data.eventText;setAppraisals(data.appraisals);setAppraisal('');setPhase('confirm');play('entry_interpreted',{appraisalCount:data.appraisals.length});}
   else {const candidates:Seed[]=data.candidates||[];setSeeds(candidates);setSeedPage(0);setPhase('choose');play('seeds_shown',{ids:candidates.slice(0,20).map(s=>String(s.id))});}
  }catch(e){if(!abort.signal.aborted){play('entry_failed',{stage:action});setError(e instanceof Error?e.message:'検索できませんでした。');setPhase('write');}}
 }
 const browsing=phase==='browse';
 function finish(){const explored=visited.map(id=>records.find(r=>String(r.properties.id)===id)).filter((r):r is JourneyFeature=>Boolean(r));const route=explored.map(r=>short(r.properties.name)).filter((name,i,all)=>i===0||name!==all[i-1]);
  if(logger.current&&!ended.current){ended.current=true;play('play_ended',{reason:'finish',stories:new Set(visited).size,regions:new Set(explored.map(r=>r.properties.prefecture).filter(Boolean)).size,path:visited.slice(-500)});}
  onFinish({stories:new Set(visited).size,regions:new Set(explored.map(r=>r.properties.prefecture).filter(Boolean)).size,route});}
 const fork=<div className={styles.fork} aria-label="次の妖怪への分かれ道">
  <div className={styles.forkHeading}><span>次に読む話</span>{travel&&<span role="status">{travel}</span>}</div>
  {focus&&<div className={styles.focusNote} role="status">「{focus}」から探しています<button onClick={()=>{play('focus_cleared',{label:focus});setPicked('');}}>絞り込みを解除</button></div>}
  <div className={styles.cards}>{choices.map(({feature,reason,evidence,relation},i)=><button className={styles.card} data-active={i===Math.min(forkPage,choices.length-1)} key={feature.properties.id} onClick={()=>visit(String(feature.properties.id),false,'card',i,relation)}>
   <span className={styles.connection}>{reason}</span><strong>{short(feature.properties.name)}</strong><span className={styles.place}>{feature.properties.prefecture||''}</span>
   <span className={styles.excerpt}>{evidence?.to||feature.properties.summary}</span>
  </button>)}</div>
  {choices.length>1&&<nav className={styles.forkPager} aria-label="次の話の候補"><button disabled={forkPage===0} onClick={()=>setForkPage(p=>p-1)}>←</button><span>{Math.min(forkPage+1,choices.length)} / {choices.length}</span><button disabled={forkPage>=choices.length-1} onClick={()=>setForkPage(p=>p+1)}>→</button></nav>}
  {!choices.length&&<p>{loading?'ほかの話を読み込んでいます…':'この手掛かりでつながる未読の話はありません。別の言葉を拾うか、道を戻ってみてください。'}</p>}
 </div>;
 return <section className={styles.journey} data-phase={phase} aria-label="妖怪をめぐる">
  <div className={styles.journeyHeader}><h2><Flame/>{browsing?'妖怪をめぐる':'体験から、妖怪の世界へ'}</h2><button onClick={finish}>{browsing?'探索を終える':'地図に戻る'}</button></div>
  {phase==='write'&&<form onSubmit={e=>{e.preventDefault();void send('interpret');}}><p>あなたの体験を、妖怪の話への入口に。</p><label>最近あった嫌なこと<textarea value={account} onChange={e=>setAccount(e.target.value)} maxLength={2000} required placeholder="うまく言葉にできなくても大丈夫です。"/></label><button className={styles.primary} type="submit">体験を整理する →</button></form>}
  {(phase==='reading'||phase==='searching')&&<div className={styles.wait} role="status"><Flame/><p>{phase==='reading'?'出来事と受け止め方を整理しています…':'あなたの体験と伝承を読み比べています…'}</p><small>最初の検索だけ、少し時間がかかります。出発後はそのまま自由にめぐれます。</small></div>}
  {phase==='confirm'&&<form onSubmit={e=>{e.preventDefault();void send('search');}}><label>起きたこと<textarea value={eventText} onChange={e=>setEventText(e.target.value)} maxLength={1000} required/></label><fieldset><legend>どう受け止めましたか？</legend>{appraisals.map((a,i)=><label className={styles.appraisal} key={i}><input type="radio" name="appraisal" checked={appraisal===a.text} onChange={()=>setAppraisal(a.text)}/><span>{a.text}<small>あなたの言葉「{a.sourceSpan}」から</small></span></label>)}</fieldset><label>自分の言葉で直す<input value={appraisal} onChange={e=>setAppraisal(e.target.value)} maxLength={500}/></label><button className={styles.primary} disabled={!appraisal.trim()||!eventText.trim()}>この受け止め方で探す →</button></form>}
  {phase==='choose'&&<><h3>どの話から出発しますか？</h3><p>体験との重なりを感じる話を選んでください。</p>{seeds.slice(seedPage*3,seedPage*3+3).map((seed,i)=><button className={styles.seed} key={seed.id} disabled={!records.some(r=>String(r.properties.id)===seed.id)} onClick={()=>{visit(seed.id,true,'seed',seedPage*3+i);}}><strong>{seed.name}</strong><small>{seed.prefecture}</small><span>{seed.summary}</span></button>)}{seeds.length>3&&<nav className={styles.history} aria-label="出発する話の候補"><button disabled={seedPage===0} onClick={()=>setSeedPage(p=>p-1)}>前へ</button><span>{seedPage+1} / {Math.ceil(seeds.length/3)}</span><button disabled={(seedPage+1)*3>=seeds.length} onClick={()=>setSeedPage(p=>p+1)}>次へ</button></nav>}{!seeds.length&&<p>候補が見つかりませんでした。</p>}<button onClick={()=>{play('entry_rejected',{});setPhase('write');}}>しっくり来ない・体験を書き直す</button></>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {phase==='write'&&<label className={styles.consent}><input type="checkbox" checked={consent} disabled={logging} onChange={e=>setConsent(e.target.checked)}/><span>研究のため、この探索の操作（選んだ話、その順番と時間）を記録してよい。書いた文章は記録しません。</span></label>}
  {phase==='write'&&<button className={styles.randomStart} onClick={startRandom} disabled={!starts.length}>ランダムに出発</button>}
  {browsing&&<><div className={styles.travelControls}><nav className={styles.history} aria-label="めぐった道"><button disabled={cursor<=0} onClick={()=>revisit(cursor-1)}>← 戻る</button>{cursor<path.length-1&&<button onClick={()=>revisit(cursor+1)}>進む →</button>}</nav><span>{new Set(visited).size}件の話をめぐりました</span></div>
   {!choices.length&&!loading&&<button className={styles.restart} onClick={startRandom} disabled={!starts.length}>新しい妖怪から出発</button>}
   {dock?createPortal(fork,dock):fork}
  </>}
 </section>;
}
