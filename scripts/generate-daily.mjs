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
let lesson,lastError='';
for(let attempt=0;attempt<3;attempt++){
  try{
    lesson=await geminiJSON({key,model:process.env.GEMINI_MODEL||'gemini-3.8-flash',system:lessonInstructions,prompt:'日期：'+date+'。避免重複最近題目：'+JSON.stringify(previous)+'. '+(lastError?'前次字數或格式不合格，請修正：'+lastError:'')});
    validateLesson(lesson);break;
  }catch(error){lastError=error.message;lesson=null;if(attempt===2)throw error;}
}
lesson={...lesson,id:date,date,source:'每日 AI 教材',createdAt:new Date().toISOString()};
data.lessons=data.lessons.filter(l=>l.id!==date);data.lessons.push(lesson);data.lessons.sort((a,b)=>a.date.localeCompare(b.date));
data.schedule={status:'active',timezone:'Asia/Taipei',time:'07:00',lastSuccessDate:date,lastSuccessAt:new Date().toISOString()};
await writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('Validated and generated lesson for '+date);
