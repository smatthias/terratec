<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoom, updateSurfaces, fitCamera, pickSurface, surfaces, createGrid } from './room-scene.js';

import { validateProject } from '../shared/project.mjs';
import { bounds, edgeIds, validateOutline, snapPoint, scaleOutline } from '../shared/geometry.mjs';
const project = ref(validateProject({ schemaVersion: 1, units: 'm', name: 'Untitled studio', room: { width: 6, depth: 4, height: 2.8 } }));
const viewport = ref(null), message = ref('Ready to design'), busy = ref(false), metrics = ref(null), view = ref('3D');
const selected = ref(null);
const selectedLabel = computed(() => surfaces.find(surface => surface.id === selected.value)?.label || 'Nothing selected');
const hiddenSelection = computed(() => view.value === '3D' && ['south','east'].includes(selected.value));
const valid = computed(() => { try { validateProject(project.value); return true; } catch { return false; } });
const gridSpacing=ref(.25), snapEnabled=ref(true), endpointDraft=ref([]);
const selectedEdge=computed(()=>edgeIds.indexOf(selected.value));
function syncEndpoints() {
  const i=selectedEdge.value, points=project.value.room.outline;
  endpointDraft.value=i<0?[]:[{...points[i]},{...points[(i+1)%4]}];
}
watch([selected,project],syncEndpoints,{deep:true,immediate:true});
function updateOutline(outline) {
  const next=validateOutline(outline), b=bounds(next);
  project.value.room={...project.value.room,outline:next,width:b.width,depth:b.depth};
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
async function action(kind) {
  busy.value = true;
  const atRevision = revision;
  try {
    if (kind === 'load') { project.value = await request('/api/project', 'GET'); selected.value = null; message.value = 'Saved project opened'; }
    else if (kind === 'save') { await request('/api/project', 'PUT', project.value); message.value = 'Project saved'; }
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
  pointerStart = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
}
function pointerUp(event) {
  const start = pointerStart; pointerStart = null;
  if (!start || event.pointerId !== start.id || !roomGroup || Math.hypot(event.clientX-start.x,event.clientY-start.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  selected.value = pickSurface(roomGroup,camera,(event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
}
function clearPointer() { pointerStart = null; }
watch(view, setupCamera);
watch(gridSpacing,rebuild);
onMounted(() => {
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#152c2d');
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    viewport.value.appendChild(renderer.domElement);
    setupCamera();
    renderer.domElement.addEventListener('pointerdown',pointerDown);
    renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointercancel',clearPointer);
    scene.add(new THREE.HemisphereLight(0xffffff,0x365448,3));
    const sun = new THREE.DirectionalLight(0xffefcf,3); sun.position.set(8,12,6); scene.add(sun);
    observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = viewport.value;
      if (!w || !h) return;
      renderer.setSize(w,h); resetView();
    }); observer.observe(viewport.value);
    rebuild();
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }; animate();
  } catch { message.value = '3D view requires WebGL. Project save/load remains available.'; }
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); disposeRoom();
  renderer?.domElement.removeEventListener('pointerdown',pointerDown);
  renderer?.domElement.removeEventListener('pointerup',pointerUp);
  renderer?.domElement.removeEventListener('pointercancel',clearPointer);
  renderer?.dispose();
});
</script>

<template>
  <div class="workspace">
    <header><a class="brand" href="/">terra<span>tec</span><small>DESIGN / BUILD / CONNECT</small></a><div class="actions"><button :disabled="busy" @click="action('load')">Open saved</button><button class="primary" :disabled="busy || !valid" @click="action('save')">Save project</button></div></header>
    <aside><p class="eyebrow">PROJECT / 001</p><h1>A space to<br>make your own.</h1><label>Project name<input v-model="project.name" maxlength="120" :disabled="busy"></label><div class="divider"></div><p class="eyebrow">ROOM DIMENSIONS · METRES</p><label v-for="key in ['width','depth']" :key="key">{{ key }}<input :value="project.room[key]" @change="setDimension(key,$event)" type="number" min="0.1" max="1000" step="0.1" :disabled="busy"></label><label>Height<input v-model.number="project.room.height" type="number" min="0.1" max="1000" step="0.1" :disabled="busy"></label><div class="divider"></div><label class="snap-toggle"><input v-model="snapEnabled" type="checkbox"> Snap endpoints to grid</label><label>Grid spacing<select v-model.number="gridSpacing"><option :value=".1">0.10 m</option><option :value=".25">0.25 m</option><option :value=".5">0.50 m</option><option :value="1">1.00 m</option></select></label><p class="hint">Large rooms show a coarser grid; snapping uses the selected spacing.</p><fieldset v-if="selectedEdge >= 0" class="endpoint-editor" :disabled="busy"><legend>{{ selectedLabel }} endpoints</legend><div v-for="(point,n) in endpointDraft" :key="n" class="endpoint-row"><label v-for="axis in ['x','z']" :key="axis">{{ n === 0 ? 'A' : 'B' }} {{ axis.toUpperCase() }}<input v-model.number="point[axis]" type="number" min="-1000" max="1000" :step="gridSpacing"></label></div><button @click="applyEndpoints">Apply endpoints</button><p class="hint">Adjoining walls share each corner. Convex four-corner rooms only.</p></fieldset><p v-if="!valid" class="hint">Enter a name and dimensions from 0.1 to 1000 m.</p><button class="calculate" :disabled="busy || !valid" @click="action('calculate')">Calculate geometry ↗</button><dl v-if="metrics"><div><dt>Floor area</dt><dd>{{ metrics.area.toFixed(2) }} m²</dd></div><div><dt>Volume</dt><dd>{{ metrics.volume.toFixed(2) }} m³</dd></div><div><dt>Perimeter</dt><dd>{{ metrics.perimeter.toFixed(2) }} m</dd></div></dl><p class="hint">Width and depth scale the outline. Select a wall to edit its endpoints. Two walls are hidden in 3D.</p></aside>
    <main @keydown.esc="selected = null"><nav aria-label="View"><button v-for="mode in ['3D','Plan']" :aria-pressed="view === mode" :class="{ selected: view === mode }" @click="view = mode">{{ mode }}</button><button @click="resetView">Fit room</button></nav><div ref="viewport" class="viewport" aria-label="Interactive room preview"></div><section class="surface-panel" aria-label="Room surfaces"><p class="eyebrow">ROOM SURFACES</p><button v-for="surface in surfaces" :key="surface.id" :aria-pressed="selected === surface.id" :class="{ selected: selected === surface.id }" @click="selected = surface.id">{{ surface.label }}</button><p role="status">{{ selectedLabel }}</p><small v-if="hiddenSelection">Hidden in cutaway · switch to Plan</small><button :disabled="!selected" @click="selected = null">Clear selection</button></section><div class="canvas-note">{{ view === '3D' ? 'ORBIT TO EXPLORE' : 'ORTHOGRAPHIC PLAN · NORTH UP' }}<span>{{ view === '3D' ? 'Click to select · Drag to orbit · Scroll to zoom' : 'Click to select · Drag to pan · Scroll to zoom' }}</span></div></main>
    <footer role="status" aria-live="polite"><span class="dot"></span><span>{{ busy ? 'Working…' : message }}</span><span class="version">FOUNDATION 01 · METRES</span></footer>
  </div>
</template>
