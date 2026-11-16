<script setup>
// Furniture designer perspective. It replaces the room view in the same window
// and edits the project's furniture designs. Designs are stored with the project;
// each design has its own undo history for this session.
import {ref,computed,watch,onMounted,onBeforeUnmount,onActivated,onDeactivated} from 'vue';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import * as D from '../shared/furniture-design-edit.mjs';
import {cabinetParts} from '../shared/cabinet-parts.mjs';
import {cncPlan,cncPlanJson} from '../shared/design-cnc.mjs';
import {createHistory,commitHistory,undoHistory,redoHistory} from '../shared/history.mjs';
import {buildDesignGroup,disposeDesignGroup,fitDesignCamera,pickDesign,DESIGN_VIEWS} from './design-scene.js';
import {buildRotateGizmo,dropPlane,dropCorner,nudgeAxis} from './design-gizmo.js';
import {createDesignInteraction} from './design-interaction.js';
import {MATERIALS} from '../shared/materials.mjs';
import DesignPartEditor from './DesignPartEditor.vue';
import DesignLayers from './DesignLayers.vue';
import DesignCncPanel from './DesignCncPanel.vue';
import DesignPieceLibrary from './DesignPieceLibrary.vue';

const props=defineProps({designs:{type:Array,required:true},applyDesigns:{type:Function,required:true},cabinet:{type:Object,default:null},
  workspaceKey:{type:String,default:''},projectBytes:{type:Number,default:0},maxBytes:{type:Number,default:65536}});
const emit=defineEmits(['message']);
const say=text=>emit('message',text);
const makeId=()=>crypto.randomUUID();

// ---- Designs and selection
const activeId=ref(props.designs[0]?.id??null),selection=ref({partId:null,featureId:null}),confirmDelete=ref(false),formKey=ref(0);
const design=computed(()=>props.designs.find(d=>d.id===activeId.value)??null);
const selectedPart=computed(()=>design.value?.parts.find(p=>p.id===selection.value.partId)??null);
const layerOf=id=>design.value.layers.find(l=>l.id===id);
const clearSelection=()=>{selection.value={partId:null,featureId:null};};
watch(()=>props.designs.map(d=>d.id).join('|'),()=>{
  if(!props.designs.some(d=>d.id===activeId.value)) {activeId.value=props.designs[0]?.id??null;clearSelection();}
});
watch(activeId,()=>{clearSelection();confirmDelete.value=false;});
// Undo or another edit can remove the selected part or feature.
watch(design,value=>{
  const part=value?.parts.find(p=>p.id===selection.value.partId);
  if(!part) clearSelection();
  else if(selection.value.featureId && !part.features?.some(f=>f.id===selection.value.featureId)) selection.value={partId:part.id,featureId:null};
});
const selectPart=partId=>{selection.value={partId,featureId:null};};
const selectFeature=(partId,featureId)=>{selection.value={partId,featureId};};

// ---- History: one stack per design, cleared when the workspace changes project.
const histories=ref(new Map());
watch(()=>props.workspaceKey,()=>{histories.value=new Map();});
const history=computed(()=>design.value?histories.value.get(design.value.id)??null:null);
function replaceDesigns(list,text) {
  const error=props.applyDesigns(list);
  if(error) {say(error);formKey.value++;return false;}
  say(text);return true;
}
function commit(next,text) {
  const current=design.value,previous=histories.value.get(current.id)??createHistory(current);
  if(!replaceDesigns(props.designs.map(d=>d.id===current.id?next:d),text)) return false;
  histories.value=new Map(histories.value).set(current.id,commitHistory(previous,next));
  return true;
}
// Runs a model edit; validation errors are reported and leave the design unchanged.
function run(edit,text) {
  if(!design.value) return null;
  try {const result=edit(design.value);return commit(result.design??result,text)?result:null;}
  catch(error) {say(error.message);formKey.value++;return null;}
}
function travel(direction) {
  const current=design.value,stack=current&&histories.value.get(current.id);if(!stack) return;
  const moved=direction==='undo'?undoHistory(stack):redoHistory(stack);if(moved===stack) return;
  if(replaceDesigns(props.designs.map(d=>d.id===current.id?moved.present:d),direction==='undo'?'Design edit undone':'Design edit redone'))
    histories.value=new Map(histories.value).set(current.id,moved);
}

// ---- Design list (project data, not part of a design's own history)
function addDesign(next,text) {if(replaceDesigns([...props.designs,next],text)) {activeId.value=next.id;fitSoon();}}
function newDesign(template) {
  try {addDesign(D.createDesign({id:makeId(),name:template==='box'?'Box carcass':'New design',template,makeId}),template==='box'?'Box carcass design created':'Design created');}
  catch(error) {say(error.message);}
}
function fromCabinet() {
  try {addDesign(D.designFromCabinet(props.cabinet,cabinetParts(props.cabinet),{id:makeId(),makeId}),'Design created from '+props.cabinet.name);}
  catch(error) {say(error.message);}
}
function duplicateActive() {try {addDesign(D.duplicateDesign(design.value,{id:makeId(),makeId}),'Design duplicated');} catch(error) {say(error.message);}}
function deleteActive() {
  const name=design.value.name;confirmDelete.value=false;
  if(replaceDesigns(props.designs.filter(d=>d.id!==activeId.value),'Design “'+name+'” deleted')) activeId.value=props.designs[0]?.id??null;
}
function rename(event) {run(d=>D.renameDesign(d,event.target.value),'Design renamed');}

// ---- Part, feature and layer commands
// Adds a piece from the library; the new piece is selected for editing.
function addPiece({shape,material,color,length}) {
  const result=run(d=>D.addPart(d,shape,{makeId,overrides:{material,color,length,...(activeLayerId.value?{layer:activeLayerId.value}:{})}}),'Added '+D.PIECE_FORMS[shape].label.toLowerCase());
  if(result) selectPart(result.partId);
}
const convertPart=shape=>run(d=>D.convertPart(d,selection.value.partId,shape),'Changed to '+D.PIECE_FORMS[shape].label.toLowerCase());
const updatePart=changes=>run(d=>D.updatePart(d,selection.value.partId,changes),'Part updated');
function duplicateSelectedPart() {const result=run(d=>D.duplicatePart(d,selection.value.partId,makeId),'Part duplicated');if(result) selectPart(result.partId);}
function removeSelected() {
  const {partId,featureId}=selection.value;
  if(featureId) {if(run(d=>D.removeFeature(d,featureId),'Feature deleted')) selection.value={partId,featureId:null};}
  else if(partId && run(d=>D.removePart(d,partId),'Part deleted')) clearSelection();
}
function addFeature(type) {const partId=selection.value.partId,result=run(d=>D.addFeature(d,partId,type,makeId),'Added '+type);if(result) selectFeature(partId,result.featureId);}
const updateFeature=(featureId,changes)=>run(d=>D.updateFeature(d,featureId,changes),'Feature updated');
const usage=computed(()=>{
  const counts={};
  for(const part of design.value?.parts??[]) {counts[part.layer]=(counts[part.layer]??0)+1;for(const f of part.features??[]) counts[f.layer]=(counts[f.layer]??0)+1;}
  return counts;
});
const layerCommands={
  add:()=>run(d=>D.addLayer(d,{makeId}),'Layer added'),
  update:(id,changes)=>run(d=>D.updateLayer(d,id,changes),'Layer updated'),
  remove:id=>run(d=>D.removeLayer(d,id),'Layer deleted'),
  move:(id,delta)=>run(d=>D.moveLayer(d,id,delta),'Machining order changed'),
};

// ---- CNC plan
const plan=computed(()=>{try {return design.value?cncPlan(design.value):null;} catch(error) {return {error:error.message};}});
function exportPlan() {
  try {
    const url=URL.createObjectURL(new Blob([cncPlanJson(design.value)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=(design.value.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||'design')+'_cnc-plan.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('CNC plan exported');
  } catch(error) {say(error.message);}
}
function selectIssue(issue) {if(issue.featureId) selectFeature(issue.partId,issue.featureId);else if(issue.partId) selectPart(issue.partId);}
const summary=computed(()=>{
  if(!design.value) return '';
  const size=D.designBounds(design.value).size,features=design.value.parts.reduce((n,p)=>n+(p.features?.length??0),0);
  return `${Math.round(size.x)} × ${Math.round(size.y)} × ${Math.round(size.z)} mm · ${design.value.parts.length} parts · ${features} machining features`;
});

// ---- In-canvas tools. While dragging, `preview` holds the edited design; it is
// committed once on release, so a whole drag is one undo step.
const tool=ref('move'),gridStep=ref(10),angleStep=ref(15),colorByLayer=ref(false),focusLayerId=ref(null),activeLayerId=ref(null);
const preview=ref(null),dragInfo=ref('');
const shown=computed(()=>preview.value??design.value);
const shownPart=computed(()=>shown.value?.parts.find(p=>p.id===selection.value.partId)??null);
watch(()=>design.value?.layers.map(l=>l.id).join('|'),()=>{
  const ids=new Set(design.value?.layers.map(l=>l.id)??[]);
  if(!ids.has(activeLayerId.value)) activeLayerId.value=null;
  if(!ids.has(focusLayerId.value)) focusLayerId.value=null;
});
const MIME='application/x-terratec-design';

// ---- 3D view
const view=ref('3D'),canvasHost=ref(null),webgl=ref(true);
let renderer,scene,camera,controls,group,gizmo,grid,observer,frame=0,active=true;
const EMPTY={parts:[],layers:[]};
function fit() {
  if(!camera||!canvasHost.value) return;
  const aspect=Math.max(canvasHost.value.clientWidth,1)/Math.max(canvasHost.value.clientHeight,1);
  controls.enableDamping=false;controls.update();
  controls.target.copy(fitDesignCamera(camera,design.value??EMPTY,aspect,view.value));controls.update();controls.enableDamping=true;
}
const fitSoon=()=>requestAnimationFrame(fit);
function setupCamera() {
  if(!renderer) return;
  cancelDrag();controls?.dispose();
  camera=view.value==='3D'?new THREE.PerspectiveCamera(40,1,1,1e6):new THREE.OrthographicCamera();
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enableRotate=view.value==='3D';controls.screenSpacePanning=true;
  if(grid) grid.visible=view.value==='3D'||view.value==='Top';
  fit();rebuild();
}
function rebuild() {
  if(!scene) return;
  disposeDesignGroup(group);disposeDesignGroup(gizmo);group=gizmo=null;
  if(!shown.value) return;
  group=buildDesignGroup(shown.value,{selectedPartId:selection.value.partId,selectedFeatureId:selection.value.featureId,colorByLayer:colorByLayer.value,focusLayerId:focusLayerId.value});
  scene.add(group);
  if(tool.value==='rotate'&&shownPart.value) {gizmo=buildRotateGizmo(shownPart.value,view.value);scene.add(gizmo);}
}
watch([shown,selection,colorByLayer,focusLayerId,tool],rebuild,{deep:true});
watch(view,setupCamera);
watch(activeId,fitSoon);
function resize() {
  const host=canvasHost.value;if(!renderer||!host?.clientWidth||!host.clientHeight) return;
  renderer.setSize(host.clientWidth,host.clientHeight);fit();
}
function ndc(event) {const rect=renderer.domElement.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*2-1,y:-(event.clientY-rect.top)/rect.height*2+1};}
function planeHit(event,plane) {
  const p=ndc(event),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(p.x,p.y),camera);
  return ray.ray.intersectPlane(plane,new THREE.Vector3());
}
const pickAt=event=>{const p=ndc(event);return group?pickDesign(group,camera,p.x,p.y):null;};
// Canvas pointer handling (see design-interaction.js) runs in the capture phase,
// so a drag on a piece never orbits the camera.
let interaction=null;
function createInteraction() {
  interaction=createDesignInteraction({element:renderer.domElement,camera:()=>camera,group:()=>group,gizmo:()=>gizmo,view:()=>view.value,tool:()=>tool.value,
    design:()=>design.value,selectedPart:()=>selectedPart.value,gridStep:()=>gridStep.value,angleStep:()=>angleStep.value,
    onPreview:(next,info)=>{preview.value=next;dragInfo.value=info;},onCommit:(next,text)=>commit(next,text),
    onSelect:hit=>{if(hit) selection.value=hit;else clearSelection();}});
}
const pointerDown=event=>interaction?.pointerDown(event),pointerMove=event=>interaction?.pointerMove(event),pointerUp=event=>interaction?.pointerUp(event);
function cancelDrag() {if(interaction?.cancel()) say('Drag cancelled');}

// ---- Drag and drop from the piece library and the layer panel.
function canvasDragOver(event) {if([...(event.dataTransfer?.types??[])].includes(MIME)) {event.preventDefault();event.dataTransfer.dropEffect='copy';}}
function canvasDrop(event) {
  let data;try {data=JSON.parse(event.dataTransfer.getData(MIME));} catch {return;}
  event.preventDefault();
  if(!design.value) {say('Create a design first');return;}
  if(data.kind==='form') {dropPiece(data,event);return;}
  const hit=camera?pickAt(event):null;
  if(!hit) {say('Drop materials and layers onto a piece');return;}
  selectPart(hit.partId);
  if(data.kind==='material') run(d=>D.updatePart(d,hit.partId,{material:data.material}),'Applied '+materialLabel(data.material));
  else if(data.kind==='layer') run(d=>D.updatePart(d,hit.partId,{layer:data.layerId}),'Moved to layer '+(layerOf(data.layerId)?.name??''));
}
const materialLabel=id=>MATERIALS[id]?.label??id;
function dropPiece(data,event) {
  const result=run(d=>{
    const added=D.addPart(d,data.shape,{makeId,overrides:{material:data.material,color:data.color,length:data.length,...(activeLayerId.value?{layer:activeLayerId.value}:{})}});
    const point=camera?planeHit(event,dropPlane(view.value)):null;
    if(!point) return added;
    const part=added.design.parts.find(p=>p.id===added.partId);
    return {design:D.updatePart(added.design,added.partId,dropCorner(view.value,point,D.partSize(part),gridStep.value)),partId:added.partId};
  },'Placed '+D.PIECE_FORMS[data.shape].label.toLowerCase());
  if(result) selectPart(result.partId);
}

// ---- Selection toolbar commands
const rotateSelected=(axis,degrees)=>run(d=>D.rotatePartsAbout(d,[selection.value.partId],axis,degrees),`Rotated about ${axis} ${degrees>0?'+':''}${degrees}°`);
const resetRotation=()=>run(d=>D.updatePart(d,selection.value.partId,{rotation:undefined}),'Rotation reset');
function nudge(axis,sign) {
  const part=selectedPart.value,step=gridStep.value||1;
  run(d=>D.updatePart(d,part.id,{[axis]:part[axis]+sign*step}),`Nudged ${axis} ${sign>0?'+':'−'}${step} mm`);
}

onMounted(()=>{
  try {
    renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    canvasHost.value.appendChild(renderer.domElement);
    scene=new THREE.Scene();scene.background=new THREE.Color('#1b2f31');
    scene.add(new THREE.HemisphereLight(0xffffff,0x3a4a44,2.6));
    const sun=new THREE.DirectionalLight(0xfff3dd,2.2);sun.position.set(1500,2500,2000);scene.add(sun);
    grid=new THREE.GridHelper(4000,40,0x4d6a60,0x2f4a44);scene.add(grid);
    setupCamera();createInteraction();
    renderer.domElement.addEventListener('pointerdown',pointerDown,true);
    renderer.domElement.addEventListener('pointermove',pointerMove);
    renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointercancel',cancelDrag);
    observer=new ResizeObserver(resize);observer.observe(canvasHost.value);
    const animate=()=>{frame=requestAnimationFrame(animate);if(!active) return;controls.update();renderer.render(scene,camera);};animate();
  } catch {webgl.value=false;say('The designer preview needs WebGL · designing still works');}
});

// ---- Keyboard (only while this perspective is shown)
function keydown(event) {
  const tag=event.target?.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag)||event.target?.isContentEditable) return;
  const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
  const handled=()=>{event.preventDefault();return true;};
  if(mod&&key==='z') return handled()&&travel(event.shiftKey?'redo':'undo');
  if(mod&&key==='y') return handled()&&travel('redo');
  if(mod&&key==='d'&&selection.value.partId) return handled()&&duplicateSelectedPart();
  if(!mod&&(key==='delete'||key==='backspace')&&selection.value.partId) return handled()&&removeSelected();
  if(key==='escape') {if(interaction?.dragging()) cancelDrag();else clearSelection();return;}
  if(mod||event.altKey) return;
  if(key==='m') return handled()&&(tool.value='move');
  if(key==='r') return handled()&&(tool.value='rotate');
  const step=selection.value.partId&&nudgeAxis(view.value,event.key,event.shiftKey);
  if(step) return handled()&&nudge(step.axis,step.sign);
}
onActivated(()=>{active=true;window.addEventListener('keydown',keydown);resize();});
onDeactivated(()=>{active=false;cancelDrag();window.removeEventListener('keydown',keydown);});
onBeforeUnmount(()=>{
  window.removeEventListener('keydown',keydown);cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();
  disposeDesignGroup(group);grid?.geometry.dispose();grid?.material.dispose();
  renderer?.domElement.removeEventListener('pointerdown',pointerDown,true);renderer?.domElement.removeEventListener('pointermove',pointerMove);renderer?.domElement.removeEventListener('pointerup',pointerUp);renderer?.domElement.removeEventListener('pointercancel',cancelDrag);disposeDesignGroup(gizmo);renderer?.dispose();
});
</script>
<template>
  <div class="designer">
    <aside class="designer-left" aria-label="Designs and parts">
      <p class="eyebrow">FURNITURE DESIGNER</p>
      <label v-if="designs.length">Furniture design<select :value="activeId" aria-label="Furniture design" @change="activeId=$event.target.value"><option v-for="d in designs" :key="d.id" :value="d.id">{{ d.name }}</option></select></label>
      <div class="design-row"><button @click="newDesign('empty')">New empty design</button><button @click="newDesign('box')">New box carcass</button></div>
      <button :disabled="!cabinet" :title="cabinet?'Convert '+cabinet.name:'Select a cabinet in the room first'" @click="fromCabinet">Design from selected cabinet</button>
      <template v-if="design">
        <label>Design name<input :key="formKey+design.id" :value="design.name" maxlength="60" @change="rename"></label>
        <div class="design-row"><button @click="duplicateActive">Duplicate design</button>
          <button v-if="!confirmDelete" @click="confirmDelete=true">Delete design</button><button v-else class="danger" @click="deleteActive">Confirm delete design</button></div>
        <DesignPieceLibrary @add="addPiece"/>
        <p class="eyebrow">PARTS · {{ design.parts.length }}</p>
        <ul class="part-tree" aria-label="Parts">
          <li v-for="part in design.parts" :key="part.id" :class="{hidden:!layerOf(part.layer).visible}">
            <button :aria-pressed="selection.partId===part.id&&!selection.featureId" :title="'Layer '+layerOf(part.layer).name" @click="selectPart(part.id)"><span class="swatch" :style="{background:part.color}"></span>{{ part.name }}<small>{{ D.PIECE_FORMS[part.shape].short }}</small></button>
            <ul v-if="part.features?.length"><li v-for="f in part.features" :key="f.id"><button :aria-pressed="selection.featureId===f.id" @click="selectFeature(part.id,f.id)"><span class="swatch" :style="{background:layerOf(f.layer).color}"></span>{{ f.type }} · {{ f.face }} · {{ f.depth }} mm</button></li></ul>
          </li>
        </ul>
      </template>
      <p class="hint" data-testid="project-size">Project size {{ (projectBytes/1024).toFixed(1) }} of {{ maxBytes/1024 }} KiB. Designs are saved with the project.</p>
    </aside>
    <section class="designer-stage" aria-label="Design view">
      <nav class="designer-views" aria-label="Designer view">
        <button v-for="mode in DESIGN_VIEWS" :key="mode" :aria-pressed="view===mode" @click="view=mode">{{ mode }}</button>
        <button @click="fit">Fit design</button>
        <button :disabled="!history?.past.length" @click="travel('undo')">Undo design</button>
        <button :disabled="!history?.future.length" @click="travel('redo')">Redo design</button>
        <span class="tool-sep"></span>
        <button :aria-pressed="tool==='move'" title="Drag pieces to move them (M). Shift drags vertically in 3D; arrow keys nudge." @click="tool='move'">Move</button>
        <button :aria-pressed="tool==='rotate'" title="Drag a ring to rotate the selected piece (R)" @click="tool='rotate'">Rotate</button>
        <label class="tool-select">Grid<select v-model.number="gridStep" aria-label="Move snap"><option :value="0">off</option><option v-for="step in [1,5,10,25,50]" :key="step" :value="step">{{ step }} mm</option></select></label>
        <label class="tool-select">Angle<select v-model.number="angleStep" aria-label="Angle snap"><option :value="0">off</option><option v-for="step in [5,15,45,90]" :key="step" :value="step">{{ step }}°</option></select></label>
        <button :aria-pressed="colorByLayer" title="Shade pieces in their layer colour" @click="colorByLayer=!colorByLayer">Colour by layer</button>
      </nav>
      <div ref="canvasHost" class="designer-canvas" @dragover="canvasDragOver" @drop="canvasDrop"></div>
      <DesignLayers v-if="design" :key="'layers'+formKey" class="layers-overlay" :layers="design.layers" :usage="usage" :active-layer-id="activeLayerId" :focus-layer-id="focusLayerId"
        @add="layerCommands.add" @update="layerCommands.update" @remove="layerCommands.remove" @move="layerCommands.move" @activate="activeLayerId=$event" @focus="focusLayerId=$event"/>
      <p v-if="dragInfo" class="drag-info" role="status">{{ dragInfo }}</p>
      <div v-if="selectedPart" class="selection-hud" role="toolbar" aria-label="Selected piece">
        <span class="hud-name"><span class="swatch" :style="{background:selectedPart.color}"></span>{{ selectedPart.name }} <small>{{ D.PIECE_FORMS[selectedPart.shape].short }}</small></span>
        <select :value="selectedPart.layer" aria-label="Piece layer" @change="run(d=>D.updatePart(d,selectedPart.id,{layer:$event.target.value}),'Moved to layer '+layerOf($event.target.value).name)">
          <option v-for="layer in design.layers" :key="layer.id" :value="layer.id">{{ layer.name }}{{ layer.locked?' · locked':'' }}</option>
        </select>
        <button v-for="[axis,degrees] in [['x',90],['y',-15],['y',15],['y',90],['z',90]]" :key="axis+degrees" :aria-label="'Rotate about '+axis+' '+(degrees>0?'+':'')+degrees+'°'" @click="rotateSelected(axis,degrees)">{{ axis.toUpperCase() }} {{ degrees>0?'+':'' }}{{ degrees }}°</button>
        <button :disabled="!selectedPart.rotation" @click="resetRotation">Reset rotation</button>
        <button @click="duplicateSelectedPart">Duplicate</button><button @click="removeSelected">Delete</button>
      </div>
      <p v-if="!design" class="designer-empty">Start a design: an empty design, a box carcass, or one converted from the cabinet selected in the room.</p>
      <p v-else class="designer-summary" data-testid="design-summary">{{ summary }}</p>
      <p v-if="!webgl" class="designer-empty">3D preview needs WebGL; all editing panels still work.</p>
    </section>
    <aside class="designer-right" aria-label="Design properties">
      <DesignPartEditor v-if="selectedPart" :key="formKey" :part="selectedPart" :layers="design.layers" :feature-id="selection.featureId"
        @update="updatePart" @convert="convertPart" @remove="removeSelected" @duplicate="duplicateSelectedPart" @add-feature="addFeature"
        @select-feature="id=>selectFeature(selectedPart.id,id)" @update-feature="updateFeature" @remove-feature="removeSelected"/>
      <p v-else-if="design" class="hint">Select a part in the view or the parts list to edit its shape, material, layer and machining.</p>
      <DesignCncPanel v-if="plan" :plan="plan" @export="exportPlan" @select="selectIssue"/>
    </aside>
  </div>
</template>
<style>
/* Not scoped: these rules style the child panels too, namespaced under .designer. */
.designer{grid-column:1/-1;grid-row:2/-2;display:grid;grid-template-columns:270px minmax(0,1fr) 330px;min-height:0;border-top:1px solid #cdd5ca}
.designer .designer-left,.designer .designer-right{padding:18px;overflow:auto;min-height:0}
.designer .designer-left{border-right:1px solid #cdd5ca}.designer .designer-right{border-left:1px solid #cdd5ca}
.designer .designer-stage{position:relative;min-width:0;min-height:0;background:#1b2f31}
.designer .designer-canvas{position:absolute;inset:0}
.designer .designer-views{position:absolute;top:14px;left:14px;z-index:2;display:flex;flex-wrap:wrap;gap:2px;padding:4px;background:#f2f3eb;border-radius:8px}
.designer .designer-views button{padding:6px 11px;border:0}.designer .designer-views button[aria-pressed=true]{background:#263e3c;color:#f2f3eb}
.designer .tool-sep{width:1px;margin:2px 4px;background:#c9d3c8}
.designer .tool-select{display:flex;align-items:center;gap:4px;margin:0 4px;font-size:10px;text-transform:none}.designer .tool-select select{margin:0;padding:3px;font-size:11px;width:auto}
.designer .layers-overlay{position:absolute;top:14px;right:14px;z-index:3;width:300px;max-height:calc(100% - 120px);overflow:auto;padding:10px;background:#f2f3ebf2;border:1px solid #b9c6b9;border-radius:8px;box-shadow:0 6px 24px #001c2433}
.designer .layers-head{display:flex;justify-content:space-between;align-items:center;gap:6px}.designer .layers-head .eyebrow{margin:0}.designer .layers-head button{font-size:10px;padding:3px 6px}
.designer .layer-row{grid-template-columns:26px 26px 1fr auto}.designer .layer-flags{grid-column:1/5;display:flex;gap:8px;align-items:center}.designer .layer-flags button{font-size:10px;padding:2px 6px;margin-left:auto}
.designer .layer-flags button[aria-pressed=true]{background:#263e3c;color:#f2f3eb}.designer .layer-row.focused{background:#e9eddd}
.designer .layer-order{cursor:grab;white-space:nowrap}
.designer .selection-hud{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:3;display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:calc(100% - 40px);padding:6px 8px;background:#f2f3ebf2;border:1px solid #b9c6b9;border-radius:8px;box-shadow:0 6px 24px #001c2433}
.designer .selection-hud button{font-size:11px;padding:4px 7px}.designer .selection-hud select{margin:0;padding:3px;width:auto;font-size:11px}
.designer .hud-name{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;margin-right:4px}.designer .hud-name small{font-weight:400;color:#60746a}
.designer .drag-info{position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:3;margin:0;padding:5px 10px;border-radius:6px;background:#263e3ce6;color:#f2f3eb;font-size:12px}
.designer .designer-summary,.designer .designer-empty{position:absolute;left:16px;bottom:10px;z-index:2;margin:0;padding:6px 10px;border-radius:6px;background:#f2f3ebe6;font-size:11px}
.designer .designer-empty{bottom:auto;top:70px;max-width:420px}
.designer .design-row{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.designer .design-row button{font-size:11px;padding:6px 8px}
.designer .part-tree,.designer .feature-list,.designer .design-layers ol,.designer .cnc-issues{list-style:none;margin:4px 0;padding:0}
.designer .part-tree ul{list-style:none;padding-left:16px;margin:0}
.designer .part-tree button,.designer .feature-list button{width:100%;text-align:left;border:0;padding:4px 6px;font-size:12px;display:flex;gap:6px;align-items:center}
.designer .part-tree button small{margin-left:auto;color:#60746a}.designer .part-tree li.hidden>button{opacity:.45}
.designer .part-tree button[aria-pressed=true],.designer .feature-list button[aria-pressed=true]{background:#d3dfd1}
.designer .swatch{display:inline-block;width:10px;height:10px;border:1px solid #0003;border-radius:2px;flex-shrink:0}
.designer .mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}.designer .mm-grid input{width:100%;min-width:0}
.designer .feature-editor{margin:8px 0;padding:8px;border:1px solid #becabe;border-radius:6px}
.designer .layer-row{display:grid;grid-template-columns:18px 28px 1fr auto;gap:4px;align-items:center;padding:5px 0;border-bottom:1px solid #dde3d9;font-size:11px}
.designer .layer-row select{grid-column:3/5;margin:0;padding:4px}.designer .layer-row .layer-name{min-width:0;padding:4px}
.designer .layer-row input[type=color]{width:26px;height:22px;padding:0;border:0}
.designer .layer-flag{display:flex;gap:3px;align-items:center;text-transform:none;margin:0}.designer .layer-flag input{width:auto;margin:0}
.designer .layer-actions{display:flex;gap:2px}.designer .layer-actions button{padding:2px 6px}
.designer .layer-row.hidden .layer-name{opacity:.5}.designer .layer-row.locked .layer-name{font-style:italic}
.designer .layer-order{font-weight:700;color:#60746a}.designer .layer-usage{color:#60746a}
.designer .cnc-layers{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0}.designer .cnc-layers th,.designer .cnc-layers td{text-align:left;padding:3px;border-bottom:1px solid #dde3d9}
.designer .cnc-issues button{width:100%;text-align:left;border:0;font-size:11px;padding:3px}
.designer .cnc-issues .error button{color:#8d2b19}.designer .cnc-issues .warning button{color:#7a5a10}
.designer .cnc-ready{color:#2e7d5b;font-weight:700}.designer .cnc-blocked{color:#8d2b19;font-weight:700}
.designer .danger{background:#8d2b19;color:#fff}
@media(max-width:1100px){.designer{grid-template-columns:1fr;grid-template-rows:auto 420px auto}.designer .designer-left,.designer .designer-right{border:0}}
.designer .colour-row{display:flex;gap:6px;align-items:flex-end}.designer .colour-row label{flex:1}.designer .colour-row input{height:34px;padding:2px}.designer .colour-row button{font-size:11px;margin-bottom:8px}
</style>
