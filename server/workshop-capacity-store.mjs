import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateWorkshopCapacity} from '../shared/workshop-capacity.mjs';
const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
export function workshopCapacityStore(dataDir) {
  const file=join(dataDir,'workshop-capacity.json');let queue=Promise.resolve();
  const read=async()=>{
    try{const record=JSON.parse(await readFile(file,'utf8'));if(record.version!==1||!Number.isSafeInteger(record.revision)||record.revision<0)throw Error('Unsupported capacity record');return {version:1,revision:record.revision,workshops:validateWorkshopCapacity(record.workshops)};}
    catch(error){if(error.code==='ENOENT')return {version:1,revision:0,workshops:[]};if(error.code)throw error;fail('Workshop capacity file is unreadable or unsupported. Restore its backup; the original has been kept.',422);}
  };
  return {read,save(input){const next=queue.then(async()=>{
    let workshops;try{workshops=validateWorkshopCapacity(input?.workshops);}catch(error){fail(error.message,400);}
    const current=await read();if(input.expectedRevision!==current.revision)fail('Workshop capacity changed; reload before saving',409);
    const record={version:1,revision:current.revision+1,workshops};await mkdir(dataDir,{recursive:true});const temporary=join(dataDir,'.capacity-'+randomUUID()+'.tmp');
    try{await writeFile(temporary,JSON.stringify(record)+'\n',{flag:'wx'});await rename(temporary,file);}finally{await rm(temporary,{force:true});}return record;
  });queue=next.catch(()=>{});return next;}};
}
