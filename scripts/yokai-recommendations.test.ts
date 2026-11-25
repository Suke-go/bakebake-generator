import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendedYokai} from '../src/lib/yokai-recommendations';
const r=(id:string,name:string,prefecture:string,summary:string,image=false)=>({properties:{id,name,prefecture,summary,primary_image_url:image?'/registered.jpg':null}});
const text='夜に山の道を歩いていると、不思議な音が聞こえ、人の姿をした妖怪に出会ったという。';
test('recommendations favor readable complete stories and registered pictures, not input order',()=>{const rows=[r('long','鬼','東京','長い話'.repeat(300)),r('short','猫','京都','猫。'),r('good','狸','徳島',text,true)];assert.equal(recommendedYokai(rows,1)[0].properties.id,'good');assert.deepEqual(recommendedYokai(rows),recommendedYokai([...rows].reverse()));});
test('many same-name same-region records cannot crowd out varied recommendations',()=>{const rows=[...Array.from({length:900},(_,i)=>r('a'+i,'鬼','京都',text+i+'。',true)),r('z1','狐','青森',text+'狐。',true),r('z2','狸','徳島',text+'狸。',true)];const chosen=recommendedYokai(rows,3);assert.equal(new Set(chosen.map(r=>r.properties.name)).size,3);assert.equal(new Set(chosen.map(r=>r.properties.prefecture)).size,3);});
test('identical descriptions appear only once',()=>{assert.equal(recommendedYokai([r('1','鬼','京都',text),r('2','鬼','京都',text)]).length,1);});
