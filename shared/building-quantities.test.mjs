import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {validateProject} from './project.mjs';
import {withActiveRoom,addProjectRoom,setProjectRoomPlacement,switchProjectRoom} from './project-rooms.mjs';
import {rectangle} from './geometry.mjs';
import {buildingQuantities,buildingQuantitiesJson,buildingQuantitiesCsv} from './building-quantities.mjs';
import {connectRoomOpening,unlinkRoomOpening} from './opening-links.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Quantities',room:{width:6,depth:4,height:2.8}});
const pair=(x=6,z=0,rotation=0)=>setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Next'}),'room-next',{x,z,rotation});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('legacy room quantities match native polygon metrics for a nonrectangular outline',()=>{
 const outline=[{x:-3,z:-2},{x:3,z:-2},{x:2,z:2},{x:-3,z:2}],p=validateProject(withActiveRoom(base(),{...base().room,height:3,outline}));
 const native=JSON.parse(execFileSync(new URL('../build/terratec-core',import.meta.url).pathname,['--polygon','3',...outline.flatMap(p=>[String(p.x),String(p.z)])],{encoding:'utf8'}));
 const q=buildingQuantities(p);assert.equal(q.totals.roomCount,1);close(q.rooms[0].floorArea,native.area);close(q.rooms[0].interiorVolume,native.volume);close(q.rooms[0].perimeter,native.perimeter);
 close(q.totals.combinedFloorArea,22);close(q.totals.combinedInteriorVolume,66);
});
test('adjoining rooms count common boundary lines once and retain both room-facing wall surfaces',()=>{
 const q=buildingQuantities(pair()),t=q.totals;assert.equal(q.status,'non-overlapping-rooms');close(t.combinedFloorArea,48);close(t.combinedInteriorVolume,134.4);
 close(t.perimeterSum,40);close(t.sharedBoundaryLength,4);close(t.uniqueBoundaryLength,36);close(t.exposedBoundaryLength,32);close(t.grossWallFaceArea,112);close(t.netWallFaceArea,112);
});
test('overlaps withhold combined totals without disguising the raw room sums as union quantities',()=>{
 const q=buildingQuantities(pair(0)),t=q.totals;assert.equal(q.status,'overlapping-rooms');assert.equal(q.overlaps.length,1);close(t.roomAreaSum,48);close(t.roomVolumeSum,134.4);close(t.perimeterSum,40);
 for(const key of ['combinedFloorArea','combinedInteriorVolume','sharedBoundaryLength','uniqueBoundaryLength','exposedBoundaryLength'])assert.equal(t[key],null);
 assert.match(buildingQuantitiesCsv(pair(0)),/"combinedFloorArea","","m²","withheld-overlapping-rooms"/);
});
test('partial adjacency and unequal heights contribute the correct area, volume and boundary length',()=>{
 let p=pair(6,1);p=validateProject(withActiveRoom(p,{...p.room,outline:rectangle(6,2),height:2}));const t=buildingQuantities(p).totals;
 close(t.roomAreaSum,36);close(t.roomVolumeSum,91.2);close(t.sharedBoundaryLength,2);close(t.perimeterSum,36);close(t.uniqueBoundaryLength,34);close(t.exposedBoundaryLength,32);close(t.grossWallFaceArea,88);
});
test('only explicit door/window links reduce logical counts while wall finish areas retain both faces',()=>{
 let p=switchProjectRoom(pair(),'room-1');p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'door',type:'door',wall:'east',offset:.2,width:.9,height:2.1,sill:0},{id:'window',type:'window',wall:'east',offset:2,width:.9,height:1,sill:.8}]}));
 const candidateId=roomAdjacencies(p.rooms)[0].id;
 p=connectRoomOpening(p,{candidateId,sourceRoomId:'room-1',openingId:'door',id:'door-link',pairedOpeningId:'door-other'});
 p=connectRoomOpening(p,{candidateId,sourceRoomId:'room-1',openingId:'window',id:'window-link',pairedOpeningId:'window-other'});
 const t=buildingQuantities(p).totals;assert.equal(t.doorRecords,2);assert.equal(t.windowRecords,2);assert.equal(t.logicalDoors,1);assert.equal(t.logicalWindows,1);assert.equal(t.linkedDoorPairs,1);assert.equal(t.linkedWindowPairs,1);close(t.openingFaceArea,5.58);close(t.netWallFaceArea,106.42);
 const unlinked=buildingQuantities(unlinkRoomOpening(p,'door-link')).totals;assert.equal(unlinked.logicalDoors,2);assert.equal(unlinked.logicalWindows,1);close(unlinked.netWallFaceArea,t.netWallFaceArea);
});
test('room switches and rotated separated placement do not change geometry or mutate the source',()=>{
 const p=pair(20,10,45),before=structuredClone(p),q=buildingQuantities(p),other=buildingQuantities(switchProjectRoom(p,'room-1'));
 assert.deepEqual(q,other);close(q.totals.combinedFloorArea,48);close(q.totals.sharedBoundaryLength,0);close(q.totals.uniqueBoundaryLength,40);assert.deepEqual(p,before);
});
test('JSON/CSV preserve explicit units, scope and safe quoted names',()=>{
 let p=pair();p={...p,name:'=HYPERLINK("x")',rooms:p.rooms.map(r=>({...r,name:r.id==='room-next'?'Kitchen, "East"':r.name}))};p=validateProject(p);
 const q=JSON.parse(buildingQuantitiesJson(p));assert.deepEqual(q,buildingQuantities(p));assert.equal(q.units.area,'m²');assert.equal(q.units.volume,'m³');assert.equal(q.scope.length,4);
 const csv=buildingQuantitiesCsv(p);assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"Kitchen, ""East"""'));assert.match(csv,/netWallFaceArea/);assert.ok(csv.endsWith('\r\n'));
});
test('summary validates the complete model before reporting quantities',()=>{
 const p=pair();assert.throws(()=>buildingQuantities({...p,room:{...p.room,height:9}}),/alias/);
 const bad=structuredClone(p);bad.rooms[0].room.height=-1;assert.throws(()=>buildingQuantities(bad));
});
