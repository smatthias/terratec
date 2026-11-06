import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cabinetParts,cabinetBom,cabinetBomCsv} from './cabinet-parts.mjs';
import {moveFurniture} from './furniture.mjs';
import {rectangle} from './geometry.mjs';
const item={id:'cabinet',name:'Storage',type:'cabinet',width:1.1,depth:.5,height:1.2,thickness:.018,shelves:3,x:0,z:0,rotation:30};
const room={width:6,depth:4,height:3,outline:rectangle(6,4),openings:[],furniture:[item]};
test('panel bill of materials matches shared visual part dimensions and excludes hardware volume',()=>{
  const parts=cabinetParts(item),bom=cabinetBom(item);
  assert.equal(bom.panelCount,10);assert.equal(bom.handles,2);
  assert.equal(bom.rows.find(r=>r.part==='shelf').quantity,3);
  assert.equal(bom.rows.find(r=>r.part==='front').quantity,2);
  const volume=parts.filter(p=>p.cut).reduce((sum,p)=>sum+p.size[0]*p.size[1]*p.size[2],0);
  assert.ok(Math.abs(bom.volume-volume)<1e-12);
  assert.ok(Math.abs(bom.area*item.thickness-bom.volume)<1e-12);
  const csv=cabinetBomCsv({...item,name:'=A1, "cabinet"'});
  assert.match(csv,/length_mm/);assert.match(csv,/1064.000/);assert.match(csv,/"'=A1, ""cabinet"""/);
});
test('moving furniture snaps only position, preserves grab data and rejects invalid/overlapping moves without mutation',()=>{
  const before=JSON.stringify(room);
  const moved=moveFurniture(room,item.id,{x:.63,z:.37},.25,true);
  assert.equal(moved.furniture[0].x,.75);assert.equal(moved.furniture[0].z,.25);
  assert.equal(moved.furniture[0].rotation,30);assert.equal(moved.furniture[0].width,1.1);
  assert.throws(()=>moveFurniture(room,item.id,{x:3,z:0},.25,true),/inside/);
  const occupied={...room,furniture:[item,{...item,id:'other',x:2}]};
  assert.throws(()=>moveFurniture(occupied,item.id,{x:2,z:0},.25,true),/overlap/);
  assert.equal(JSON.stringify(room),before);
});
