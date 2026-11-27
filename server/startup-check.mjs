import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkStorage} from './storage-check.mjs';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
export function startupConfig(env=process.env,{production=false}={}) {
  const value=env.PORT??'3001';
  if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)throw Error('PORT must be an integer from 1 to 65535');
  const path=(key,fallback)=>{
    if(env[key]!==undefined&&(!env[key].trim()||env[key].includes('\0')))throw Error(key+' must be a non-empty filesystem path');
    return resolve(env[key]??fallback);
  };
  return {port:Number(value),dataDir:path('TERRATEC_DATA_DIR',resolve(root,'data')),corePath:path('TERRATEC_CORE',resolve(root,'build/terratec-core')),staticDir:env.TERRATEC_STATIC_DIR!==undefined||production?path('TERRATEC_STATIC_DIR',resolve(root,'dist')):undefined};
}
export async function checkStartup(config) {
  const issues=[];
  try {
    const {stdout}=await run(config.corePath,['6','4','2.8'],{timeout:5000,maxBuffer:65536});
    const metrics=JSON.parse(stdout);if(metrics.area!==24)throw Error('unexpected geometry result');
  }catch{issues.push({code:'CORE_UNAVAILABLE',fatal:true,message:'Geometry core cannot run or returned an invalid result. Build terratec-core for this system or correct TERRATEC_CORE.'});}
  if(config.staticDir)try{const html=await readFile(resolve(config.staticDir,'index.html'),'utf8');if(!html.trim())throw Error('empty');}
  catch{issues.push({code:'STATIC_UNAVAILABLE',fatal:true,message:'Production index.html is missing or unreadable. Run npm run build or correct TERRATEC_STATIC_DIR.'});}
  const storage=await checkStorage(config.dataDir);
  issues.push(...storage.issues.map(issue=>({...issue,fatal:!storage.writable})));
  return {status:issues.some(i=>i.fatal)?'error':issues.length?'attention':'ok',issues,storage};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const config=startupConfig(process.env,{production:process.argv.includes('--production')}),report=await checkStartup(config);console.log(JSON.stringify({config,...report},null,2));if(report.status!=='ok')process.exitCode=1;}
  catch(error){console.error('Startup configuration: '+error.message);process.exitCode=1;}
}
