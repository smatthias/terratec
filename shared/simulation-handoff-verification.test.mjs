import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {prepareSimulationHandoff,exportSimulationHandoff,verifySimulationHandoff} from './simulation-handoff.mjs';import {exportTerraFluxModel} from './terraflux-model.mjs';import {addProjectRoom} from './project-rooms.mjs';
const legacyText=await readFile(new URL('../fixtures/terraflux/handoff-legacy-v1.json',import.meta.url),'utf8'),legacy=JSON.parse(legacyText),text=JSON.stringify(legacy.model),mapping=legacy.mapping;
test('new handoffs verify checksum and derived data with stable roundtrip and no input mutation',async()=>{
 const exported=await exportSimulationHandoff(text,mapping),input=JSON.parse(exported),before=structuredClone(input),result=await verifySimulationHandoff(exported);assert.equal(result.integrity,'checksum-and-derived');assert.match(input.handoffSha256,/^[a-f0-9]{64}$/);assert.deepEqual(result.handoff,input);assert.deepEqual(input,before);
 const reordered=Object.fromEntries(Object.entries(input).reverse());assert.deepEqual((await verifySimulationHandoff(JSON.stringify(reordered))).handoff,input);
});
test('frozen pre-checksum v1 stays readable and reports its weaker integrity mode',async()=>{
 assert.equal(legacy.handoffSha256,undefined);const result=await verifySimulationHandoff(legacyText);assert.equal(result.integrity,'derived-only');await assert.rejects(()=>verifySimulationHandoff(legacyText,{requireChecksum:true}),/checksum is required/);const {handoffSha256,...payload}=result.handoff;assert.deepEqual(payload,legacy);assert.equal(await readFile(new URL('../fixtures/terraflux/handoff-legacy-v1.json',import.meta.url),'utf8'),legacyText);
 // Primary user material values in legacy files are not protected by a checksum.
 const changed=structuredClone(legacy);changed.mapping.materials[0].densityKgM3+=1;assert.equal((await verifySimulationHandoff(JSON.stringify(changed))).integrity,'derived-only');
});
test('changed material values, bindings, mesh data, hashes and execution flags are rejected',async()=>{
 const original=JSON.parse(await exportSimulationHandoff(text,mapping));
 for(const mutate of [h=>h.mapping.materials[0].densityKgM3++,h=>h.bindings[0].materialRef='unknown',h=>h.scene.surfaces[0].positions[0]++,h=>h.source.modelSha256='0'.repeat(64),h=>h.handoffSha256='0'.repeat(64),h=>h.simulationConnected=true,h=>h.validation.issues.push({code:'invented'}),h=>h.model.rooms[0].floor[0].x++,h=>h.extra=true]){const h=structuredClone(original);mutate(h);await assert.rejects(()=>verifySimulationHandoff(JSON.stringify(h)));}
 const old=structuredClone(legacy);old.scene.surfaces[0].positions[0]++;await assert.rejects(()=>verifySimulationHandoff(JSON.stringify(old)),/derived/);
});
test('blocked payloads, unsupported versions, missing models and invalid file sizes are rejected',async()=>{
 const blocked=await prepareSimulationHandoff(text,{...mapping,acceptZeroThickness:false});await assert.rejects(()=>verifySimulationHandoff(JSON.stringify(blocked)),/Blocked/);
 for(const value of [{...legacy,version:2},{...legacy,model:null},{...legacy,handoffSha256:null},[],null])await assert.rejects(()=>verifySimulationHandoff(JSON.stringify(value)));
 await assert.rejects(()=>verifySimulationHandoff(legacyText,{requireChecksum:'yes'}),/options/);
 await assert.rejects(()=>verifySimulationHandoff('{bad'),/JSON/);await assert.rejects(()=>verifySimulationHandoff(' '.repeat(8388609)),/8 MiB/);
});
test('nonzero placement and explicitly exported overlap warnings survive reconstruction',async()=>{
 const positioned=await exportSimulationHandoff(text,mapping,{placement:{x:10,y:2,z:20,yaw:90}});assert.deepEqual((await verifySimulationHandoff(positioned)).handoff.scene.placement,{x:10,y:2,z:20,yaw:90});
 const model=await exportTerraFluxModel(addProjectRoom(legacy.model.source.project,{id:'room-other',name:'Other'}));const overlap=await exportSimulationHandoff(model,mapping,{allowOverlaps:true});const result=await verifySimulationHandoff(overlap);assert.equal(result.handoff.scene.summary.rooms,2);assert.ok(result.handoff.scene.warnings.some(w=>w.includes('explicitly allowed')));
});
test('read-only CLI reports new and legacy verification modes and rejects invalid arguments',async t=>{
 const script=fileURLToPath(new URL('../scripts/check-simulation-handoff.mjs',import.meta.url)),file=fileURLToPath(new URL('../fixtures/terraflux/handoff-legacy-v1.json',import.meta.url));const old=JSON.parse(execFileSync(process.execPath,[script,file],{encoding:'utf8'}));assert.equal(old.integrity,'derived-only');assert.throws(()=>execFileSync(process.execPath,[script,file,'--require-checksum'],{stdio:'pipe'}),e=>e.status===1);
 const dir=await mkdtemp(join(tmpdir(),'terratec-handoff-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'new.json'),bytes=await exportSimulationHandoff(text,mapping);await writeFile(path,bytes);const result=JSON.parse(execFileSync(process.execPath,[script,path,'--require-checksum'],{encoding:'utf8'}));assert.equal(result.integrity,'checksum-and-derived');assert.equal(result.simulationConnected,false);assert.equal(await readFile(path,'utf8'),bytes);assert.throws(()=>execFileSync(process.execPath,[script],{stdio:'pipe'}),e=>e.status===1);
});
