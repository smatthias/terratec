import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workshopCapacityStore} from './workshop-capacity-store.mjs';
import {makeServer} from './index.mjs';
import {checkStorage} from './storage-check.mjs';
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'terratec-capacity-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('capacity persists across instances and rejects stale concurrent saves',async t=>{
 const dir=await setup(t),store=workshopCapacityStore(dir);assert.deepEqual(await store.read(),{version:1,revision:0,workshops:[]});
 const input={expectedRevision:0,workshops:[{name:'Berlin',sheetsPerDay:8}]},results=await Promise.allSettled([store.save(input),store.save(input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const current=await workshopCapacityStore(dir).read();assert.equal(current.revision,1);assert.equal(current.workshops[0].sheetsPerDay,8);
 assert.equal((await store.save({expectedRevision:1,workshops:[]})).revision,2);
});
test('invalid or unsupported capacity records are preserved and reported by storage diagnostics',async t=>{
 const dir=await setup(t),file=join(dir,'workshop-capacity.json');for(const bytes of ['{broken',JSON.stringify({version:99,revision:1,workshops:[]})]) {
 await writeFile(file,bytes);const store=workshopCapacityStore(dir);await assert.rejects(()=>store.read(),e=>e.status===422);await assert.rejects(()=>store.save({expectedRevision:0,workshops:[]}),e=>e.status===422);assert.equal(await readFile(file,'utf8'),bytes);assert.ok((await checkStorage(dir)).issues.some(i=>i.code==='CAPACITY_INVALID'));
 }
});
test('capacity API validates payloads, methods, media types and save revisions',async t=>{
 const server=makeServer({dataDir:await setup(t)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port+'/api/workshops/capacity';
 const put=body=>fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await (await fetch(url)).json()).revision,0);assert.equal((await fetch(url,{method:'POST'})).status,405);assert.equal((await fetch(url,{method:'PUT',body:'{}'})).status,415);
 assert.equal((await put({expectedRevision:0,workshops:[{name:'Berlin',sheetsPerDay:-1}]})).status,400);
 assert.equal((await put({expectedRevision:0,workshops:[{name:'Berlin',sheetsPerDay:8}]})).status,200);assert.equal((await put({expectedRevision:0,workshops:[]})).status,409);
 assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:'['+' '.repeat(17000)})).status,413);
});
