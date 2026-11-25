import { yokaiNameKeys } from './yokai-image-links';
export type JourneyFeature = { geometry: { coordinates: number[] }; properties: { id: string | null; name: string | null; summary?: string | null; prefecture?: string | null; primary_image_url?: string | null } };
export type JourneyLens = 'all' | 'appearance' | 'act' | 'encounter' | 'setting' | 'name';
// Editorial browsing vocabulary, not a historical classification. Links retain source text.
const vocabulary: Array<{lens: JourneyLens; label:string; terms:string[]}> = [
    {lens:'appearance',label:'ひとつ目',terms:['一つ目','一ツ目','隻眼']},
    {lens:'appearance',label:'長い首',terms:['首が長','首を伸','首が伸']},
    {lens:'appearance',label:'大きな体',terms:['大男','巨人','巨大']},
    {lens:'appearance',label:'人の姿',terms:['人の姿','人間の姿','女の姿','男の姿']},
    {lens:'appearance',label:'毛に覆われた姿',terms:['毛むくじゃら','毛深','全身に毛']},
    {lens:'act',label:'姿を変える',terms:['化ける','化けた','化けて','変身']},
    {lens:'act',label:'人を惑わす',terms:['化かす','化かされ','道に迷','迷わせ']},
    {lens:'act',label:'不思議な音',terms:['音がする','音がした','音を立て','音をたて']},
    {lens:'act',label:'踊る',terms:['踊る','踊り','踊って','踊った']},
    {lens:'act',label:'光る',terms:['光る','光って','発光','光を放']},
    {lens:'act',label:'相撲',terms:['相撲','すもう']},
    {lens:'encounter',label:'恩を返す',terms:['恩返し','恩を返']},
    {lens:'encounter',label:'助けを求める',terms:['助けて','助けを求']},
    {lens:'encounter',label:'食べ物',terms:['食べ物','食物','飯','餅']},
    {lens:'encounter',label:'連れ去られる',terms:['連れ去','さらわれ','神隠し']},
    {lens:'encounter',label:'祟り',terms:['祟り','祟る','たたり']},
    {lens:'setting',label:'橋',terms:['橋']},
    {lens:'setting',label:'峠',terms:['峠']},
    {lens:'setting',label:'井戸',terms:['井戸']},
    {lens:'setting',label:'川辺',terms:['川辺','川岸','川原','河原']},
    {lens:'setting',label:'山道',terms:['山道','山路']},
    {lens:'setting',label:'夜更け',terms:['夜中','深夜','真夜中']},
    {lens:'setting',label:'道具',terms:['茶釜','提灯','傘','履物']},
];
const names=(f:JourneyFeature)=>yokaiNameKeys(f.properties.name||'').filter(n=>!['俗信','妖怪','怪異','その他'].includes(n));
const title=(f:JourneyFeature)=>names(f)[0]||'';
// Reviewed starts: the registered image depicts the narrated scene and its
// explicit place also matches the archive's spatial coverage. No borrowed image.
const START_IDS=new Set(['U426_nichibunken_0061_0001_0000','U426_nichibunken_0090_0001_0000','U426_nichibunken_0130_0001_0000','U426_nichibunken_0152_0008_0000','U426_nichibunken_0152_0002_0000','U426_nichibunken_0152_0011_0000']);
export function journeyStarts<T extends JourneyFeature>(records:T[]){return records.filter(r=>START_IDS.has(String(r.properties.id))&&r.properties.primary_image_url&&r.properties.summary&&r.geometry.coordinates.length>=2&&r.geometry.coordinates.every(Number.isFinite));}
export function randomJourneyStart<T extends JourneyFeature>(records:T[],previousId='',random:()=>number=Math.random){const starts=journeyStarts(records);const pool=starts.length>1?starts.filter(r=>String(r.properties.id)!==previousId):starts;return pool[Math.floor(random()*pool.length)];}
const cache=new WeakMap<JourneyFeature,Array<{lens:JourneyLens;label:string;word:string;excerpt:string}>>();
export function journeyTraits(record:JourneyFeature) {
    const cached=cache.get(record);if(cached)return cached;
    const body=record.properties.summary||'';
    const found=vocabulary.flatMap(v=>{
        const word=v.terms.find(term=>{
            const start=body.indexOf(term);if(start<0)return false;
            return !/^(?:ない|なかった|ず|ことはない|のではない|ということはない)/.test(body.slice(start+term.length));
        });
        if(!word)return [];
        const index=body.indexOf(word),start=Math.max(0,body.lastIndexOf('。',index-1)+1),end=body.indexOf('。',index);
        return [{lens:v.lens,label:v.label,word,excerpt:body.slice(start,end<0?body.length:end+1).slice(0,180)}];
    });
    cache.set(record,found);return found;
}
export function journeyChoices<T extends JourneyFeature>(records:T[],current:T|undefined,visited:string[],seeds:string[],turn:number,lens:JourneyLens='all', focusLabel='') {
    const seen=new Set(visited), recent=records.filter(r=>visited.slice(-5).includes(String(r.properties.id)));
    const sourceTraits=current?journeyTraits(current):[];
    const hash=(s:string)=>{let v=turn*7919;for(const c of s)v=(v*31+c.charCodeAt(0))>>>0;return v;};
    const pool=records.flatMap(feature=>{
        if(seen.has(String(feature.properties.id))||feature.properties.id===current?.properties.id||!feature.properties.summary)return [];
        if(current&&feature.properties.summary===current.properties.summary&&title(feature)===title(current))return [];
        const sameName=current?names(feature).find(n=>names(current).includes(n)):undefined;
        const shared=journeyTraits(feature).find(t=>sourceTraits.some(s=>s.label===t.label)&&(lens==='all'||lens===t.lens)&&(!focusLabel||t.label===focusLabel));
        const seed=seeds.indexOf(String(feature.properties.id));
        if(current && !(sameName&&!focusLabel&&(lens==='all'||lens==='name')) && !shared) return [];
        const relation=shared ? shared.lens : sameName?'name':'all';
        const reason=relation==='name'?`共通する呼び名「${sameName}」`:shared?`共通する手がかり「${shared.label}」`:seed>=0?'あなたの体験から':'この妖怪から出発';
        const from=shared?sourceTraits.find(t=>t.label===shared.label):undefined;
        const distance=current?Math.hypot(feature.geometry.coordinates[0]-current.geometry.coordinates[0],feature.geometry.coordinates[1]-current.geometry.coordinates[1]):0;
        const repeated=recent.filter(r=>title(r)===title(feature)).length;
        const score=(shared?5:0)+(sameName?3:0)+(seed>=0?2:0)+Math.min(1,distance/3)-repeated*2+(hash(String(feature.properties.id))%100)/1000;
        return [{feature,reason,relation,score,evidence:shared?{from:from!.excerpt,to:shared.excerpt,fromWord:from!.word,toWord:shared.word}:null}];
    });
    // MMR-style reranking: preserve connections, reduce repeated names/places/relations.
    const result:typeof pool=[]; const used=new Set<string>();
    while(result.length<3) {
        let best:typeof pool[number]|undefined,bestScore=-Infinity;
        for(const item of pool) {
            const p=item.feature.properties;
            const key=JSON.stringify([title(item.feature),p.summary,p.primary_image_url]);
            if(used.has(key))continue;
            const penalty=Math.max(0,...result.map(r=>(title(r.feature)===title(item.feature)?4:0)+(Math.hypot(r.feature.geometry.coordinates[0]-item.feature.geometry.coordinates[0],r.feature.geometry.coordinates[1]-item.feature.geometry.coordinates[1])<.3?3:0)+(r.relation===item.relation?1:0)));
            if(item.score-penalty>bestScore){best=item;bestScore=item.score-penalty;}
        }
        if(!best)break;
        result.push(best);used.add(JSON.stringify([title(best.feature),best.feature.properties.summary,best.feature.properties.primary_image_url]));
    }
    return result;
}
