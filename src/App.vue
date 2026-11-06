<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoom, updateSurfaces, fitCamera, pickSurface, surfaces, createGrid, pickOpening } from './room-scene.js';

import { savePreset } from '../shared/presets.mjs';
import { exportPlanSvg } from '../shared/plan-svg.mjs';
import { validateProject } from '../shared/project.mjs';
import { bounds, edgeIds, validateOutline, snapPoint, scaleOutline, moveCorner } from '../shared/geometry.mjs';
import { dimensionLayout, openingChainLayout } from './dimensions.js';
import { createPlacementPreview } from './placement-preview.js';
import { wallLength, openingAtPoint, previewOpening, openingPreset } from '../shared/openings.mjs';
import { createHistory, commitHistory, undoHistory, redoHistory } from '../shared/history.mjs';
const blankProject=()=>validateProject({schemaVersion:1,units:'m',name:'Untitled studio',room:{width:6,depth:4,height:2.8}});
const project=ref(blankProject());
const activeProjectId=ref(null),projectChoice=ref(''),projectList=ref([]),listLoading=ref(true);
const dimensionDraft=ref({width:project.value.room.width,depth:project.value.room.depth,height:project.value.room.height});
watch(()=>project.value.room,room=>{dimensionDraft.value={width:room.width,depth:room.depth,height:room.height};},{deep:true});
const history=ref(createHistory(project.value.room)), dragging=ref(false), cornerHandles=ref([]);
let dragState;
const editingLocked=computed(()=>busy.value || dragging.value);
function applyRoom(room,record=true) {
  const next=validateProject({...project.value,room}).room;
  if(record) history.value=commitHistory(history.value,next);
  project.value.room=next;
}
function travel(direction) {
  if(editingLocked.value) return;
  placementType.value=null;
  history.value=direction==='undo'?undoHistory(history.value):redoHistory(history.value);
  project.value.room=JSON.parse(JSON.stringify(history.value.present));
  message.value=direction==='undo'?'Geometry edit undone':'Geometry edit redone';
}
function setHeight(event) {
  try { applyRoom({...project.value.room,height:Number(event.target.value)}); }
  catch(error) { message.value=error.message; }
  dimensionDraft.value.height=project.value.room.height;
  event.target.value=project.value.room.height;
}
const viewport = ref(null), message = ref('Ready to design'), busy = ref(false), metrics = ref(null), view = ref('3D');
const selected = ref(null);
const selectedLabel = computed(() => surfaces.find(surface => surface.id === selected.value)?.label || 'Nothing selected');
const hiddenSelection = computed(() => view.value === '3D' && ['south','east'].includes(selected.value));
const valid = computed(() => { try { validateProject(project.value); return true; } catch { return false; } });
const gridSpacing=ref(.25), snapEnabled=ref(true), endpointDraft=ref([]);
const selectedEdge=computed(()=>edgeIds.indexOf(selected.value));
const placementType=ref(null), placementPreview=ref(null), placementSize=ref(null);
const sizePresets={};
const presetName=ref(''),presetId=ref(null),chainLabels=ref([]);
const savedPresets=computed(()=>project.value.presets.filter(p=>p.type===placementType.value));
let previewGroup,previewId;
const selectedOpeningId=ref(null), openingDraft=ref(null), wallLabels=ref([]);
const wallOpenings=computed(()=>project.value.room.openings.filter(o=>o.wall===selected.value));
watch([selected,selectedOpeningId,project],()=>{
  const current=wallOpenings.value.find(o=>o.id===selectedOpeningId.value);
  openingDraft.value=current?{...current}:null;
},{deep:true});
function addOpening(type) {
  try {
    const length=wallLength(project.value.room.outline,selected.value), height=project.value.room.height;
    const width=Math.min(type==='door'?.9:1.2,length-.2);
    const occupied=[...wallOpenings.value].sort((a,b)=>a.offset-b.offset);
    let offset=.1;
    for(const o of occupied) {
      if(offset+width<=o.offset-.05) break;
      offset=Math.max(offset,o.offset+o.width+.1);
    }
    const opening={id:crypto.randomUUID(),wall:selected.value,type,offset,width,
      height:type==='door'?Math.min(2.1,height-.05):Math.min(1.2,height*.4),sill:type==='door'?0:Math.max(.1,height*.3)};
    applyRoom({...project.value.room,openings:[...project.value.room.openings,opening]});
    selectedOpeningId.value=opening.id; message.value=type==='door'?'Door added':'Window added';
  } catch(error) { message.value=error.message; }
}
function beginPlacement(type) {
  clearPreview(); previewId=crypto.randomUUID(); presetId.value=null;presetName.value='';
  const preset=openingPreset(project.value.room,selected.value,type,'size',0);
  placementSize.value={...(sizePresets[type]||{width:preset.width,height:preset.height,sill:preset.sill,hinge:'A',swing:'in'})};
  view.value='Plan'; placementType.value=type;
  message.value='Click near the selected wall · Escape cancels placement';
}
function saveOpeningPreset() {
  try {
    const presets=savePreset(project.value.presets,{id:crypto.randomUUID(),name:presetName.value,type:placementType.value,...placementSize.value});
    project.value=validateProject({...project.value,presets});
    presetId.value=presets.find(p=>p.type===placementType.value && p.name.toLowerCase()===presetName.value.trim().toLowerCase()).id;
    message.value='Preset saved · save project to keep it';
  } catch(error) {message.value=error.message;}
}
function useOpeningPreset() {
  const preset=savedPresets.value.find(p=>p.id===presetId.value);
  if(!preset) return;
  placementSize.value={width:preset.width,height:preset.height,sill:preset.sill,hinge:preset.hinge??'A',swing:preset.swing??'in'};
  presetName.value=preset.name;message.value='Preset applied';
}
function removeOpeningPreset() {
  try {
    project.value=validateProject({...project.value,presets:project.value.presets.filter(p=>p.id!==presetId.value)});
    presetId.value=null;message.value='Preset removed · save project to keep it';
  } catch(error) {message.value=error.message;}
}
function clearPreview() {
  if(previewGroup) {
    previewGroup.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});
    scene?.remove(previewGroup);previewGroup=null;
  }
  placementPreview.value=null;
}
function updatePreview(event) {
  if(!placementType.value || view.value!=='Plan' || busy.value) return;
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  if(!point) {clearPreview();return;}
  const result=previewOpening(project.value.room,selected.value,placementType.value,previewId,point,gridSpacing.value,snapEnabled.value,
    Math.max(.15,(camera.top-camera.bottom)/camera.zoom/rect.height*18),placementSize.value);
  clearPreview();placementPreview.value=result;
  previewGroup=createPlacementPreview(project.value.room,result);scene.add(previewGroup);
}
watch(placementType,clearPreview);
watch(placementSize,size=>{
  if(size && placementType.value) sizePresets[placementType.value]={...size};
  clearPreview();
},{deep:true});
watch([gridSpacing,snapEnabled],clearPreview);
function placeOpening(point,tolerance) {
  try {
    const opening=openingAtPoint(project.value.room,selected.value,placementType.value,crypto.randomUUID(),point,gridSpacing.value,snapEnabled.value,tolerance,placementSize.value);
    applyRoom({...project.value.room,openings:[...project.value.room.openings,opening]});
    selectedOpeningId.value=opening.id; placementType.value=null;
    message.value='Opening placed';
  } catch(error) { message.value=error.message; }
}
watch(selected,()=>{placementType.value=null;});
watch(view,mode=>{if(mode!=='Plan') placementType.value=null;});
function saveOpening() {
  try {
    applyRoom({...project.value.room,openings:project.value.room.openings.map(o=>o.id===openingDraft.value.id?{...openingDraft.value}:o)});
    message.value='Opening updated';
  } catch(error) { message.value=error.message; }
}
function deleteOpening() {
  try {
    applyRoom({...project.value.room,openings:project.value.room.openings.filter(o=>o.id!==selectedOpeningId.value)});
    selectedOpeningId.value=null; message.value='Opening removed';
  } catch(error) { message.value=error.message; }
}

function syncEndpoints() {
  const i=selectedEdge.value, points=project.value.room.outline;
  endpointDraft.value=i<0?[]:[{...points[i]},{...points[(i+1)%4]}];
}
watch([selected,project],syncEndpoints,{deep:true,immediate:true});
function updateOutline(outline) {
  const next=validateOutline(outline), b=bounds(next);
  applyRoom({...project.value.room,outline:next,width:b.width,depth:b.depth});
}
function applyEndpoints() {
  try {
    const outline=project.value.room.outline.map(p=>({...p}));
    endpointDraft.value.forEach((p,n)=>{ outline[(selectedEdge.value+n)%4]=snapPoint(p,gridSpacing.value,snapEnabled.value); });
    updateOutline(outline); message.value='Wall endpoints updated';
  } catch(error) { message.value=error.message; }
}
function setDimension(key,event) {
  try {
    updateOutline(scaleOutline(project.value.room.outline,key==='width'?'x':'z',Number(event.target.value)));
  } catch(error) { message.value=error.message; }
  dimensionDraft.value[key]=project.value.room[key];
  event.target.value=project.value.room[key];
}
let scene, camera, renderer, controls, roomGroup, grid, observer, frame;
let pointerStart;
let revision = 0;
watch(project, () => { revision++; metrics.value = null; rebuild(); }, { deep: true });
watch(selected, () => { if (roomGroup) updateSurfaces(roomGroup, view.value, selected.value); });
async function request(path, method, body) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function refreshProjects() {
  listLoading.value=true;
  try {
    projectList.value=await request('/api/projects','GET');
    if(!projectChoice.value && projectList.value.length) projectChoice.value=projectList.value[0].id;
  } catch(error) {message.value=error.message;}
  finally {listLoading.value=false;}
}
function newProject() {
  placementType.value=null;project.value=blankProject();activeProjectId.value=null;projectChoice.value='';
  selected.value=null;selectedOpeningId.value=null;history.value=createHistory(project.value.room);
  resetView();message.value='New project';
}
function exportPlan() {
  try {
    const blob=new Blob([exportPlanSvg(project.value)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=(project.value.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||'terratec')+'.svg';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='SVG plan exported';
  } catch(error) {message.value=error.message;}
}
async function action(kind) {
  placementType.value=null;
  busy.value = true;
  const atRevision = revision;
  try {
    if(kind==='load') {
      if(projectChoice.value) {const record=await request('/api/projects/'+projectChoice.value,'GET');project.value=record.project;activeProjectId.value=record.id;}
      else {project.value=await request('/api/project','GET');activeProjectId.value=null;}
      history.value=createHistory(project.value.room);selected.value=null;selectedOpeningId.value=null;resetView();message.value='Saved project opened';
    } else if(kind==='save') {
      const record=await request(activeProjectId.value?'/api/projects/'+activeProjectId.value:'/api/projects',activeProjectId.value?'PUT':'POST',project.value);
      activeProjectId.value=record.id;projectChoice.value=record.id;await refreshProjects();message.value='Project saved';
    }
    else {
      const result = await request('/api/geometry', 'POST', project.value);
      if (atRevision === revision) { metrics.value = result; message.value = 'Geometry calculated'; }
    }
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}
function disposeRoom() {
  if (!roomGroup) return;
  roomGroup.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); });
  scene.remove(roomGroup);
  if(grid) { grid.geometry.dispose(); grid.material.dispose(); scene.remove(grid); }
}
function rebuild() {
  if (!scene || !valid.value) return;
  disposeRoom();
  roomGroup = createRoom(project.value.room);
  updateSurfaces(roomGroup, view.value, selected.value);
  scene.add(roomGroup);
  grid=createGrid(project.value.room,gridSpacing.value); grid.visible=view.value==='Plan'; scene.add(grid);
}
function resetView() {
  if (!camera || !valid.value) return;
  // Consume residual damping before applying a deterministic fitted camera.
  controls.enableDamping = false; controls.update();
  const aspect = Math.max(viewport.value.clientWidth,1) / Math.max(viewport.value.clientHeight,1);
  fitCamera(camera, project.value.room, aspect, view.value);
  const b=bounds(project.value.room.outline);
  controls.target.set(b.x,0,b.z); controls.update();
  controls.enableDamping = true;
}
function setupCamera() {
  if (!renderer) return;
  cancelDrag();
  controls?.dispose();
  camera = view.value === 'Plan' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera(45,1,.01,10000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = view.value !== 'Plan';
  controls.screenSpacePanning = true;
  controls.minZoom = .05; controls.maxZoom = 100;
  if (view.value === 'Plan') controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  resetView();
  if (roomGroup) updateSurfaces(roomGroup,view.value,selected.value);
  if(grid) grid.visible=view.value==='Plan';
}
function pointerDown(event) {
  if(editingLocked.value) { pointerStart=null; return; }
  pointerStart = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved:false } : null;
}
function pointerUp(event) {
  const start = pointerStart; pointerStart = null;
  if (!start || event.pointerId !== start.id || !roomGroup || start.moved || Math.hypot(event.clientX-start.x,event.clientY-start.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width*2-1,y=-(event.clientY-rect.top)/rect.height*2+1;
  if(placementType.value && view.value==='Plan') {
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);
    const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    if(point) placeOpening(point,Math.max(.15,(camera.top-camera.bottom)/camera.zoom/rect.height*18));
    return;
  }
  const openingId=pickOpening(roomGroup,camera,x,y);
  selected.value=openingId?project.value.room.openings.find(o=>o.id===openingId).wall:pickSurface(roomGroup,camera,x,y);
  selectedOpeningId.value=openingId;
}
function pointerMove(event) {
  if(pointerStart && Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5) pointerStart.moved=true;
  if(pointerStart?.moved) clearPreview(); else updatePreview(event);
}
function clearPointer() { pointerStart = null; }
function projectHandles() {
  if(!camera || !viewport.value || view.value!=='Plan') { if(cornerHandles.value.length) cornerHandles.value=[]; if(wallLabels.value.length) wallLabels.value=[]; if(chainLabels.value.length) chainLabels.value=[]; return; }
  const w=viewport.value.clientWidth,h=viewport.value.clientHeight;
  const next=project.value.room.outline.map((p,index)=>{
    const point=new THREE.Vector3(p.x,0,p.z).project(camera);
    return {index,x:(point.x+1)*w/2,y:(1-point.y)*h/2,visible:Math.abs(point.x)<1 && Math.abs(point.y)<1};
  });
  if(JSON.stringify(next)!==JSON.stringify(cornerHandles.value)) cornerHandles.value=next;
  const labels=dimensionLayout(project.value.room.outline,camera,w,h,id=>id===selected.value && wallOpenings.value.length?60:28);
  if(JSON.stringify(labels)!==JSON.stringify(wallLabels.value)) wallLabels.value=labels;
  const chains=openingChainLayout(project.value.room,selected.value,camera,w,h);
  if(JSON.stringify(chains)!==JSON.stringify(chainLabels.value)) chainLabels.value=chains;
}
function startDrag(index,event) {
  if(event.button!==0 || !event.isPrimary || editingLocked.value || !valid.value) return;
  event.preventDefault(); event.stopPropagation(); placementType.value=null; clearPointer();
  // Stop camera inertia before establishing the drag plane.
  controls.enableDamping=false; controls.update(); controls.enableDamping=true; controls.enabled=false;
  dragState={index,id:event.pointerId,original:JSON.parse(JSON.stringify(project.value.room)),valid:true,target:event.currentTarget};
  dragging.value=true; selected.value=edgeIds[index];
  event.currentTarget.setPointerCapture(event.pointerId);
  message.value='Dragging corner · Escape cancels';
}
function dragCorner(event) {
  if(!dragState || event.pointerId!==dragState.id) return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  if(!hit) return;
  try {
    const outline=moveCorner(dragState.original.outline,dragState.index,{x:hit.x,z:hit.z},gridSpacing.value,snapEnabled.value);
    applyRoom({...dragState.original,outline},false); dragState.valid=true;
    message.value='Dragging corner · Escape cancels';
  } catch(error) { dragState.valid=false; message.value=error.message; }
}
function finishDrag(event) {
  if(!dragState || event.pointerId!==dragState.id) return;
  const state=dragState;
  if(!state.valid) { cancelDrag(); message.value='Invalid corner move cancelled'; return; }
  dragState=null; dragging.value=false; controls.enabled=true;
  if(state.target.hasPointerCapture(state.id)) state.target.releasePointerCapture(state.id);
  history.value=commitHistory(history.value,project.value.room);
  message.value='Corner moved';
}
function cancelDrag() {
  if(!dragState) return;
  const state=dragState; dragState=null; dragging.value=false;
  applyRoom(state.original,false); controls.enabled=true;
  if(state.target.hasPointerCapture(state.id)) state.target.releasePointerCapture(state.id);
  message.value='Corner move cancelled';
}
function keyboard(event) {
  if(event.key==='Escape') { if(placementType.value) { placementType.value=null; message.value='Opening placement cancelled'; return; } cancelDrag(); selected.value=null; return; }
  const tag=event.target?.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable) return;
  if((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    travel(event.key.toLowerCase()==='y' || event.shiftKey ? 'redo':'undo');
  }
}
watch(view, setupCamera);
watch(gridSpacing,rebuild);
onMounted(() => {
  refreshProjects();
  window.addEventListener('keydown',keyboard);
  window.addEventListener('blur',cancelDrag);
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#152c2d');
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    viewport.value.appendChild(renderer.domElement);
    setupCamera();
    renderer.domElement.addEventListener('pointerdown',pointerDown);
    renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointermove',pointerMove);
    renderer.domElement.addEventListener('pointercancel',clearPointer);
    renderer.domElement.addEventListener('pointerleave',clearPreview);
    scene.add(new THREE.HemisphereLight(0xffffff,0x365448,3));
    const sun = new THREE.DirectionalLight(0xffefcf,3); sun.position.set(8,12,6); scene.add(sun);
    observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = viewport.value;
      if (!w || !h) return;
      cancelDrag(); renderer.setSize(w,h); resetView();
    }); observer.observe(viewport.value);
    rebuild();
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); projectHandles(); renderer.render(scene,camera); }; animate();
  } catch { message.value = '3D view requires WebGL. Project save/load remains available.'; }
});
onBeforeUnmount(() => {
  clearPreview(); cancelDrag(); window.removeEventListener('keydown',keyboard); window.removeEventListener('blur',cancelDrag);
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); disposeRoom();
  renderer?.domElement.removeEventListener('pointerdown',pointerDown);
  renderer?.domElement.removeEventListener('pointerup',pointerUp);
  renderer?.domElement.removeEventListener('pointermove',pointerMove);
  renderer?.domElement.removeEventListener('pointercancel',clearPointer);
  renderer?.domElement.removeEventListener('pointerleave',clearPreview);
  renderer?.dispose();
});
</script>

<template>
  <div class="workspace">
    <header><a class="brand" href="/">terra<span>tec</span><small>DESIGN / BUILD / CONNECT</small></a><div class="actions"><select v-model="projectChoice" aria-label="Saved projects" :disabled="editingLocked || listLoading"><option value="">Choose project</option><option v-for="entry in projectList" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><button :disabled="editingLocked" @click="newProject">New</button><button :disabled="editingLocked || !valid" @click="exportPlan">Export SVG</button><button :disabled="editingLocked || listLoading" @click="action('load')">Open saved</button><button class="primary" :disabled="editingLocked || !valid" @click="action('save')">Save project</button></div></header>
    <aside><p class="eyebrow">PROJECT / 001</p><h1>A space to<br>make your own.</h1><label>Project name<input v-model="project.name" maxlength="120" :disabled="editingLocked"></label><div class="divider"></div><p class="eyebrow">ROOM DIMENSIONS · METRES</p><label v-for="key in ['width','depth']" :key="key">{{ key }}<input v-model.number="dimensionDraft[key]" @change="setDimension(key,$event)" type="number" min="0.1" max="1000" step="0.1" :disabled="editingLocked"></label><label>Height<input v-model.number="dimensionDraft.height" @change="setHeight" type="number" min="0.1" max="1000" step="0.1" :disabled="editingLocked"></label><div class="divider"></div><label class="snap-toggle"><input v-model="snapEnabled" type="checkbox" :disabled="editingLocked"> Snap endpoints to grid</label><label>Grid spacing<select v-model.number="gridSpacing" :disabled="editingLocked"><option :value=".1">0.10 m</option><option :value=".25">0.25 m</option><option :value=".5">0.50 m</option><option :value="1">1.00 m</option></select></label><p class="hint">Large rooms show a coarser grid; snapping uses the selected spacing.</p><fieldset v-if="selectedEdge >= 0" class="endpoint-editor" :disabled="editingLocked"><legend>{{ selectedLabel }} endpoints</legend><div v-for="(point,n) in endpointDraft" :key="n" class="endpoint-row"><label v-for="axis in ['x','z']" :key="axis">{{ n === 0 ? 'A' : 'B' }} {{ axis.toUpperCase() }}<input v-model.number="point[axis]" type="number" min="-1000" max="1000" :step="gridSpacing"></label></div><button @click="applyEndpoints">Apply endpoints</button><p class="hint">Adjoining walls share each corner. Convex four-corner rooms only.</p></fieldset><fieldset v-if="selectedEdge >= 0" class="opening-editor" :disabled="editingLocked"><legend>Wall openings</legend><div class="opening-actions"><button @click="addOpening('door')">Add door</button><button @click="addOpening('window')">Add window</button></div><div class="opening-actions"><button :aria-pressed="placementType === 'door'" @click="beginPlacement('door')">Place door</button><button :aria-pressed="placementType === 'window'" @click="beginPlacement('window')">Place window</button></div><div v-if="placementType && placementSize" class="placement-size"><p class="eyebrow">PLACEMENT SIZE · METRES</p><label v-for="field in ['width','height','sill']" :key="field">Placement {{ field }}<input v-model.number="placementSize[field]" type="number" min="0" step="0.01" :disabled="field === 'sill' && placementType === 'door'"></label><template v-if="placementType === 'door'"><label>Placement hinge<select v-model="placementSize.hinge" aria-label="Placement hinge"><option value="A">A end</option><option value="B">B end</option></select></label><label>Placement swing<select v-model="placementSize.swing" aria-label="Placement swing"><option value="in">Inward</option><option value="out">Outward</option></select></label></template><label>Preset name<input v-model="presetName" maxlength="60"></label><button @click="saveOpeningPreset">Save opening preset</button><label v-if="savedPresets.length">Saved opening preset<select v-model="presetId" aria-label="Saved opening preset"><option :value="null">Choose preset</option><option v-for="preset in savedPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label><div v-if="savedPresets.length" class="opening-actions"><button :disabled="!presetId" @click="useOpeningPreset">Use preset</button><button :disabled="!presetId" @click="removeOpeningPreset">Delete preset</button></div></div><p v-if="placementType" class="placement-note">Click the selected wall to place a {{ placementType }}.<button @click="placementType=null">Cancel placement</button></p><label v-if="wallOpenings.length">Opening<select v-model="selectedOpeningId" aria-label="Opening"><option :value="null">Choose opening</option><option v-for="(opening,index) in wallOpenings" :key="opening.id" :value="opening.id">{{ opening.type }} {{ index+1 }}</option></select></label><template v-if="openingDraft"><label v-for="field in ['offset','width','height','sill']" :key="field">Opening {{ field }}<input v-model.number="openingDraft[field]" type="number" min="0" step="0.05" :disabled="field === 'sill' && openingDraft.type === 'door'"></label><template v-if="openingDraft.type === 'door'"><label>Door hinge<select v-model="openingDraft.hinge" aria-label="Door hinge"><option value="A">A end</option><option value="B">B end</option></select></label><label>Door swing<select v-model="openingDraft.swing" aria-label="Door swing"><option value="in">Inward</option><option value="out">Outward</option></select></label></template><button @click="saveOpening">Apply opening</button><button @click="deleteOpening">Remove opening</button></template><p class="hint">Place mode uses the entered size and snaps only the offset from A. Door hinge and swing settings apply in both views. Offset follows A → B. Keep 0.05 m at wall ends, above openings and between openings. Plan cuts walls at up to 1.2 m.</p></fieldset><p v-if="!valid" class="hint">Enter a name and dimensions from 0.1 to 1000 m.</p><button class="calculate" :disabled="editingLocked || !valid" @click="action('calculate')">Calculate geometry ↗</button><dl v-if="metrics"><div><dt>Floor area</dt><dd>{{ metrics.area.toFixed(2) }} m²</dd></div><div><dt>Volume</dt><dd>{{ metrics.volume.toFixed(2) }} m³</dd></div><div><dt>Perimeter</dt><dd>{{ metrics.perimeter.toFixed(2) }} m</dd></div></dl><p class="hint">Width and depth scale the outline. Select a wall to edit its endpoints. Two walls are hidden in 3D.</p></aside>
    <main :class="{placing:placementType}"><nav aria-label="View"><button v-for="mode in ['3D','Plan']" :aria-pressed="view === mode" :class="{ selected: view === mode }" @click="view = mode">{{ mode }}</button><button :disabled="dragging" @click="resetView">Fit room</button><button :disabled="editingLocked || !history.past.length" @click="travel('undo')">Undo</button><button :disabled="editingLocked || !history.future.length" @click="travel('redo')">Redo</button></nav><div ref="viewport" class="viewport" aria-label="Interactive room preview"></div><div v-if="placementPreview" data-testid="placement-preview" class="preview-status" :class="{invalid:!placementPreview.valid}" role="status">{{ placementPreview.valid ? 'Placement valid · offset '+placementPreview.opening.offset.toFixed(2)+' m · '+placementPreview.opening.width.toFixed(2)+' × '+placementPreview.opening.height.toFixed(2)+' m' : placementPreview.error }}</div><div v-if="view === 'Plan'" class="dimension-layer"><svg class="dimension-lines" aria-label="Wall dimension lines"><g v-for="label in wallLabels" :key="label.id" v-show="label.visible" :data-wall-dimension="label.id"><line v-for="(segment,n) in label.segments" :key="n" v-bind="segment" /></g><g v-for="label in chainLabels" :key="label.id" v-show="label.visible" :data-chain-dimension="label.id"><line v-for="(segment,n) in label.segments" :key="n" v-bind="segment" /></g></svg><span v-for="label in chainLabels" :key="label.id" v-show="label.visible" class="wall-dimension chain-dimension" :class="{aperture:label.kind === 'opening'}" :data-chain-kind="label.kind" :title="label.kind === 'opening' ? 'Opening width' : 'Wall gap'" :style="{left:label.x+'px',top:label.y+'px'}">{{ label.length }} m</span><span v-for="label in wallLabels" :key="label.id" v-show="label.visible" class="wall-dimension" :data-wall="label.id" :style="{left:label.x+'px',top:label.y+'px'}">{{ label.length }} m</span></div><div v-if="view === 'Plan'" class="corner-layer"><button v-for="handle in cornerHandles" :key="handle.index" v-show="handle.visible" class="corner-handle" :class="{ dragging }" :style="{left:handle.x+'px',top:handle.y+'px'}" :aria-label="'Corner '+(handle.index+1)+' drag handle'" :disabled="busy || !valid" @pointerdown="startDrag(handle.index,$event)" @pointermove="dragCorner" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag"></button></div><section class="surface-panel" aria-label="Room surfaces"><p class="eyebrow">ROOM SURFACES</p><button v-for="surface in surfaces" :key="surface.id" :aria-pressed="selected === surface.id" :class="{ selected: selected === surface.id }" @click="selected = surface.id">{{ surface.label }}</button><p role="status">{{ selectedLabel }}</p><small v-if="hiddenSelection">Hidden in cutaway · switch to Plan</small><button :disabled="!selected" @click="selected = null">Clear selection</button></section><div class="canvas-note">{{ view === '3D' ? 'ORBIT TO EXPLORE' : 'ORTHOGRAPHIC PLAN · NORTH UP' }}<span>{{ view === '3D' ? 'Click to select · Drag to orbit · Scroll to zoom' : 'Drag a corner to edit · Drag elsewhere to pan · Scroll to zoom' }}</span></div></main>
    <footer role="status" aria-live="polite"><span class="dot"></span><span>{{ busy ? 'Working…' : message }}</span><span class="version">FOUNDATION 01 · METRES</span></footer>
  </div>
</template>
