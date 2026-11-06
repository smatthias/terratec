import { createServer } from 'node:http';
import { readFile, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import {MAX_JOB_BACKUP_BYTES} from '../shared/job-backup.mjs';
import {jobStore} from './job-store.mjs';
import { projectStore } from './project-store.mjs';
import { validateProject } from './project.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
export function makeServer({ dataDir = resolve(root, 'data'), corePath = resolve(root, 'build/terratec-core') } = {}) {
  const projects=projectStore(dataDir),jobs=jobStore(dataDir);
  return createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const restoring=path==='/api/jobs/restore';
      const jobMatch=path.match(/^\/api\/jobs\/([^/]+)(?:\/(revisions|review|fulfilment|quotes))?$/);
      if(path==='/api/jobs'||jobMatch){
        if(req.method==='GET'&&path==='/api/jobs')return send(200,await jobs.list());
        if(req.method==='GET'&&jobMatch&&!jobMatch[2]&&!restoring)return send(200,await jobs.read(jobMatch[1]));
        if(req.method!=='POST'||(jobMatch&&!jobMatch[2]&&!restoring))return send(405,{error:'Method not allowed'});
        if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))return send(415,{error:'Use application/json'});
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>(restoring?MAX_JOB_BACKUP_BYTES:131072))return send(413,{error:restoring?'Job backup exceeds 16 MiB':'Job request exceeds 128 KiB'});chunks.push(chunk);}
        let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'Invalid job JSON'});}
        const record=restoring?await jobs.restore(input):path==='/api/jobs'?await jobs.create(input):jobMatch[2]==='revisions'?await jobs.revise(jobMatch[1],input):jobMatch[2]==='review'?await jobs.review(jobMatch[1],input):jobMatch[2]==='quotes'?await jobs.quote(jobMatch[1],input):await jobs.fulfil(jobMatch[1],input);
        return send(path==='/api/jobs'||restoring?201:200,record);
      }
      const projectMatch=path.match(/^\/api\/projects\/([^/]+)$/);
      if(req.method==='GET' && path==='/api/projects') return send(200,await projects.list());
      if(req.method==='GET' && projectMatch) return send(200,await projects.read(projectMatch[1]));
      if (req.method === 'GET' && path === '/api/health') return send(200, { status: 'ok' });
      if (req.method === 'GET' && path === '/api/project') {
        try { return send(200, validateProject(JSON.parse(await readFile(join(dataDir, 'project.json'), 'utf8')))); }
        catch (error) { if (error.code === 'ENOENT') return send(404, { error: 'No saved project yet' }); throw error; }
      }
      if (req.method !== 'PUT' && req.method !== 'POST') return send(404, { error: 'Route not found' });
      if (path !== '/api/project' && path !== '/api/geometry' && path !== '/api/projects' && !projectMatch) return send(404, { error: 'Route not found' });
      if ((path === '/api/project' && req.method !== 'PUT') || (path === '/api/geometry' && req.method !== 'POST') || (path==='/api/projects' && req.method!=='POST') || (projectMatch && req.method!=='PUT'))
        return send(405, { error: 'Method not allowed' });
      // The development service accepts same-origin JSON requests only.
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json'))
        return send(415, { error: 'Use application/json' });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { send(413, { error: 'Project exceeds 64 KiB' }); return; }
        chunks.push(chunk);
      }
      let project;
      try { project = validateProject(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return send(400, { error: error.message }); }
      if(path==='/api/projects' || projectMatch) return send(path==='/api/projects'?201:200,await projects.save(project,projectMatch?.[1]));
      if (path === '/api/geometry') {
        try {
          const { height, outline } = project.room;
          const { stdout } = await run(corePath, ['--polygon', height, ...outline.flatMap(p => [p.x,p.z])].map(String), { timeout: 5000 });
          return send(200, JSON.parse(stdout));
        } catch { return send(503, { error: 'Geometry core unavailable. Build terratec-core first.' }); }
      }
      await mkdir(dataDir, { recursive: true });
      const temporary = join(dataDir, `${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(project, null, 2) + '\n');
        await rename(temporary, join(dataDir, 'project.json'));
      } finally { await rm(temporary, { force: true }); }
      send(200, project);
    } catch (error) {
      if(!error.status) console.error(error);
      if (!res.headersSent) send(error.status||500, { error: error.status?error.message:'Project service failed' });
      else res.end();
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  makeServer({ dataDir: process.env.TERRATEC_DATA_DIR, corePath: process.env.TERRATEC_CORE })
    .listen(port, '127.0.0.1', () => console.log(`TerraTec API: http://127.0.0.1:${port}`));
}
