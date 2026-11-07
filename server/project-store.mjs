import {readFile,writeFile,mkdir,rename,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProject} from '../shared/project.mjs';
export const validProjectId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export function projectStore(dataDir) {
  const directory=join(dataDir,'projects');
  const read=async id=>{
    if(!validProjectId(id)) throw Object.assign(Error('Invalid project ID'),{status:400});
    try {const record=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));return {...record,project:validateProject(record.project)};}
    catch(error) {if(error.code==='ENOENT') throw Object.assign(Error('Project not found'),{status:404});throw error;}
  };
  return {
    read,
    async list() {
      let files;
      try {files=await readdir(directory);} catch(error) {if(error.code==='ENOENT') return [];throw error;}
      const entries=await Promise.all(files.filter(file=>file.endsWith('.json')&&validProjectId(file.slice(0,-5))).map(file=>read(file.slice(0,-5))));
      return entries.map(({id,updatedAt,project})=>({id,updatedAt,name:project.name})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    },
    async save(project,id) {
      if(id) await read(id);
      else id=randomUUID();
      const record={id,updatedAt:new Date().toISOString(),project:validateProject(project)};
      await mkdir(directory,{recursive:true});
      const temporary=join(directory,randomUUID()+'.tmp');
      try {await writeFile(temporary,JSON.stringify(record,null,2)+'\n');await rename(temporary,join(directory,id+'.json'));}
      finally {await rm(temporary,{force:true});}
      return record;
    }
  };
}
