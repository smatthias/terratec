import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTerraFluxModel,exportTerraFluxModel,verifyTerraFluxModel} from './terraflux-model.mjs';
import {validateProject} from './project.mjs';
import {withActiveRoom,addProjectRoom,setProjectRoomPlacement,switchProjectRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening} from './opening-links.mjs';
import {createDesign} from './furniture-design-edit.mjs';
import {placedDesignItem} from './design-placement.mjs';
const at='2026-11-27T14:00:00Z';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Exchange',room:{width:6,depth:4,height:2.8}});
const cabinet={id:'cabinet',type:'cabinet',name:'Cabinet',width:.6,depth:.4,height:1.2,x:1,z:0,rotation:30,thickness:.018,shelves:1};
test('model exchange roundtrips with deterministic source and model hashes without mutating the project',async()=>{
 const p=base(),before=structuredClone(p),text=await exportTerraFluxModel(p,at),model=await verifyTerraFluxModel(text);assert.deepEqual(model,await createTerraFluxModel(p,at));assert.deepEqual(p,before);assert.match(model.modelSha256,/^[0-9a-f]{64}$/);assert.equal(model.units,'m');assert.equal(model.frame.up,'y');assert.equal(model.frame.georeference,null);
 const later=await createTerraFluxModel(p,'2026-11-28T14:00:00Z');assert.equal(later.source.sha256,model.source.sha256);assert.notEqual(later.modelSha256,model.modelSha256);
});
test('room placement rotates and translates wall planes and furniture in right-handed Y-up metres',async()=>{
 let p=validateProject(withActiveRoom(base(),{...base().room,furniture:[cabinet]}));p=setProjectRoomPlacement(p,'room-1',{x:10,z:20,rotation:90});const model=await createTerraFluxModel(p,at),r=model.rooms[0];
 assert.deepEqual(r.walls[0].start,{x:8,y:0,z:23});assert.deepEqual(r.walls[0].end,{x:8,y:0,z:17});assert.equal(r.walls[0].surfaces.length,1);assert.equal(r.walls[0].surfaces[0][2].y,2.8);
 assert.deepEqual(r.furniture[0].centre,{x:10,y:.6,z:19});assert.equal(r.furniture[0].rotationY,120);assert.deepEqual(r.furniture[0].size,{x:.6,y:1.2,z:.4});
 const normalY=poly=>{const [a,b,c]=poly;return (b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);};assert.ok(normalY(r.floor)>0);assert.ok(normalY(r.ceiling)<0);
});
test('door and window voids remove exact wall surface area without extending endpoints',async()=>{
 const p=validateProject(withActiveRoom(base(),{...base().room,openings:[{id:'door',type:'door',wall:'north',offset:1,width:1,height:2,sill:0},{id:'window',type:'window',wall:'north',offset:3,width:1,height:1,sill:1}]}));
 const r=(await createTerraFluxModel(p,at)).rooms[0],wall=r.walls[0];const area=wall.surfaces.reduce((s,q)=>s+Math.hypot(q[1].x-q[0].x,q[1].z-q[0].z)*(q[2].y-q[1].y),0);assert.ok(Math.abs(area-(6*2.8-3))<1e-8);assert.ok(wall.surfaces.flat().every(p=>p.x>=-3&&p.x<=3));assert.equal(wall.openings.length,2);assert.equal(wall.openings[1].start.y,1);
});
test('multiple rooms preserve scoped IDs, connection references and overlap warnings',async()=>{
 let p=addProjectRoom(base(),{id:'room-next',name:'Kitchen'});assert.equal((await createTerraFluxModel(p,at)).overlaps.length,1);p=setProjectRoomPlacement(p,'room-next',{x:6,z:0,rotation:0});p=switchProjectRoom(p,'room-1');p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'door',type:'door',wall:'east',offset:1,width:.9,height:2.1,sill:0}]}));p=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'door',id:'link',pairedOpeningId:'paired'});
 const a=await createTerraFluxModel(p,at),b=await createTerraFluxModel(switchProjectRoom(p,'room-next'),at);assert.deepEqual(a.rooms,b.rooms);assert.equal(a.overlaps.length,0);assert.equal(a.openingLinks[0].id,'link');assert.equal(a.rooms.flatMap(r=>r.walls.flatMap(w=>w.openings)).length,2);
});
test('placed designs export converted metre bounds and references rather than fabricated physical data',async()=>{
 let n=0;const design=createDesign({id:'box',name:'Box',template:'box',makeId:()=> 'b'+(++n)}),p=base();const source=validateProject({...p,schemaVersion:7,furnitureDesigns:[design],room:{...p.room,furniture:[placedDesignItem(design,{id:'placed'})]}}),f=(await createTerraFluxModel(source,at)).rooms[0].furniture[0];assert.equal(f.geometry,'oriented-bounding-box');assert.equal(f.designId,'box');assert.equal(f.size.x,source.room.furniture[0].width);assert.ok(f.size.x<10);assert.equal(f.materialId,null);
});
test('tampered geometry, source, units, version and oversized payloads are rejected',async()=>{
 const model=await createTerraFluxModel(base(),at);
 for(const change of [m=>m.rooms[0].floor[0].x++,m=>m.source.project.name='Altered',m=>m.units='mm',m=>m.frame.georeference={latitude:0},m=>m.modelSha256='bad',m=>m.version=2,m=>m.extra=true]) {const value=structuredClone(model);change(value);await assert.rejects(()=>verifyTerraFluxModel(JSON.stringify(value)));}
 await assert.rejects(()=>verifyTerraFluxModel('{bad'),/JSON/);await assert.rejects(()=>verifyTerraFluxModel(' '.repeat(2097153)),/2 MiB/);await assert.rejects(()=>createTerraFluxModel(base(),'bad'),/date/);
});
