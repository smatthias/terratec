import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createDesign} from './furniture-design-edit.mjs';
import {placedDesignItem} from './design-placement.mjs';
import {exportTerraFluxModel} from './terraflux-model.mjs';
import {prepareSimulationHandoff,exportSimulationHandoff,validateHandoffMapping} from './simulation-handoff.mjs';
const text=await readFile(new URL('../fixtures/terraflux/model-v1.json',import.meta.url),'utf8');
const config=()=>({version:1,materials:[{id:'test-material',name:'Synthetic test material',densityKgM3:100,friction:.4,restitution:.1,sourceNote:'Synthetic fixture; not a recommendation'}],sourceMaterials:{oak:'test-material'},bodyOverrides:[],surfaceMaterialId:'test-material',acceptBoundingBoxes:true,acceptZeroThickness:true});
test('explicit materials bind surfaces and furniture without inferring mass or modifying source data',async()=>{
 const input=config(),before=structuredClone(input),h=await prepareSimulationHandoff(text,input);assert.equal(h.validation.status,'validated-reference');assert.equal(h.bindings.length,7);assert.ok(h.bindings.every(b=>b.materialRef==='test-material'));assert.equal(h.simulationConnected,false);assert.equal(h.scene.simulationConnected,false);assert.deepEqual(input,before);assert.ok(h.scene.bodies.every(b=>!('mass' in b)));assert.deepEqual(JSON.parse(await exportSimulationHandoff(text,input)),h);
});
test('missing mappings and unchecked geometry assumptions block handoff export',async()=>{
 const c={...config(),sourceMaterials:{},surfaceMaterialId:null,acceptBoundingBoxes:false,acceptZeroThickness:false},h=await prepareSimulationHandoff(text,c);assert.equal(h.validation.status,'blocked');for(const code of ['UNMAPPED','SURFACE_ASSUMPTION','BODY_ASSUMPTION'])assert.ok(h.validation.issues.some(i=>i.code===code));await assert.rejects(()=>exportSimulationHandoff(text,c),/blocking/);
});
test('scoped overrides take precedence and unknown references block rather than silently falling back',async()=>{
 const c={...config(),sourceMaterials:{},bodyOverrides:[{roomId:'room-1',furnitureId:'cab',materialId:'test-material'}]};assert.equal((await prepareSimulationHandoff(text,c)).validation.status,'validated-reference');
 for(const patch of [{bodyOverrides:[{roomId:'room-1',furnitureId:'missing',materialId:'test-material'}]},{surfaceMaterialId:'unknown'},{sourceMaterials:{oak:'unknown'}}])assert.equal((await prepareSimulationHandoff(text,{...config(),...patch})).validation.status,'blocked');
 const extra=await prepareSimulationHandoff(text,{...config(),sourceMaterials:{oak:'test-material',steel:'test-material'}});assert.equal(extra.validation.status,'validated-reference');assert.ok(extra.validation.issues.some(i=>i.code==='UNUSED_SOURCE'&&i.severity==='warning'));
});
test('invalid physical values, duplicates, unsupported fields and altered geometry are rejected',async()=>{
 for(const patch of [{densityKgM3:0},{densityKgM3:Infinity},{friction:-1},{restitution:2},{sourceNote:''},{densityKgM3:'100'},{mass:2}])assert.throws(()=>validateHandoffMapping({...config(),materials:[{...config().materials[0],...patch}]}));
 assert.throws(()=>validateHandoffMapping({...config(),materials:[...config().materials,...config().materials]}),/unique/);assert.throws(()=>validateHandoffMapping({...config(),extra:true}));assert.throws(()=>validateHandoffMapping({...config(),acceptZeroThickness:undefined}));const model=JSON.parse(text);model.rooms[0].floor[0].x++;await assert.rejects(()=>prepareSimulationHandoff(JSON.stringify(model),config()),/integrity/);
});

test('mixed-material placed designs require a scoped override rather than borrowing a cabinet material',async()=>{
 let n=0;const design=createDesign({id:'box',name:'Box',template:'box',makeId:()=> 'm'+(++n)}),base=JSON.parse(text).source.project;
 const model=await exportTerraFluxModel({...base,schemaVersion:7,furnitureDesigns:[design],room:{...base.room,furniture:[placedDesignItem(design,{id:'placed-box'})]}}),c=config();
 const missing=await prepareSimulationHandoff(model,c);assert.equal(missing.validation.status,'blocked');assert.ok(missing.validation.issues.some(i=>i.code==='UNMAPPED'));
 c.bodyOverrides=[{roomId:'room-1',furnitureId:'placed-box',materialId:'test-material'}];assert.equal((await prepareSimulationHandoff(model,c)).validation.status,'validated-reference');
});
