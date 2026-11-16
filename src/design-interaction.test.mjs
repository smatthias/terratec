import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDesignInteraction} from './design-interaction.js';
import {buildDesignGroup,fitDesignCamera} from './design-scene.js';
import {buildRotateGizmo,ringRadius} from './design-gizmo.js';
import {createDesign,updateLayer,partCentre} from '../shared/furniture-design-edit.mjs';
const ids=()=>{let n=0;return ()=>'id'+(++n);};
const box=()=>createDesign({id:'box',name:'Box',template:'box',makeId:ids()});
function setup({view='Front',tool='move',design=box(),selected=null,grid=10,angle=15}={}) {
  const aspect=800/600,camera=view==='3D'?new THREE.PerspectiveCamera(40,aspect,1,1e6):new THREE.OrthographicCamera();
  fitDesignCamera(camera,design,aspect,view);
  const group=buildDesignGroup(design);group.updateMatrixWorld(true);
  const part=design.parts.find(p=>p.id===selected)??null,gizmo=tool==='rotate'&&part?buildRotateGizmo(part,view):null;
  const state={design,previews:0,preview:null,info:'',commits:[],selects:[],captured:0};
  const element={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),setPointerCapture(){state.captured++;},releasePointerCapture(){state.captured--;}};
  const it=createDesignInteraction({element,camera:()=>camera,group:()=>group,gizmo:()=>gizmo,view:()=>view,tool:()=>tool,design:()=>state.design,
    selectedPart:()=>part,gridStep:()=>grid,angleStep:()=>angle,onPreview:(d,info)=>{state.preview=d;state.info=info;if(d) state.previews++;},
    onCommit:(d,message)=>state.commits.push({d,message}),onSelect:hit=>state.selects.push(hit)});
  const at=p=>{const v=new THREE.Vector3(p.x,p.y,p.z).project(camera);return {clientX:(v.x+1)*400,clientY:(1-v.y)*300};};
  const ev=(pos,extra={})=>({button:0,pointerId:7,...pos,preventDefault(){},stopImmediatePropagation(){state.stopped=true;},...extra});
  return {it,state,at,ev,design};
}
const shelf=design=>design.parts.find(p=>p.name==='Shelf');

test('dragging a piece moves it on the view plane with grid snapping, as one commit',()=>{
  const {it,state,at,ev,design}=setup({view:'Front'}),part=shelf(design),c=partCentre(part),front={...c,z:560};
  it.pointerDown(ev(at(front)));
  assert.equal(state.stopped,true,'the press is taken from the orbit controls');
  it.pointerMove(ev(at({...front,x:front.x+60,y:front.y+20})));
  it.pointerMove(ev(at({...front,x:front.x+123,y:front.y+37})));
  assert.ok(state.previews>=2);assert.match(state.info,/^Move x 122 · y 39 mm$/);
  it.pointerUp(ev(at({...front,x:front.x+123,y:front.y+37})));
  assert.equal(state.commits.length,1);assert.equal(state.commits[0].message,'Piece moved');
  const moved=shelf(state.commits[0].d);
  assert.deepEqual([moved.x,moved.y,moved.z],[140,390,part.z],'corner snapped to 10 mm; depth unchanged in Front view');
  assert.equal(state.preview,null,'preview cleared on release');assert.equal(state.captured,0,'pointer released');
  assert.deepEqual(state.selects,[{partId:part.id,featureId:null}],'the dragged piece becomes selected');
});

test('a press without dragging selects; empty space clears; locked layers do not move',()=>{
  let {it,state,at,ev,design}=setup({view:'Front'});const c={...partCentre(shelf(design)),z:560};
  it.pointerDown(ev(at(c)));it.pointerMove(ev({...at(c),clientX:at(c).clientX+3}));it.pointerUp(ev({...at(c),clientX:at(c).clientX+3}));
  assert.equal(state.commits.length,0);assert.equal(state.previews,0);
  assert.deepEqual(state.selects,[{partId:shelf(design).id,featureId:null}]);
  it.pointerDown(ev({clientX:5,clientY:5}));it.pointerUp(ev({clientX:5,clientY:5}));
  assert.equal(state.selects.at(-1),null,'clicking empty space clears the selection');
  const locked=updateLayer(box(),box().layers.find(l=>l.operation==='profile').id,{locked:true});
  ({it,state,at,ev}=setup({view:'Front',design:locked}));
  it.pointerDown(ev(at(c)));it.pointerMove(ev(at({...c,x:c.x+200})));it.pointerUp(ev(at({...c,x:c.x+200})));
  assert.equal(state.commits.length,0,'locked pieces stay put');assert.equal(state.stopped,undefined,'the camera can still orbit');
});

test('in 3D a piece slides on the floor, and Shift lifts it vertically',()=>{
  for(const shift of [false,true]) {
    const {it,state,at,ev,design}=setup({view:'3D',grid:0}),part=shelf(design),c=partCentre(part),top={...c,y:part.y+18};
    it.pointerDown(ev(at(top)));
    const target=shift?{...top,y:top.y+100}:{...top,x:top.x+100,z:top.z-50};
    it.pointerMove(ev(at({...top,x:top.x+30}),{shiftKey:shift}));it.pointerMove(ev(at(target),{shiftKey:shift}));it.pointerUp(ev(at(target)));
    const moved=shelf(state.commits[0].d);
    if(shift) {assert.equal(moved.x,part.x);assert.equal(moved.z,part.z);assert.ok(moved.y>part.y+50,'lifted');}
    else {assert.equal(moved.y,part.y,'height unchanged');assert.ok(Math.abs(moved.x-(part.x+100))<1e-6&&Math.abs(moved.z-(part.z-50))<1e-6);}
  }
});

test('dragging a rotation ring turns the selected piece with angle snapping',()=>{
  const design=box(),part=shelf(design),c=partCentre(part),r=ringRadius(part);
  const {it,state,at,ev}=setup({view:'Top',tool:'rotate',selected:part.id,design});
  const ring=degrees=>({x:c.x+r*Math.sin(degrees*Math.PI/180),y:c.y,z:c.z+r*Math.cos(degrees*Math.PI/180)});
  it.pointerDown(ev(at(ring(0))));
  assert.equal(state.stopped,true);
  it.pointerMove(ev(at(ring(20))));assert.match(state.info,/^Rotate about y \+15°$/);
  it.pointerMove(ev(at(ring(40))));it.pointerUp(ev(at(ring(40))));
  assert.equal(state.commits.length,1);assert.equal(state.commits[0].message,'Piece rotated');
  assert.deepEqual(shelf(state.commits[0].d).rotation,{x:0,y:45,z:0});
  const inside=setup({view:'Top',tool:'rotate',selected:part.id,design});
  inside.it.pointerDown(inside.ev(inside.at(c)));inside.it.pointerUp(inside.ev(inside.at(c)));
  assert.equal(inside.state.commits.length,0,'pressing the piece itself does not rotate');
});

test('cancel discards a drag without committing',()=>{
  const {it,state,at,ev,design}=setup({view:'Front'}),c={...partCentre(shelf(design)),z:560};
  it.pointerDown(ev(at(c)));it.pointerMove(ev(at({...c,x:c.x+100})));
  assert.ok(state.preview);assert.equal(it.dragging(),true);
  assert.equal(it.cancel(),true);assert.equal(state.preview,null);
  it.pointerUp(ev(at({...c,x:c.x+100})));
  assert.equal(state.commits.length,0);assert.equal(it.cancel(),false);
});
