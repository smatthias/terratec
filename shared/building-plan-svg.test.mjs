import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildingPlanDrawing,exportBuildingPlanSvg} from './building-plan-svg.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,withActiveRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening,unlinkRoomOpening} from './opening-links.mjs';
import {placedRoomPoint} from './room-placement.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'House',room:{width:6,depth:4,height:2.8}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function connected(type='door') {
 let p=setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Kitchen'}),'room-next',{x:6,z:0,rotation:0});p=switchProjectRoom(p,'room-1');
 p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'source',type,wall:'east',offset:1,width:.9,height:type==='door'?2.1:1,sill:type==='door'?0:.8}]}));
 return connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'source',id:'link',pairedOpeningId:'other'});
}
const metadata=svg=>JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1].replaceAll('&quot;','"'));
test('legacy room export is standalone, deterministic and does not upgrade or mutate the model',()=>{
 const p=base(),before=structuredClone(p),svg=exportBuildingPlanSvg(p);
 assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/House · Building floor plan/);assert.match(svg,/Room 1/);assert.match(svg,/data-print-scale="unscaled"/);
 assert.equal(metadata(svg).units,'m');assert.equal(metadata(svg).rooms,1);assert.equal(svg,exportBuildingPlanSvg(p));assert.deepEqual(p,before);assert.equal(p.schemaVersion,6);
});
test('all room polygons and labels use their world placement and rotation',()=>{
 const p=setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Kitchen'}),'room-next',{x:6,z:0,rotation:90});
 const d=buildingPlanDrawing(p);assert.equal(d.rooms.length,2);close(d.rooms[1].outline[0].x,4);close(d.rooms[1].outline[0].z,3);
 const svg=exportBuildingPlanSvg(p);assert.equal((svg.match(/<g data-room-id=/g)??[]).length,2);assert.match(svg,/Kitchen/);
 assert.equal(svg,exportBuildingPlanSvg(switchProjectRoom(p,'room-1')));
});
test('linked door pairs render one world-aligned door symbol and one linked span',()=>{
 const p=connected(),d=buildingPlanDrawing(p),o=d.openings[0];assert.equal(d.openingRecords,2);assert.equal(d.openings.length,1);assert.equal(d.connections.length,1);
 close(o.hinge.x,3);close(o.hinge.z,-1);close(o.leaf.x,2.1);close(o.leaf.z,-1);close(o.closed.x,3);close(o.closed.z,-.1);assert.equal(o.sweep,1);
 const svg=exportBuildingPlanSvg(p);assert.equal((svg.match(/data-opening-type="door"/g)??[]).length,1);assert.equal((svg.match(/data-connection-id="link"/g)??[]).length,1);assert.match(svg,/<path d="M/);assert.equal(metadata(svg).openingSymbols,1);
});
test('unlinked coincident windows remain distinct and draw double-line window symbols',()=>{
 const p=unlinkRoomOpening(connected('window'),'link'),d=buildingPlanDrawing(p);assert.equal(d.openings.length,2);assert.equal(d.connections.length,0);assert.ok(d.openings.every(o=>o.lines.length===2));
 const svg=exportBuildingPlanSvg(p);assert.equal((svg.match(/data-opening-type="window"/g)??[]).length,2);assert.equal(metadata(svg).linkedOpeningPairs,0);
});
test('bounds include exact outward door arc extrema after rotation',()=>{
 let p=base();p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'outward',type:'door',wall:'north',offset:1,width:4,height:2.1,sill:0,hinge:'B',swing:'out'}]}));p=setProjectRoomPlacement(p,'room-1',{x:0,z:0,rotation:45});
 const d=buildingPlanDrawing(p),o=d.openings[0];assert.ok(d.bounds.x< -4);
 const expected=placedRoomPoint({x:2,z:-2},{x:0,z:0,rotation:45});close(o.hinge.x,expected.x);close(o.hinge.z,expected.z);
 for(let i=0;i<=100;i++){const t=i*Math.PI/200,x=o.hinge.x+(o.closed.x-o.hinge.x)*Math.cos(t)+(o.leaf.x-o.hinge.x)*Math.sin(t),z=o.hinge.z+(o.closed.z-o.hinge.z)*Math.cos(t)+(o.leaf.z-o.hinge.z)*Math.sin(t);assert.ok(x>d.bounds.x&&x<d.bounds.x+d.bounds.width&&z>d.bounds.z&&z<d.bounds.z+d.bounds.height);}
});
test('physical print sizes match model metres at each supported scale',()=>{
 for(const scale of [20,50,100,200]){const d=buildingPlanDrawing(base(),{scale}),svg=exportBuildingPlanSvg(base(),{scale});close(Number(svg.match(/width="([\d.]+)mm"/)[1]),d.bounds.width*1000/scale);close(Number(svg.match(/height="([\d.]+)mm"/)[1]),d.bounds.height*1000/scale);assert.match(svg,new RegExp('data-print-scale="1:'+scale+'"'));assert.equal(metadata(svg).scale,scale);}
 for(const scale of [1,5,'50',NaN])assert.throws(()=>exportBuildingPlanSvg(base(),{scale}),/scale/);
});
test('user labels are escaped and overlapping rooms remain visible with explicit warnings',()=>{
 let p=addProjectRoom(base(),{id:'room-next',name:'A & <script>alert(1)</script>'});p={...p,name:'"><image href="https://example.invalid">'};
 const svg=exportBuildingPlanSvg(p);assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&lt;image/);assert.doesNotMatch(svg,/<script|<image|<foreignObject|(?:href|src)=["']/);
 const controls=exportBuildingPlanSvg({...p,name:'Valid 🙂\u0000\uD800'});assert.ok(controls.includes('🙂'));assert.doesNotMatch(controls,/[\u0000-\u0008\uD800-\uDFFF]/u);assert.ok(controls.includes('\uFFFD'));
 assert.equal(metadata(svg).overlappingPairs,1);assert.match(svg,/Warning: overlapping rooms/);assert.match(svg,/#f2d3c9/);assert.doesNotMatch(svg,/NaN|Infinity/);
});
test('invalid room aliases and broken opening links are rejected before exporting',()=>{
 const p=connected();assert.throws(()=>exportBuildingPlanSvg({...p,room:{...p.room,height:9}}),/alias/);
 const bad=structuredClone(p);bad.rooms[1].room.openings=[];assert.throws(()=>exportBuildingPlanSvg(bad),/missing/);
});
