type ReadableRecord={properties:{id:string|null;name:string|null;summary?:string|null;prefecture?:string|null;primary_image_url?:string|null}};
// Editorial entry ranking, not learned relevance: complete, short descriptions
// and registered images, with diminishing returns for repeated names/regions.
export function recommendedYokai<T extends ReadableRecord>(records:T[],limit=60):T[]{
 const name=(r:T)=>(r.properties.name||'').split(/[；;，,、]/)[0].trim();
 const buckets=new Map<string,number>();
 const pool=records.filter(r=>r.properties.summary&&name(r)).map(r=>{const text=r.properties.summary!.trim();return {r,score:(r.properties.primary_image_url?2:0)+(text.length>=35&&text.length<=280?3:text.length<=500?1:0)+(/[。！？]$/.test(text)?1:0)+(name(r).length<=12?1:0),name:name(r),text:text.replace(/\s+/g,'')};}).sort((a,b)=>b.score-a.score||String(a.r.properties.id).localeCompare(String(b.r.properties.id))).filter(p=>{const key=p.name+'|'+(p.r.properties.prefecture||'');const n=buckets.get(key)||0;buckets.set(key,n+1);return n<2;}).slice(0,800);
 const result:T[]=[],names=new Map<string,number>(),regions=new Map<string,number>(),seen=new Set<string>();
 while(result.length<limit){let index=-1,best=-Infinity;for(let i=0;i<pool.length;i++){const p=pool[i];if(seen.has(p.text))continue;const region=p.r.properties.prefecture||'';const score=p.score-4*(names.get(p.name)||0)-(region?2*(regions.get(region)||0):0);if(score>best){best=score;index=i;}}
 if(index<0)break;const chosen=pool.splice(index,1)[0],region=chosen.r.properties.prefecture||'';result.push(chosen.r);seen.add(chosen.text);names.set(chosen.name,(names.get(chosen.name)||0)+1);if(region)regions.set(region,(regions.get(region)||0)+1);}
 return result;
}
