import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nativeViewerZip} from '../shared/native-viewer-adapter.mjs';
import {exportSimulationHandoff} from '../shared/simulation-handoff.mjs';
import {verifyNativeBundle} from '../shared/native-bundle-verifier.mjs';
import {readStoredZip,MAX_ADAPTER_ZIP_BYTES} from '../shared/stored-zip.mjs';
export function nativeCheckOptions(args,{render=false}={}){
 const allowed=['--engine-repo','--bundle','--report',...(render?['--backend']:[])],opts=new Map();
 for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||opts.has(args[i]))throw Error('Usage: --engine-repo PATH [--bundle FILE.zip] [--report FILE.json]'+(render?' [--backend xvfb|osmesa]':''));opts.set(args[i],args[i+1]);}
 if(!opts.has('--engine-repo'))throw Error('Provide --engine-repo');if(render&&!['xvfb','osmesa'].includes(opts.get('--backend')||'xvfb'))throw Error('Choose xvfb or osmesa backend');return opts;
}
export async function nativeCheckInput(path){
 let bytes;
 if(path){const file=await open(path,'r');try{const info=await file.stat();if(!info.isFile()||info.size>MAX_ADAPTER_ZIP_BYTES)throw Error('Native bundle exceeds archive size limit or is not a regular file');const data=new Uint8Array(info.size+1);let offset=0;while(offset<data.length){const {bytesRead}=await file.read(data,offset,data.length-offset,null);if(!bytesRead)break;offset+=bytesRead;}if(offset!==info.size)throw Error('Native bundle changed size while reading');bytes=data.subarray(0,offset);}finally{await file.close();}}
 else{const fixture=JSON.parse(await readFile(new URL('../fixtures/terraflux/handoff-legacy-v1.json',import.meta.url),'utf8'));({bytes}=await nativeViewerZip(await exportSimulationHandoff(JSON.stringify(fixture.model),fixture.mapping)));}
 const result=await verifyNativeBundle(bytes);
 return {manifest:result.manifest,files:readStoredZip(bytes),verification:{status:result.status,input:path?'supplied-archive':'generated-fixture',archiveSha256:createHash('sha256').update(bytes).digest('hex'),archiveBytes:bytes.length,admission:result.admission}};
}
