import {readFile,writeFile} from 'node:fs/promises';
import {geminiJSON,lessonInstructions,validateLesson,taipeiDate} from '../assets/core.mjs';
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
let lesson,lastError='',serviceRetries=0,contentRetries=0;
while(!lesson){
  try{
    lesson=await geminiJSON({key,model:models[modelIndex],system:lessonInstructions,prompt:'日期：'+date+'。避免重複最近題目：'+JSON.stringify(previous)+'. '+(lastError?'前次字數或格式不合格，請修正：'+lastError:'')});
    validateLesson(lesson);break;
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
      if(error.status||++contentRetries>=3)throw error;
      lastError=error.message;
    }
  }
}
lesson={...lesson,id:date,date,source:'每日 AI 教材',createdAt:new Date().toISOString()};
data.lessons=data.lessons.filter(l=>l.id!==date);data.lessons.push(lesson);data.lessons.sort((a,b)=>a.date.localeCompare(b.date));
data.schedule={status:'active',timezone:'Asia/Taipei',time:'07:00',lastSuccessDate:date,lastSuccessAt:new Date().toISOString()};
await writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('Validated and generated lesson for '+date);
