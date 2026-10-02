import {readFile,writeFile} from 'node:fs/promises';
import {geminiJSON,lessonInstructions,validateLesson,taipeiDate,countWords,ranges,labels} from '../assets/core.mjs';
const file=new URL('../data/lessons.json',import.meta.url);
const data=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const date=taipeiDate();
// One publication per Taiwan date, including manual reruns.
if(data.lessons.some(l=>l.id===date)&&data.schedule.status==='active'){console.log('Today is already published.');process.exit(0);}
const key=process.env.GEMINI_API_KEY;
if(!key)throw new Error('Set the GEMINI_API_KEY repository Actions secret to enable daily lessons.');
const previous=data.lessons.slice(-30).map(l=>l.title);
const configured=process.env.GEMINI_MODEL?.trim();
let models=configured?[configured]:['gemini-3.8-flash'];
if(!configured){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
  if(response.ok){
    const available=(await response.json()).models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
    models=['gemini-3.8-flash','gemini-3-flash-preview','gemini-2.5-flash'].filter(m=>available.includes(m));
    if(!models.length)throw new Error('No supported Flash text model found. Set the GEMINI_MODEL repository variable to an available text model.');
  }
}
let modelIndex=0;
console.log('Available candidate models: '+models.join(', '));
let lesson,candidate,lastError='',serviceRetries=0,contentRetries=0;
while(!lesson){
  try{
    const measurements=Array.isArray(candidate?.paragraphs)?candidate.paragraphs.map((text,i)=>{
      const n=countWords(text),range=ranges[i];
      if(!range)return '多餘段落，請合併為四段';
      const target=Math.round((range[0]+range[1])/2);
      return `${labels[i]}段：實測${n}字，要求${range.join('～')}字；${n<range[0]?'補充約'+(target-n)+'字的具體細節':n>range[1]?'刪減約'+(n-target)+'字':'已合格，保留原文'}。`;
    }).join('\n'):'';
    const prompt=candidate?
      '修訂以下同一篇教材，不要重新選題。保留合格段落，只擴寫或精簡不合格段落。字數不含標點空白，不要以重複句子湊字。修訂後同步更新解析與佳句，title必須與題幹指定的題目一致。回傳完整教材JSON。\n'+measurements+'\n其他檢查：'+lastError+'\n上一版全文：'+JSON.stringify(candidate):
      '日期：'+date+'。避免重複最近題目：'+JSON.stringify(previous)+'。title必須與題幹指定的題目一致。四段請以95、255、270、130字為目標。'+lastError;
    candidate=await geminiJSON({key,model:models[modelIndex],system:lessonInstructions,prompt});
    validateLesson(candidate);lesson=candidate;
    console.log('Paragraph counts: '+lesson.paragraphs.map(countWords).join(', '));break;
  }catch(error){
    lesson=null;
    if([404,503].includes(error.status)&&modelIndex<models.length-1){
      modelIndex++;
      console.log('Switching unavailable model to '+models[modelIndex]);
      continue;
    }
    if([429,500,502,503,504].includes(error.status)||error.name==='TimeoutError'||error instanceof TypeError){
      const delays=[10000,30000,60000];
      if(serviceRetries>=delays.length)throw error;
      const delay=delays[serviceRetries++];
      console.log('AI service unavailable; retry '+serviceRetries+' in '+delay/1000+' seconds.');
      await new Promise(resolve=>setTimeout(resolve,delay));
    }else{
      if(error.status||++contentRetries>=6)throw error;
      lastError=error.message;
      console.log('Repairing lesson draft '+contentRetries+': '+lastError);
    }
  }
}
lesson={...lesson,id:date,date,source:'每日 AI 教材',createdAt:new Date().toISOString()};
data.lessons=data.lessons.filter(l=>l.id!==date);data.lessons.push(lesson);data.lessons.sort((a,b)=>a.date.localeCompare(b.date));
data.schedule={status:'active',timezone:'Asia/Taipei',time:'07:00',lastSuccessDate:date,lastSuccessAt:new Date().toISOString()};
await writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('Validated and generated lesson for '+date);
