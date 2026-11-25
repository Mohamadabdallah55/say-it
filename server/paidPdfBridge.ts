import type { GenerateContentConfig, GenerateContentParameters } from '@google/genai';

export function usePaidPdfBridge() { return process.env.YAZAN_PAID_AI_MODE === 'openai'; }
export function paidPdfBridgeConfigured() { return usePaidPdfBridge() && Buffer.byteLength(process.env.NASHMI_SHARED_SECRET || '')>=32; }
export async function paidPdfBridge(params:{contents:GenerateContentParameters['contents'];config:GenerateContentConfig}):Promise<string>{
  if(!paidPdfBridgeConfigured()) throw new Error('Paid PDF bridge unavailable');
  type Part={type:'input_text';text:string}|{type:'input_image';image_url:string;detail:'low'}|{type:'input_file';filename:string;file_data:string;detail:'low'};
  const parts:Part[]=[];
  function add(value:unknown){
    if(typeof value==='string'){parts.push({type:'input_text',text:value});return;}
    if(Array.isArray(value)){value.forEach(add);return;}
    if(!value||typeof value!=='object') throw new Error('Unsupported PDF input');
    const p=value as {parts?:unknown; text?:unknown;inlineData?:{mimeType?:string;data?:string}};
    if(p.parts){add(p.parts);return;}
    if(typeof p.text==='string'){add(p.text);return;}
    const mime=p.inlineData?.mimeType,data=p.inlineData?.data;
    if(mime&&typeof data==='string'){
      if(mime==='application/pdf')parts.push({type:'input_file',filename:'lesson.pdf',file_data:'data:'+mime+';base64,'+data,detail:'low'});
      else if(/^image\/(png|jpeg|webp|gif)$/.test(mime))parts.push({type:'input_image',image_url:'data:'+mime+';base64,'+data,detail:'low'});
      else throw new Error('Unsupported PDF media');
      return;
    }
    throw new Error('Unsupported PDF input');
  }
  add(params.contents);
  const config=params.config;
  const instructions=(typeof config.systemInstruction==='string'?config.systemInstruction:'Analyze the supplied lesson faithfully.')+(config.responseSchema?' Return JSON matching this schema: '+JSON.stringify(config.responseSchema):'');
  const body=JSON.stringify({game:'yemken_hay',input:[{role:'user',content:parts}],instructions,json:config.responseMimeType==='application/json'||!!config.responseSchema,maxOutputTokens:Math.min(config.maxOutputTokens??6000,12000)});
  if(Buffer.byteLength(body)>19000000)throw new Error('PDF request too large for budget mode');
  const response=await fetch('https://three0s-guai.onrender.com/api/bot/platform-pdf',{method:'POST',headers:{'Content-Type':'application/json','X-Nashmi-Secret':process.env.NASHMI_SHARED_SECRET!},body,signal:AbortSignal.timeout(120000),redirect:'error'});
  if(!response.ok)throw new Error('PDF AI unavailable or monthly budget exhausted');
  const result=await response.json() as {text?:string;finishReason?:string};
  if(typeof result.text!=='string'||!result.text.trim()||result.finishReason==='MAX_TOKENS')throw new Error('Incomplete PDF AI output');
  return result.text;
}
