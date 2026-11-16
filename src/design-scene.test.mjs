import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildDesignGroup,fitDesignCamera,pickDesign,DESIGN_VIEWS} from './design-scene.js';
import {partCentre} from '../shared/furniture-design.mjs';
import {createDesign,updateLayer,designBounds,partBox} from '../shared/furniture-design-edit.mjs';
const ids=()=>{let n=0;return ()=>'id'+(++n);};
const box=()=>createDesign({id:'box',name:'Box',template:'box',makeId:ids()});
const all=group=>{const out=[];group.traverse(o=>{if(o.userData.role&&o.userData.role!=='piece') out.push(o);});return out;};
const roles=group=>all(group).reduce((n,o)=>({...n,[o.userData.role]:(n[o.userData.role]??0)+1}),{});
const world=o=>{o.parent?.updateMatrixWorld(true);return o.getWorldPosition(new THREE.Vector3());};

test('parts, layer-coloured edges and machining features are drawn per visible layer',()=>{
  const design=box();
  assert.deepEqual(roles(buildDesignGroup(design)),{part:6,edges:6,feature:6});
  const drill=design.layers.find(l=>l.operation==='drill').id,parts=design.layers.find(l=>l.operation==='profile').id;
  assert.deepEqual(roles(buildDesignGroup(updateLayer(design,drill,{visible:false}))),{part:6,edges:6,feature:2},'hidden drilling layer');
  assert.deepEqual(roles(buildDesignGroup(updateLayer(design,parts,{visible:false}))),{feature:6},'features keep their own layer');
  const edges=all(buildDesignGroup(design)).find(o=>o.userData.role==='edges');
  assert.equal(edges.material.color.getHex(),0x2e7d5b,'edges use the layer colour');
});

test('feature volumes sit inside their panel and the selection is highlighted',()=>{
  const design=box(),left=design.parts[0],drill=left.features[0];
  const group=buildDesignGroup(design,{selectedPartId:left.id,selectedFeatureId:drill.id});
  const box0=partBox(left);
  for(const mesh of all(group).filter(o=>o.userData.role==='feature'&&o.userData.partId===left.id))
    for(const axis of ['x','y','z']) assert.ok(world(mesh)[axis]>=box0.min[axis]&&world(mesh)[axis]<=box0.max[axis]);
  const hole=all(group).find(o=>o.userData.featureId===drill.id);
  assert.deepEqual(world(hole).toArray(),[12,346,60],'drill centre: 6 mm into the 18 mm side, at v=346, u=60');
  assert.equal(hole.material.depthTest,false);
  assert.notEqual(all(group).find(o=>o.userData.partId===left.id&&o.userData.role==='part').material.emissive.getHex(),0);
});

test('every view frames the whole design',()=>{
  const design=box(),b=designBounds(design);
  for(const view of DESIGN_VIEWS) for(const aspect of [.5,1.6]) {
    const camera=view==='3D'?new THREE.PerspectiveCamera(45,aspect,1,1e6):new THREE.OrthographicCamera();
    fitDesignCamera(camera,design,aspect,view);
    for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z]) {
      const p=new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1,`${view} ${aspect}`);
    }
  }
  const empty={...design,parts:[]},camera=new THREE.OrthographicCamera();
  assert.doesNotThrow(()=>fitDesignCamera(camera,empty,1,'Top'));
});

test('picking returns the part, preferring a feature drawn over it',()=>{
  const design=box(),group=buildDesignGroup(design),camera=new THREE.OrthographicCamera();
  fitDesignCamera(camera,design,1,'Front');
  const at=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return pickDesign(group,camera,p.x,p.y);};
  assert.deepEqual(at(300,360,560),{partId:design.parts[4].id,featureId:null},'the shelf (y 351–369) is frontmost here');
  assert.deepEqual(at(300,100,560),{partId:design.parts[5].id,featureId:null},'below the shelf only the back panel is in line');
  assert.deepEqual(at(4,50,560),{partId:design.parts[0].id,featureId:null},'left side, outside its groove (x 8–18)');
  assert.deepEqual(at(12,50,560),{partId:design.parts[0].id,featureId:design.parts[0].features[2].id},'through the groove the feature wins');
  fitDesignCamera(camera,design,1,'Side');
  const right=design.parts[1],hit=at(600,346,60);
  assert.equal(hit.partId,right.id);assert.equal(hit.featureId,right.features[0].id,'face B shelf-pin hole on the right side');
  assert.equal(at(5000,5000,5000),null);
});

import {addPart,partSize,SHAPES} from '../shared/furniture-design-edit.mjs';
test('every base form renders exactly the box the model describes, in its colour',()=>{
  for(const shape of SHAPES) for(const axis of ['x','y','z']) {
    const overrides=shape==='panel'?{orientation:{x:'horizontal',y:'front',z:'side'}[axis]}:{axis};
    const {design}=addPart(createDesign({id:'d',name:'D',makeId:ids()}),shape,{makeId:()=>'piece',overrides:{...overrides,color:'#123456',x:10,y:20,z:30}});
    const part=design.parts[0],mesh=all(buildDesignGroup(design)).find(o=>o.userData.role==='part');
    mesh.geometry.computeBoundingBox();
    const bb=mesh.geometry.boundingBox,size=partSize(part);
    for(const k of ['x','y','z']) {
      assert.ok(Math.abs(bb.max[k]-bb.min[k]-size[k])<1e-6,`${shape} ${axis} size ${k}`);
      assert.ok(Math.abs(world(mesh)[k]-(part[k]+size[k]/2))<1e-6,`${shape} ${axis} centre ${k}`);
    }
    assert.equal(mesh.material.color.getHex(),0x123456);
    assert.equal(mesh.material.metalness>0,['tube','box-tube','angle'].includes(shape),'library metals look metallic');
  }
});
test('tubes are hollow and angles are L-shaped in the rendered section',()=>{
  const make=(shape,overrides)=>{const {design}=addPart(createDesign({id:'d',name:'D',makeId:ids()}),shape,{makeId:()=>'p',overrides});const group=buildDesignGroup(design);group.updateMatrixWorld(true);return all(group).find(o=>o.userData.role==='part');};
  const tube=make('tube',{axis:'z',diameter:30,wall:2,length:100,x:0,y:0,z:0});
  const ray=new THREE.Raycaster(new THREE.Vector3(15,15,500),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(tube).length,0,'looking down the bore sees through the tube');
  assert.ok(new THREE.Raycaster(new THREE.Vector3(1,15,500),new THREE.Vector3(0,0,-1)).intersectObject(tube).length>0,'the tube wall itself is solid');
  const angle=make('angle',{axis:'z',width:40,height:40,wall:3,length:100,x:0,y:0,z:0});
  assert.equal(new THREE.Raycaster(new THREE.Vector3(30,30,500),new THREE.Vector3(0,0,-1)).intersectObject(angle).length,0,'open side of the L');
  assert.ok(new THREE.Raycaster(new THREE.Vector3(1,30,500),new THREE.Vector3(0,0,-1)).intersectObject(angle).length>0,'the vertical leg');
});
test('hand-built profile faces wind outward: walls away from the material, caps away from the piece',()=>{
  const make=(shape,overrides)=>{const {design}=addPart(createDesign({id:'d',name:'D',makeId:ids()}),shape,{makeId:()=>'p',overrides});return all(buildDesignGroup(design)).find(o=>o.userData.role==='part').geometry;};
  const triangles=geometry=>{const p=geometry.attributes.position.array,out=[];for(let i=0;i<p.length;i+=9){const a=new THREE.Vector3(p[i],p[i+1],p[i+2]),b=new THREE.Vector3(p[i+3],p[i+4],p[i+5]),c=new THREE.Vector3(p[i+6],p[i+7],p[i+8]);out.push({n:b.clone().sub(a).cross(c.clone().sub(a)).normalize(),c:a.add(b).add(c).divideScalar(3)});}return out;};
  for(const shape of ['bar','box-tube','angle','tube']) {
    const tris=triangles(make(shape,{axis:'z',length:100,x:0,y:0,z:0}));
    for(const {n,c} of tris) {
      if(Math.abs(Math.abs(n.z)-1)<1e-6) {assert.equal(Math.sign(n.z),Math.sign(c.z),`${shape} cap faces away`);continue;}
      const radial=new THREE.Vector3(c.x,c.y,0);
      if(shape==='bar') assert.ok(n.dot(radial)>0,'bar walls face outward');
      if(shape==='tube') {const r=Math.hypot(c.x,c.y);assert.ok(r>11?n.dot(radial)>0:n.dot(radial)<0,`tube ${r>11?'outer':'bore'} wall`);}
    }
    assert.ok(tris.length>=(shape==='tube'?64*2+64*2:12),shape+' has caps and walls');
  }
});

import {rotatePartsAbout,partCorners} from '../shared/furniture-design-edit.mjs';
test('rotated pieces render at their rotated corners, with features turning along',()=>{
  const design=rotatePartsAbout(box(),box().parts.map(p=>p.id),'y',30),group=buildDesignGroup(design);group.updateMatrixWorld(true);
  for(const part of design.parts) {
    const mesh=all(group).find(o=>o.userData.role==='part'&&o.userData.partId===part.id);
    const rendered=new THREE.Box3().setFromObject(mesh),expected=partCorners(part);
    for(const k of ['x','y','z']) {
      assert.ok(Math.abs(rendered.min[k]-Math.min(...expected.map(p=>p[k])))<1e-3,part.name+' min '+k);
      assert.ok(Math.abs(rendered.max[k]-Math.max(...expected.map(p=>p[k])))<1e-3,part.name+' max '+k);
    }
  }
  const left=design.parts[0],hole=all(group).find(o=>o.userData.featureId===left.features[0].id);
  const c=partCentre(left),local={x:left.x+12-c.x,y:left.y+346-c.y,z:left.z+60-c.z},a=30*Math.PI/180;
  const expected={x:c.x+Math.cos(a)*local.x+Math.sin(a)*local.z,y:c.y+local.y,z:c.z-Math.sin(a)*local.x+Math.cos(a)*local.z};
  for(const k of ['x','y','z']) assert.ok(Math.abs(world(hole)[k]-expected[k])<1e-6,'drill hole turns with its panel '+k);
});
test('layer display: colour by layer and focus dimming',()=>{
  const design=box(),parts=design.layers.find(l=>l.operation==='profile'),drill=design.layers.find(l=>l.operation==='drill');
  const byLayer=all(buildDesignGroup(design,{colorByLayer:true})).filter(o=>o.userData.role==='part');
  assert.ok(byLayer.every(m=>m.material.color.getHex()===new THREE.Color(parts.color).getHex()));
  const focused=all(buildDesignGroup(design,{focusLayerId:drill.id}));
  assert.ok(focused.filter(o=>o.userData.role==='part').every(m=>m.material.transparent&&m.material.opacity<.2),'panels dimmed');
  assert.ok(focused.filter(o=>o.userData.layerId===drill.id).every(m=>m.material.opacity>.5),'drilling stays visible');
});
