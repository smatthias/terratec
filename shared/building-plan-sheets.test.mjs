import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildingPlanSheetLayout,exportBuildingPlanSvg} from './building-plan-svg.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,withActiveRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening} from './opening-links.mjs';
const base=(width=6,depth=4)=>validateProject({schemaVersion:1,units:'m',name:'Building sheet',room:{width,depth,height:2.8}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('A4/A3 dimensions, orientation and 10 mm margins are explicit',()=>{
 for(const [paper,orientation,width,height] of [['A4','portrait',210,297],['A4','landscape',297,210],['A3','portrait',297,420],['A3','landscape',420,297]]) {
  const sheet=buildingPlanSheetLayout(base(),{paper,orientation,scale:50});assert.equal(sheet.width,width);assert.equal(sheet.height,height);assert.equal(sheet.margin,10);assert.equal(sheet.usableWidth,width-20);assert.equal(sheet.usableHeight,height-20);assert.equal(sheet.fits,true);
 }
});
test('oversize sheets suggest a scale that actually fits and refuse clipped exports',()=>{
 const options={paper:'A4',orientation:'landscape',scale:20},sheet=buildingPlanSheetLayout(base(),options);assert.equal(sheet.fits,false);assert.equal(sheet.suggestedScale,50);
 assert.equal(buildingPlanSheetLayout(base(),{...options,scale:sheet.suggestedScale}).fits,true);assert.throws(()=>exportBuildingPlanSvg(base(),options),/does not fit.*try 1:50/);
 assert.equal(buildingPlanSheetLayout(base(),{...options,paper:'A3'}).fits,true);
});
test('orientation can determine fit for a tall plan',()=>{
 const p=base(4,8),portrait=buildingPlanSheetLayout(p,{paper:'A4',orientation:'portrait',scale:50}),landscape=buildingPlanSheetLayout(p,{paper:'A4',orientation:'landscape',scale:50});
 assert.equal(portrait.fits,true);assert.equal(landscape.fits,false);assert.equal(landscape.suggestedScale,100);
});
test('sheet mapping centres the full drawing at its exact physical scale inside margins',()=>{
 const p=base(),options={paper:'A4',orientation:'landscape',scale:50},sheet=buildingPlanSheetLayout(p,options),svg=exportBuildingPlanSvg(p,options);
 assert.match(svg,/width="297mm" height="210mm" viewBox="0 0 297 210"/);assert.match(svg,/data-paper-size="A4" data-orientation="landscape" data-print-scale="1:50"/);
 const match=svg.match(/data-building-plan="true" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\) translate\(([-\d.]+) ([-\d.]+)\)"/);assert.ok(match);
 const [,x,y,factor,tx,tz]=match.map(Number);close(factor,20);close(tx,-sheet.drawing.bounds.x);close(tz,-sheet.drawing.bounds.z);
 close(x,10+(sheet.usableWidth-sheet.requiredWidth)/2);close(y,10+(sheet.usableHeight-sheet.requiredHeight)/2);
 assert.ok(x>=10&&y>=10&&x+sheet.requiredWidth<=287+1e-7&&y+sheet.requiredHeight<=200+1e-7);close(6*factor,120);
});
test('sheet export retains transformed connected-opening symbols once without mutating the project',()=>{
 let p=setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Kitchen'}),'room-next',{x:6,z:0,rotation:0});p=switchProjectRoom(p,'room-1');
 p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'door',type:'door',wall:'east',offset:1,width:.9,height:2.1,sill:0}]}));p=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'door',id:'link',pairedOpeningId:'pair'});
 const before=structuredClone(p),svg=exportBuildingPlanSvg(p,{paper:'A4',orientation:'landscape',scale:100});assert.equal((svg.match(/data-opening-type="door"/g)??[]).length,1);assert.equal((svg.match(/data-connection-id="link"/g)??[]).length,1);assert.equal((svg.match(/<g data-room-id=/g)??[]).length,2);assert.deepEqual(p,before);
});
test('a plan beyond all supported scales has no misleading suggestion; drawing bounds remain available',()=>{
 const p=setProjectRoomPlacement(addProjectRoom(base(),{id:'room-next',name:'Distant'}),'room-next',{x:1000,z:0,rotation:0}),options={paper:'A3',orientation:'landscape',scale:200};
 const sheet=buildingPlanSheetLayout(p,options);assert.equal(sheet.fits,false);assert.equal(sheet.suggestedScale,null);assert.throws(()=>exportBuildingPlanSvg(p,options),/does not fit/);assert.doesNotThrow(()=>exportBuildingPlanSvg(p,{scale:200}));
});
test('fixed paper needs a print scale and rejects invalid paper/orientation choices',()=>{
 assert.throws(()=>buildingPlanSheetLayout(base(),{paper:'A4'}),/Choose a print scale/);
 for(const options of [{paper:'Letter',scale:50},{paper:'A4',orientation:'diagonal',scale:50},{paper:'A4',scale:5}])assert.throws(()=>buildingPlanSheetLayout(base(),options));
 assert.equal(buildingPlanSheetLayout(base()).paper,'auto');assert.equal(buildingPlanSheetLayout(base()).fits,true);
});
test('fit includes rotated outward door arcs, not just room polygons',()=>{
 const bare=setProjectRoomPlacement(base(),'room-1',{x:0,z:0,rotation:45}),options={paper:'A4',orientation:'landscape',scale:50};assert.equal(buildingPlanSheetLayout(bare,options).fits,true);
 const p=validateProject(withActiveRoom(bare,{...bare.room,openings:[{id:'out',type:'door',wall:'north',offset:1,width:4,height:2.1,sill:0,hinge:'B',swing:'out'}]}));
 const sheet=buildingPlanSheetLayout(p,options);assert.equal(sheet.fits,false);assert.equal(sheet.suggestedScale,100);assert.ok(sheet.requiredHeight>sheet.usableHeight);
});
