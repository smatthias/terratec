import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildingSheetPreview} from './building-sheet-preview.mjs';
import {exportBuildingPlanSvg} from './building-plan-svg.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,withActiveRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening} from './opening-links.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'House',room:{width:6,depth:4,height:2.8}});
const options={paper:'A4',orientation:'landscape',scale:50};
function pair() {return setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Kitchen'}),'room-next',{x:6,z:0,rotation:0});}
test('preview embeds the exact selected vector sheet in a standalone printable HTML document',()=>{
 const p=base(),preview=buildingSheetPreview(p,options),svg=exportBuildingPlanSvg(p,options).replace(/^<\?xml[^?]*\?>\s*/,'');
 assert.equal(preview.format,'terratec-building-sheet-preview');assert.equal(preview.version,1);assert.equal(preview.width,297);assert.equal(preview.height,210);assert.equal(preview.scale,50);assert.ok(preview.html.startsWith('<!doctype html>'));assert.ok(preview.html.includes(svg));assert.doesNotMatch(preview.html,/<\?xml/);assert.match(preview.html,/@page\{size:A4 landscape;margin:0\}/);
});
test('A4/A3 portrait and landscape retain exact physical sheet sizes and their chosen scale',()=>{
 for(const [paper,orientation,width,height] of [['A4','portrait',210,297],['A4','landscape',297,210],['A3','portrait',297,420],['A3','landscape',420,297]]) {
  const preview=buildingSheetPreview(base(),{paper,orientation,scale:50});assert.equal(preview.width,width);assert.equal(preview.height,height);assert.ok(preview.html.includes(`@page{size:${paper} ${orientation};margin:0}`));assert.ok(preview.html.includes(`width:${width}mm;height:${height}mm`));assert.match(preview.html,/data-print-scale="1:50"/);
 }
});
test('drawing bounds, unscaled and oversize inputs cannot bypass printable sheet validation',()=>{
 for(const paper of ['auto','Letter',undefined])assert.throws(()=>buildingSheetPreview(base(),{...options,paper}),/A4 or A3/);
 assert.throws(()=>buildingSheetPreview(base(),{...options,scale:null}),/Choose a print scale/);assert.throws(()=>buildingSheetPreview(base(),{...options,scale:20}),/does not fit/);assert.throws(()=>buildingSheetPreview(base(),{...options,scale:'50'}),/scale/);
});
test('whole-building preview retains room labels and renders each connected opening pair once',()=>{
 let p=switchProjectRoom(pair(),'room-1');p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'door',type:'door',wall:'east',offset:1,width:.9,height:2.1,sill:0}]}));
 p=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'door',id:'link',pairedOpeningId:'pair'});
 const preview=buildingSheetPreview(p,{...options,scale:100});assert.equal((preview.html.match(/<g data-room-id=/g)??[]).length,2);assert.equal((preview.html.match(/data-opening-type="door"/g)??[]).length,1);assert.match(preview.html,/Kitchen/);assert.match(preview.html,/data-connection-id="link"/);
});
test('user labels are escaped and the standalone document contains no active or remote content',()=>{
 const p={...base(),name:'</title><script>alert(1)</script> 🙂\u0000\uD800'},html=buildingSheetPreview(p,options).html;
 assert.doesNotMatch(html,/<script|<iframe|<img\b|<link\b|(?:href|src)=["']/);assert.match(html,/&lt;script&gt;/);assert.ok(html.includes('🙂'));assert.doesNotMatch(html,/[\u0000-\u0008\uD800-\uDFFF]/u);assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes("form-action 'none'"));assert.ok(html.includes('Content-Security-Policy'));
});
test('preview is an immutable snapshot with respect to later project edits',()=>{
 const p=base(),before=structuredClone(p),snapshot=buildingSheetPreview(p,options),html=snapshot.html;assert.deepEqual(p,before);
 p.name='Changed later';p.room.height=3;assert.equal(snapshot.html,html);assert.equal(snapshot.projectName,'House');assert.doesNotMatch(snapshot.html,/Changed later/);assert.equal(before.schemaVersion,6);
});
test('active-room selection has no effect on a whole-building print snapshot',()=>{
 const p=pair(),preview=buildingSheetPreview(p,{...options,scale:100});assert.deepEqual(buildingSheetPreview(switchProjectRoom(p,'room-1'),{...options,scale:100}),preview);
});
test('outward swing arcs are included in the print fit gate rather than clipped from preview',()=>{
 let p=setProjectRoomPlacement(base(),'room-1',{x:0,z:0,rotation:45});assert.doesNotThrow(()=>buildingSheetPreview(p,options));
 p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'out',type:'door',wall:'north',offset:1,width:4,height:2.1,sill:0,hinge:'B',swing:'out'}]}));
 assert.throws(()=>buildingSheetPreview(p,options),/does not fit/);assert.match(buildingSheetPreview(p,{...options,scale:100}).html,/data-opening-type="door"/);
});
