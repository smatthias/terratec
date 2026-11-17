<script setup>
// Drilling bench: a drill press view for one panel. Put a face or edge up, pick a
// bit from the rack, set the depth stop, then position the panel under the bit by
// entering the position or by hand (click the panel to bring that point under the
// bit, drag to slide it, arrow keys to nudge) and drill. Each drilling is one
// design edit (undo with Ctrl/⌘+Z). Loaded on first use.
import {ref,computed,watch,onMounted,onBeforeUnmount,onActivated,onDeactivated,nextTick} from 'vue';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildDesignGroup,disposeDesignGroup} from './design-scene.js';
import {drillHoles} from '../shared/furniture-design-edit.mjs';
import {DRILL_BITS,BIT_KINDS,BENCH_FACES,benchFace,holeAt,holePosition,rowOfHoles,handPosition,benchMatrix} from '../shared/drilling-bench.mjs';
import {MATERIALS} from '../shared/materials.mjs';

const props=defineProps({design:{type:Object,required:true},partId:{type:String,required:true}});
const emit=defineEmits(['drill','remove','close','message']);
const part=computed(()=>props.design.parts.find(p=>p.id===props.partId)??null);
watch(part,value=>{if(!value) emit('close');});

// ---- Bench settings (kept while the bench is open)
const face=ref('A'),bitId=ref('brad-8'),diameter=ref(8),depth=ref(12),through=ref(false),step=ref(1);
const target=ref({a:0,b:0}),row=ref({count:1,spacing:32,along:'a'}),drilling=ref(false);
const faceInfo=computed(()=>part.value?benchFace(part.value,face.value):null);
const centre=()=>({a:Math.round(faceInfo.value.a.length/2*10)/10,b:Math.round(faceInfo.value.b.length/2*10)/10});
watch(face,()=>{target.value=centre();if(depth.value>faceInfo.value.depthLimit) depth.value=faceInfo.value.depthLimit;},{flush:'sync'});
target.value=part.value?centre():target.value;
function chooseBit(bit) {bitId.value=bit.id;diameter.value=bit.diameter;if(bit.diameter===35) depth.value=Math.min(13,faceInfo.value.depthLimit);}
function setDiameter(event) {const value=Number(event.target.value);if(event.target.value!==''&&value>=.5&&value<=200) {diameter.value=value;bitId.value=DRILL_BITS.find(b=>b.diameter===value)?.id??'custom';} else event.target.value=diameter.value;}
const bit=computed(()=>DRILL_BITS.find(b=>b.id===bitId.value)??{kind:'twist',diameter:diameter.value});
const bitLabel=b=>`Ø${b.diameter} ${BIT_KINDS[b.kind].toLowerCase()}`;
// Number fields apply valid values; anything else reverts the field.
function numberFrom(event,min,max,current) {const value=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(value)&&value>=min&&value<=max) return value;event.target.value=current;return null;}
function setDepth(event) {const v=numberFrom(event,.01,faceInfo.value.depthLimit,depth.value);if(v!==null) depth.value=v;}
function setPosition(axis,event) {const v=numberFrom(event,-1e4,1e4,target.value[axis]);if(v!==null) moveTo(axis==='a'?v:target.value.a,axis==='b'?v:target.value.b);}
function setRow(key,event) {
  if(key==='along') {row.value={...row.value,along:event.target.value};return;}
  const v=key==='count'?numberFrom(event,1,50,row.value.count):numberFrom(event,.5,5000,row.value.spacing);
  if(v!==null) row.value={...row.value,[key]:key==='count'?Math.round(v):v};
}
const moveTo=(a,b)=>{target.value=handPosition(part.value,face.value,{a,b},0);};
function nudge(axis,sign) {const s=(step.value||1)*sign;moveTo(target.value.a+(axis==='a'?s:0),target.value.b+(axis==='b'?s:0));}

// ---- Holes to drill and whether they can be drilled
const planned=computed(()=>{
  if(!part.value) return [];
  try {return rowOfHoles(target.value,{...row.value,spacing:row.value.spacing}).map(p=>holeAt(part.value,face.value,{...p,diameter:diameter.value,depth:depth.value,through:through.value}));}
  catch(error) {return {error:error.message};}
});
const existing=computed(()=>(part.value?.features??[]).map((f,i)=>({feature:f,index:i+1,at:holePosition(part.value,face.value,f)})).filter(h=>h.at));
const check=computed(()=>{
  if(planned.value.error) return planned.value.error;
  for(const hole of planned.value) {
    const f=faceInfo.value,a=hole[f.a.key],b=hole[f.b.key];
    if(existing.value.some(h=>Math.abs(h.at.a-a)<.01&&Math.abs(h.at.b-b)<.01&&h.feature.diameter===hole.diameter)) return `There is already a Ø${hole.diameter} hole at ${a}, ${b}`;
  }
  try {let n=0;drillHoles(props.design,props.partId,planned.value,()=>'check-'+(++n));return '';} catch(error) {return error.message;}
});
const depthText=computed(()=>through.value?`through (${faceInfo.value.depthLimit} mm)`:`${depth.value} mm`);
const where=(a,b)=>`${faceInfo.value.a.key} ${a} · ${faceInfo.value.b.key} ${b}`;
async function drill() {
  if(drilling.value||check.value||!part.value) {if(check.value) emit('message',check.value);return;}
  const holes=planned.value,text=holes.length>1?`Drilled ${holes.length} holes Ø${diameter.value} × ${depthText.value} from ${where(target.value.a,target.value.b)}`:`Drilled Ø${diameter.value} × ${depthText.value} at ${where(target.value.a,target.value.b)}`;
  drilling.value=true;
  await plunge();
  drilling.value=false;
  emit('drill',{holes,message:text});
}

// ---- 3D bench
const host=ref(null),webgl=ref(true),topView=ref(false);
let renderer,scene,camera,controls,frame=0,piece=null,bench=null,bitGroup=null,tipRest=0,observer;
const TABLE_Y=0;
function matrix() {
  const m=benchMatrix(part.value,face.value,target.value);
  return new THREE.Matrix4().set(...m[0],...m[1],...m[2],0,0,0,1);
}
function buildPiece() {
  if(!scene||!part.value) return;
  disposeDesignGroup(piece);
  const flat={...part.value,x:0,y:0,z:0};delete flat.rotation;
  piece=buildDesignGroup({layers:props.design.layers,parts:[flat]});
  piece.matrixAutoUpdate=false;piece.matrix.copy(matrix());scene.add(piece);
  // Fence behind the panel and stop at its left end move with it.
  const f=faceInfo.value,backZ=f.bZero==='back'?-target.value.b:-(f.b.length-target.value.b),leftX=-target.value.a;
  bench.fence.position.set(0,30,backZ-15);bench.stop.position.set(leftX-10,30,backZ+60);
  bench.laser.position.set(0,f.height+.3,0);
  placeBit();
}
function placeBit() {
  if(!scene) return;
  if(bitGroup) {scene.remove(bitGroup);bitGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
  const f=faceInfo.value,r=diameter.value/2,length=Math.max(60,Math.min(f.depthLimit+30,160)),forstner=bit.value.kind==='forstner';
  bitGroup=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0xb8bec4,metalness:.8,roughness:.3});
  const cutter=new THREE.Mesh(new THREE.CylinderGeometry(r,r*(forstner?1:.4),forstner?Math.min(length,20):length,24),steel);
  cutter.position.y=(forstner?Math.min(length,20):length)/2;bitGroup.add(cutter);
  if(forstner) {const shank=new THREE.Mesh(new THREE.CylinderGeometry(5,5,length-20,16),steel.clone());shank.position.y=20+(length-20)/2;bitGroup.add(shank);}
  const chuck=new THREE.Mesh(new THREE.CylinderGeometry(22,26,60,24),new THREE.MeshStandardMaterial({color:0x555b60,metalness:.6,roughness:.4}));
  chuck.position.y=length+30;bitGroup.add(chuck);
  const head=new THREE.Mesh(new THREE.BoxGeometry(180,160,300),new THREE.MeshStandardMaterial({color:0x2f5d50,roughness:.6}));
  head.position.set(0,length+60+80,-90);bitGroup.add(head);
  tipRest=f.height+15;bitGroup.position.y=tipRest;scene.add(bitGroup);
  // The column stands behind the head, on the table.
  bench.column.scale.y=(tipRest+length+200)/1000;bench.column.position.y=(tipRest+length+200)/2;
}
// Lowers the bit to the depth stop and back (about half a second).
function plunge() {
  if(!bitGroup||!renderer) return Promise.resolve();
  const bottom=faceInfo.value.height-(through.value?faceInfo.value.depthLimit+1:depth.value);
  return new Promise(resolve=>{
    const start=performance.now(),duration=520;
    const tick=now=>{
      const t=Math.min(1,(now-start)/duration),down=t<.5?t*2:(1-t)*2;
      bitGroup.position.y=tipRest+(bottom-tipRest)*down;
      if(t<1) requestAnimationFrame(tick);else {bitGroup.position.y=tipRest;resolve();}
    };
    requestAnimationFrame(tick);
  });
}
function buildBench() {
  const wood=new THREE.MeshStandardMaterial({color:0xc49a62,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0x6b7378,metalness:.5,roughness:.5});
  const table=new THREE.Mesh(new THREE.BoxGeometry(2400,40,1200),wood);table.position.y=TABLE_Y-20;scene.add(table);
  const base=new THREE.Mesh(new THREE.BoxGeometry(2300,500,1100),new THREE.MeshStandardMaterial({color:0x3d4a45,roughness:.9}));base.position.y=-290;scene.add(base);
  const fence=new THREE.Mesh(new THREE.BoxGeometry(2200,60,30),metal);scene.add(fence);
  const stop=new THREE.Mesh(new THREE.BoxGeometry(20,60,120),new THREE.MeshStandardMaterial({color:0xd9822b,roughness:.5}));scene.add(stop);
  const column=new THREE.Mesh(new THREE.CylinderGeometry(45,45,1000,24),metal.clone());column.position.set(0,500,-520);scene.add(column);
  // Laser cross on the top of the panel, where the bit will go in.
  const laser=new THREE.Group(),red=new THREE.MeshBasicMaterial({color:0xff3b30});
  for(const [w,d] of [[300,1.2],[1.2,300]]) laser.add(new THREE.Mesh(new THREE.BoxGeometry(w,.2,d),red));
  scene.add(laser);
  return {fence,stop,column,laser};
}
function frameCamera() {
  if(!camera) return;
  const f=faceInfo.value,size=Math.max(f.a.length,f.b.length,400);
  controls.target.set(0,f.height,0);
  if(topView.value) camera.position.set(0,f.height+size*1.6,1);
  else camera.position.set(size*.55,f.height+size*.9,size*1.25);
  camera.near=1;camera.far=size*20+5000;camera.updateProjectionMatrix();controls.update();
}
watch([face,target,diameter,depth,through,()=>props.design],()=>buildPiece(),{deep:true});
watch([diameter,bitId],placeBit);
watch([face,topView],frameCamera);
// Hand positioning: a click on the panel brings that point under the bit; a drag slides the panel.
let press=null;
function topPoint(event) {
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-faceInfo.value.height),new THREE.Vector3());
}
const onFace=p=>{const f=faceInfo.value,a=target.value.a+p.x,b=target.value.b+(f.bZero==='back'?p.z:-p.z);return a>=0&&a<=f.a.length&&b>=0&&b<=f.b.length?{a,b}:null;};
function pointerDown(event) {
  if(event.button!==0||drilling.value) return;
  const p=topPoint(event),hit=p&&onFace(p);if(!hit) return;
  event.stopImmediatePropagation();renderer.domElement.setPointerCapture?.(event.pointerId);
  press={x:event.clientX,y:event.clientY,point:p,start:{...target.value},hit,moved:false,id:event.pointerId};
}
function pointerMove(event) {
  if(!press||event.pointerId!==press.id) return;
  if(!press.moved&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=4) return;
  press.moved=true;
  const p=topPoint(event);if(!p) return;
  const f=faceInfo.value,dx=p.x-press.point.x,dz=p.z-press.point.z;
  target.value=handPosition(part.value,face.value,{a:press.start.a-dx,b:press.start.b-(f.bZero==='back'?dz:-dz)},step.value);
}
function pointerUp(event) {
  if(!press||event.pointerId!==press.id) return;
  if(!press.moved) target.value=handPosition(part.value,face.value,press.hit,step.value);
  press=null;
}
function dblclick(event) {const p=topPoint(event),hit=p&&onFace(p);if(hit) {target.value=handPosition(part.value,face.value,hit,step.value);drill();}}
function resize() {if(!renderer||!host.value?.clientWidth) return;renderer.setSize(host.value.clientWidth,host.value.clientHeight);camera.aspect=host.value.clientWidth/host.value.clientHeight;camera.updateProjectionMatrix();}
function keydown(event) {
  const tag=event.target?.tagName;
  if(event.key==='Escape') {event.preventDefault();emit('close');return;}
  if(['INPUT','TEXTAREA','SELECT'].includes(tag)||event.ctrlKey||event.metaKey||event.altKey) return;
  const arrows={ArrowLeft:['a',-1],ArrowRight:['a',1],ArrowUp:['b',faceInfo.value.bZero==='back'?-1:1],ArrowDown:['b',faceInfo.value.bZero==='back'?1:-1]}[event.key];
  if(arrows) {event.preventDefault();nudge(arrows[0],arrows[1]*(event.shiftKey?10:1));return;}
  if(event.key==='Enter'||event.key===' ') {if(tag==='BUTTON') return;event.preventDefault();drill();}
}
onMounted(async()=>{
  window.addEventListener('keydown',keydown);
  await nextTick();
  try {
    renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.value.appendChild(renderer.domElement);
    scene=new THREE.Scene();scene.background=new THREE.Color('#22302d');
    scene.add(new THREE.HemisphereLight(0xffffff,0x4a3c2c,2.4));const sun=new THREE.DirectionalLight(0xfff1da,2);sun.position.set(800,2000,1200);scene.add(sun);
    camera=new THREE.PerspectiveCamera(40,1,1,1e5);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
    bench=buildBench();buildPiece();resize();frameCamera();
    renderer.domElement.addEventListener('pointerdown',pointerDown,true);renderer.domElement.addEventListener('pointermove',pointerMove);
    renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('dblclick',dblclick);
    observer=new ResizeObserver(resize);observer.observe(host.value);
    const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
  } catch {webgl.value=false;renderer=null;}
});
// Inside the kept-alive designer: keys only while the designer is shown.
onActivated(()=>window.addEventListener('keydown',keydown));
onDeactivated(()=>window.removeEventListener('keydown',keydown));
onBeforeUnmount(()=>{
  window.removeEventListener('keydown',keydown);cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();
  disposeDesignGroup(piece);scene?.traverse(o=>{o.geometry?.dispose();for(const m of [o.material??[]].flat()) m.dispose?.();});renderer?.dispose();
});
const faceLabel=k=>benchFace(part.value,k).label;
const holeText=h=>`Hole ${h.index} · Ø${h.feature.diameter} · ${where(h.at.a,h.at.b)} · ${h.feature.depth} mm`;
</script>
<template>
  <section v-if="part" class="drilling-bench" aria-label="Drilling bench">
    <div class="bench-stage">
      <div ref="host" class="bench-canvas"></div>
      <nav class="bench-views" aria-label="Bench view">
        <button @click="emit('close')">Back to designer</button>
        <button :aria-pressed="!topView" @click="topView=false">Bench view</button>
        <button :aria-pressed="topView" @click="topView=true">Look down the bit</button>
      </nav>
      <p class="bench-readout" data-testid="bench-readout" role="status">{{ bitLabel(bit) }} · depth {{ depthText }} · at {{ where(target.a,target.b) }} · {{ check || 'ready to drill' }}</p>
      <p v-if="!webgl" class="bench-note">The bench view needs WebGL; positions, bits and drilling all work from the panel.</p>
    </div>
    <aside class="bench-panel" aria-label="Drilling controls">
      <p class="eyebrow">DRILLING BENCH</p>
      <h2>{{ part.name }}</h2>
      <p class="hint">{{ part.length }} × {{ part.width }} × {{ part.thickness }} mm · {{ MATERIALS[part.material].label }}</p>
      <fieldset><legend>Face up</legend>
        <div class="bench-choices"><button v-for="k in BENCH_FACES" :key="k" :aria-pressed="face===k" @click="face=k">{{ faceLabel(k) }}</button></div>
      </fieldset>
      <fieldset><legend>Drill rack</legend>
        <div class="bench-choices rack" role="radiogroup" aria-label="Drill bits">
          <button v-for="b in DRILL_BITS" :key="b.id" role="radio" :aria-checked="bitId===b.id" :title="BIT_KINDS[b.kind]+' · '+b.use" @click="chooseBit(b)">{{ bitLabel(b) }}</button>
        </div>
        <label>Bit diameter mm<input type="number" min="0.5" max="200" step="0.5" :value="diameter" @change="setDiameter"></label>
      </fieldset>
      <fieldset><legend>Depth stop</legend>
        <label>Depth mm<input type="number" min="0.01" :max="faceInfo.depthLimit" step="0.5" :value="depth" :disabled="through" @change="setDepth"></label>
        <label class="snap-toggle"><input v-model="through" type="checkbox" aria-label="Drill through">Through ({{ faceInfo.depthLimit }} mm)</label>
      </fieldset>
      <fieldset><legend>Position under the bit</legend>
        <label>{{ faceInfo.a.label }} ({{ faceInfo.a.key }}) mm<input type="number" step="0.5" :value="target.a" aria-label="Position along" @change="setPosition('a',$event)"></label>
        <label>{{ faceInfo.b.label }} ({{ faceInfo.b.key }}) mm<input type="number" step="0.5" :value="target.b" aria-label="Position across" @change="setPosition('b',$event)"></label>
        <p class="hint">{{ faceInfo.b.key }} = 0 is the {{ faceInfo.bZero==='back'?'back edge, at the fence':'front edge' }}; {{ faceInfo.a.key }} = 0 is the left end, at the stop.</p>
        <label>Hand step<select v-model.number="step" aria-label="Hand step"><option :value="0">exact</option><option v-for="s in [.5,1,5,10,32]" :key="s" :value="s">{{ s }} mm</option></select></label>
      </fieldset>
      <fieldset><legend>Row of holes</legend>
        <div class="bench-row">
          <label>Holes<input type="number" min="1" max="50" step="1" :value="row.count" aria-label="Holes in the row" @change="setRow('count',$event)"></label>
          <label>Spacing mm<input type="number" min="1" max="5000" step="1" :value="row.spacing" aria-label="Row spacing" @change="setRow('spacing',$event)"></label>
          <label>Along<select :value="row.along" aria-label="Row direction" @change="setRow('along',$event)"><option value="a">{{ faceInfo.a.key }}</option><option value="b">{{ faceInfo.b.key }}</option></select></label>
        </div>
      </fieldset>
      <button class="primary bench-drill" :disabled="drilling||!!check" @click="drill">{{ row.count>1?`Drill ${row.count} holes`:'Drill' }}</button>
      <p v-if="check" class="bench-problem" data-testid="bench-problem" role="alert">{{ check }}</p>
      <p class="eyebrow">HOLES ON THIS FACE · {{ existing.length }}</p>
      <ol class="bench-holes">
        <li v-for="h in existing" :key="h.feature.id">
          <button :aria-label="'Go to '+holeText(h)" @click="moveTo(h.at.a,h.at.b)">{{ holeText(h) }}</button>
          <button :aria-label="'Remove '+holeText(h)" @click="emit('remove',h.feature.id)">Remove</button>
        </li>
      </ol>
      <p class="hint">By hand: click the panel to bring that point under the bit, drag the panel to slide it, use the arrow keys to nudge it by the hand step (Shift: ×10), and press Enter or double-click to drill. Escape returns to the designer; Ctrl/⌘+Z undoes the last drilling.</p>
    </aside>
  </section>
</template>
<style>
.drilling-bench{position:absolute;inset:0;z-index:20;display:grid;grid-template-columns:minmax(0,1fr) 330px;background:#22302d}
.drilling-bench .bench-stage{position:relative;min-width:0;min-height:0}.drilling-bench .bench-canvas{position:absolute;inset:0}
.drilling-bench .bench-views{position:absolute;top:14px;left:14px;z-index:2;display:flex;gap:2px;padding:4px;background:#f2f3eb;border-radius:8px}
.drilling-bench .bench-views button{padding:6px 11px;border:0}.drilling-bench .bench-views button[aria-pressed=true]{background:#263e3c;color:#f2f3eb}
.drilling-bench .bench-readout{position:absolute;left:14px;right:14px;bottom:12px;z-index:2;margin:0;padding:7px 10px;border-radius:6px;background:#f2f3ebf0;font-size:12px}
.drilling-bench .bench-note{position:absolute;top:70px;left:14px;z-index:2;margin:0;padding:6px 10px;border-radius:6px;background:#f2f3ebe6;font-size:11px}
.drilling-bench .bench-panel{overflow:auto;padding:16px;background:#f2f3eb;border-left:1px solid #b9c6b9;font-size:12px}
.drilling-bench h2{margin:0 0 2px;font-size:18px}.drilling-bench fieldset{margin:8px 0;padding:8px;border:1px solid #becabe;border-radius:6px}
.drilling-bench legend{font-size:11px;font-weight:700}.drilling-bench label{margin:6px 0;font-size:11px}
.drilling-bench .bench-choices{display:flex;flex-wrap:wrap;gap:3px}.drilling-bench .bench-choices button{font-size:11px;padding:4px 7px}
.drilling-bench .bench-choices button[aria-pressed=true],.drilling-bench .bench-choices button[aria-checked=true]{background:#263e3c;color:#f2f3eb}
.drilling-bench .bench-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}.drilling-bench .bench-row input,.drilling-bench .bench-row select{width:100%;min-width:0;padding:5px}
.drilling-bench .bench-drill{width:100%;margin:8px 0;padding:10px}.drilling-bench .bench-problem{color:#8d2b19;font-weight:700;margin:4px 0}
.drilling-bench .bench-holes{list-style:none;margin:4px 0;padding:0}.drilling-bench .bench-holes li{display:flex;gap:4px;border-bottom:1px solid #dde3d9}
.drilling-bench .bench-holes button{border:0;font-size:11px;padding:4px;text-align:left}.drilling-bench .bench-holes button:first-child{flex:1}
</style>
