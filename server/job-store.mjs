import {readFile,writeFile,mkdir,rename,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validProjectId} from './project-store.mjs';
import {createJobManifest} from '../shared/job-manifest.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function jobStore(dataDir){
  const directory=join(dataDir,'jobs');let queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const read=async id=>{
    if(!validProjectId(id))fail('Invalid job ID');
    try{return JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));}
    catch(e){if(e.code==='ENOENT')fail('Workshop job not found',404);throw e;}
  };
  const list=async()=>{
    let files;try{files=await readdir(directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    const records=await Promise.all(files.filter(f=>f.endsWith('.json')&&validProjectId(f.slice(0,-5))).map(f=>read(f.slice(0,-5))));
    return records.map(r=>({id:r.id,name:r.name,updatedAt:r.updatedAt,revision:r.revisions.length,status:r.revisions.at(-1).status})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  };
  const write=async record=>{
    await mkdir(directory,{recursive:true});const temporary=join(directory,randomUUID()+'.tmp');
    try{await writeFile(temporary,JSON.stringify(record)+'\n');await rename(temporary,join(directory,record.id+'.json'));}finally{await rm(temporary,{force:true});}
    return record;
  };
  const manifest=async project=>{try{return await createJobManifest(project);}catch(e){fail(e.message);}};
  const expected=(record,value)=>{if(!Number.isInteger(value)||value!==record.revisions.length)fail('Job changed; reload before editing',409);};
  return {read,list,
    create:input=>serial(async()=>{
      if(typeof input?.name!=='string'||!input.name.trim()||input.name.trim().length>80)fail('Job name must contain 1–80 characters');
      if((await list()).length>=50)fail('Maximum 50 local workshop jobs');
      const snapshot=await manifest(input.project),now=new Date().toISOString();
      return write({id:randomUUID(),name:input.name.trim(),createdAt:now,updatedAt:now,revisions:[{number:1,status:'planned',manifest:snapshot,review:null}]});
    }),
    revise:(id,input)=>serial(async()=>{
      const record=await read(id);expected(record,input?.expectedRevision);
      if(record.revisions.length>=20)fail('Maximum 20 revisions per workshop job');
      const snapshot=await manifest(input.project);
      if(snapshot.sourceSha256===record.revisions.at(-1).manifest.sourceSha256)fail('Current project already matches the latest revision',409);
      record.revisions.push({number:record.revisions.length+1,status:'planned',manifest:snapshot,review:null});record.updatedAt=new Date().toISOString();return write(record);
    }),
    review:(id,input)=>serial(async()=>{
      const record=await read(id);expected(record,input?.expectedRevision);
      const revision=record.revisions.at(-1);
      if(input.revision!==revision.number||revision.status!=='planned')fail('Only the latest planned revision can be reviewed',409);
      if(revision.manifest.validation.status==='blocked')fail('Resolve handoff blockers before marking reviewed');
      if(typeof input.reviewer!=='string'||!input.reviewer.trim()||input.reviewer.trim().length>80||typeof input.note!=='string'||!input.note.trim()||input.note.trim().length>1000)fail('Review needs a name (1–80) and notes (1–1000 characters)');
      revision.status='reviewed';revision.review={reviewer:input.reviewer.trim(),note:input.note.trim(),reviewedAt:new Date().toISOString()};record.updatedAt=revision.review.reviewedAt;return write(record);
    })
  };
}
