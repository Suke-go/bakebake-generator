import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {createHash} from 'node:crypto';
import {getResearchSupabase} from '@/lib/research-server';
import {buildEventAppraisalPrompt} from '@/lib/prompt-builder';
import {searchByEventAndAppraisal} from '@/lib/event-appraisal-search';
export const runtime='nodejs';
export const maxDuration=120;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
    let body;
    try {const raw=await request.text();if(raw.length>16000)return reply({error:'入力が長すぎます。'},400);body=JSON.parse(raw);}catch{return reply({error:'入力を読み取れませんでした。'},400);}
    if(!body||typeof body.experience!=='string'||!body.experience.trim()||body.experience.length>2000||!['interpret','search'].includes(body.action))return reply({error:'体験を2000字以内で入力してください。'},400);
    const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin&&!['https://bakemon.net','https://www.bakemon.net'].includes(origin))return reply({error:'Origin not allowed'},403);
    const db=getResearchSupabase();
    if(!db||!process.env.JOURNEY_RURI_URL||!process.env.JOURNEY_RURI_TOKEN||!process.env.OPENAI_API_KEY)return reply({error:'体験からの検索を準備しています。気ままにめぐることはできます。'},503);
    const account=body.experience.trim(), hash=createHash('sha256').update(account).digest('hex');
    try {
        if(body.action==='interpret') {
            const {data:ticket,error}=await db.rpc('reserve_journey_entry',{p_account_hash:hash});
            if(error)return reply({error:'検索の利用枠を確認できませんでした。'},503);
            if(!ticket)return reply({error:'今月の体験検索の利用枠に達しました。気ままにめぐることはできます。'},429);
            const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:25000});
            const result=await client.chat.completions.create({model:'gpt-4o-mini',max_tokens:700,response_format:{type:'json_object'},messages:[{role:'user',content:buildEventAppraisalPrompt({id:'journey',text:''},{experience:account})}]});
            const parsed=JSON.parse(result.choices[0]?.message.content||'{}');
            const appraisals=Array.isArray(parsed.appraisals)?parsed.appraisals.filter((a:{text?:unknown;sourceSpan?:unknown})=>typeof a.text==='string'&&a.text.length<=500&&typeof a.sourceSpan==='string'&&a.sourceSpan.length>0&&account.includes(a.sourceSpan)).slice(0,4):[];
            if(typeof parsed.event?.text!=='string'||!parsed.event.text.trim()||!appraisals.length)return reply({error:'受け止め方を整理できませんでした。体験をもう少し具体的にしてお試しください。'},502);
            return reply({ticket,eventText:parsed.event.text.slice(0,1000),appraisals,engine:'chiir-event-appraisal'});
        }
        if(typeof body.ticket!=='string'||!/^[\da-f-]{36}$/i.test(body.ticket)||typeof body.eventText!=='string'||!body.eventText.trim()||body.eventText.length>1000||typeof body.appraisalText!=='string'||!body.appraisalText.trim()||body.appraisalText.length>500)return reply({error:'出来事と受け止め方を確認してください。'},400);
        const {data:claimed,error}=await db.rpc('claim_journey_entry',{p_ticket:body.ticket,p_account_hash:hash});
        if(error||!claimed)return reply({error:'検索の受付期限が切れたか、すでに検索済みです。入口からやり直してください。'},409);
        const result=await searchByEventAndAppraisal(account,body.eventText,body.appraisalText,10,async(query,candidates)=>{
            const response=await fetch(process.env.JOURNEY_RURI_URL!,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.JOURNEY_RURI_TOKEN}`},body:JSON.stringify({query,candidates}),signal:AbortSignal.timeout(85000)});
            if(!response.ok)throw new Error('rerank unavailable');
            const data=await response.json();if(!Array.isArray(data.ranked))throw new Error('invalid rerank');return data.ranked;
        });
        return reply({candidates:result.ranked,engine:'chiir-event-appraisal',corpusVersion:result.corpusVersion});
    }catch{return reply({error:'体験の検索を完了できませんでした。無料の語句検索へは切り替えていません。気ままにめぐることはできます。'},503);}
}
