import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyChoices,journeyTraits,journeyStarts,randomJourneyStart,type JourneyFeature} from '../src/lib/yokai-journey';
const f=(id:string,name:string,summary:string,x=139):JourneyFeature=>({geometry:{coordinates:[x,35]},properties:{id,name,summary}});
test('hops require name or source-text connection, never distance alone',()=>{
 const fox=f('a','狐','女の姿に化けて、山道で人に出会った。');
 const rows=[fox,f('b','狸','男の姿に化けていた。',130),f('c','鬼','大男が相撲をとる。',141),f('d','狐','村で大切にされた。',132)];
 const result=journeyChoices(rows,fox,['a'],[],1);
 assert.deepEqual(new Set(result.map(r=>r.feature.properties.id)),new Set(['b','d']));
 const cross=result.find(r=>r.feature.properties.id==='b')!;
 assert.ok(cross.evidence?.from.includes(cross.evidence.fromWord));
 assert.ok(cross.evidence?.to.includes(cross.evidence.toWord));
 assert.deepEqual(journeyChoices(rows,fox,['a'],[],1,'name').map(r=>r.feature.properties.id),['d']);
});
test('same place and repeated name do not fill all three choices when alternatives connect',()=>{
 const source=f('a','文福茶釜','茶釜が踊っていた。');
 const copies=Array.from({length:8},(_,i)=>f('pot'+i,'文福茶釜',`茶釜が踊り、${i}人が見ていた。`));
 const rows=[source,...copies,f('fox','狐','狐が踊っていた。',130),f('cat','猫','猫が踊る。',142)];
 const result=journeyChoices(rows,source,['a'],[],1);
 assert.equal(new Set(result.map(r=>r.feature.properties.name)).size,3);
});
test('visited and copied records excluded; explicit negation does not add transformation',()=>{
 const source=f('a','狐','化ける。');
 assert.equal(journeyChoices([source,f('copy','狐','化ける。')],source,['a'],[],1).length,0);
 assert.equal(journeyTraits(f('n','狐','化けることはない。')).some(t=>t.label==='姿を変える'),false);
});
test('picked words restrict forks and preserve the different actions in source excerpts',()=>{
 const source=f('a','河童','橋の下で相撲をとる。');
 const rows=[source,f('b','狐','狐の相撲を見た。',130),f('c','鬼','鬼との相撲の絵馬を見た。',141),f('d','河童','川で魚を釣る。')];
 const result=journeyChoices(rows,source,['a'],[],1,'all','相撲');
 assert.deepEqual(new Set(result.map(r=>r.feature.properties.id)),new Set(['b','c']));
 assert.ok(result.find(r=>r.feature.properties.id==='c')?.evidence?.to.includes('絵馬'));
});
test('random starts use reviewed image/place records, sample anew and exclude the previous start',()=>{
 const first=f('U426_nichibunken_0061_0001_0000','鬼','朱雀門で双六を打つ。');first.properties.primary_image_url='/a.jpg';
 const last=f('U426_nichibunken_0130_0001_0000','鞍馬天狗','鞍馬山で稽古をする。');last.properties.primary_image_url='/b.jpg';
 const unrelated=f('other','狐','名だけが同じ。');unrelated.properties.primary_image_url='/borrowed.jpg';
 const withoutImage=f('U426_nichibunken_0152_0002_0000','清姫','切目川を渡る。');
 const records=[first,last,unrelated,withoutImage];
 assert.deepEqual(journeyStarts(records),[first,last]);
 assert.equal(randomJourneyStart(records,'',()=>0),first);
 assert.equal(randomJourneyStart(records,'',()=>.999),last);
 assert.equal(randomJourneyStart(records,String(first.properties.id),()=>0),last);
 assert.equal(randomJourneyStart([unrelated]),undefined);
});
