<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const project = ref({ schemaVersion: 1, units: 'm', name: 'Untitled studio', room: { width: 6, depth: 4, height: 2.8 } });
const viewport = ref(null), message = ref('Ready to design'), busy = ref(false), metrics = ref(null), view = ref('3D');
const valid = computed(() => project.value.name.trim() && Object.values(project.value.room).every(v => Number.isFinite(v) && v >= .1 && v <= 1000));
let scene, camera, renderer, controls, roomGroup, observer, frame;
let revision = 0;
watch(project, () => { revision++; metrics.value = null; rebuild(); }, { deep: true });
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
    if (kind === 'load') { project.value = await request('/api/project', 'GET'); message.value = 'Saved project opened'; }
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
}
function rebuild() {
  if (!scene || !valid.value) return;
  disposeRoom();
  roomGroup = new THREE.Group();
  const { width: w, depth: d, height: h } = project.value.room;
  const box = (x, y, z, px, py, pz, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x,y,z), new THREE.MeshStandardMaterial({ color, roughness: .85 }));
    mesh.position.set(px,py,pz); roomGroup.add(mesh);
  };
  box(w,.08,d,0,-.04,0,0x9eb8ac);
  // Two walls are intentionally omitted for an unobstructed cutaway.
  box(w+.16,h,.16,0,h/2,-d/2-.08,0xddd6c8);
  box(.16,h,d,-w/2-.08,h/2,0,0xc4cabb);
  scene.add(roomGroup);
  const extent = Math.max(w,d,h);
  controls.target.set(0,0,0);
  camera.position.set(...(view.value === 'Plan' ? [0,extent*1.8,.001] : [extent,extent*.9,extent*1.2]));
  camera.far = Math.max(2000,extent*10); camera.updateProjectionMatrix(); controls.update();
}
watch(view, rebuild);
onMounted(() => {
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#152c2d');
    camera = new THREE.PerspectiveCamera(45,1,.01,10000);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    viewport.value.appendChild(renderer.domElement);
    controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff,0x365448,3));
    const sun = new THREE.DirectionalLight(0xffefcf,3); sun.position.set(8,12,6); scene.add(sun);
    observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = viewport.value;
      if (!w || !h) return;
      renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix();
    }); observer.observe(viewport.value);
    rebuild();
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }; animate();
  } catch { message.value = '3D view requires WebGL. Project save/load remains available.'; }
});
onBeforeUnmount(() => { cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); disposeRoom(); renderer?.dispose(); });
</script>

<template>
  <div class="workspace">
    <header><a class="brand" href="/">terra<span>tec</span><small>DESIGN / BUILD / CONNECT</small></a><div class="actions"><button :disabled="busy" @click="action('load')">Open saved</button><button class="primary" :disabled="busy || !valid" @click="action('save')">Save project</button></div></header>
    <aside><p class="eyebrow">PROJECT / 001</p><h1>A space to<br>make your own.</h1><label>Project name<input v-model="project.name" maxlength="120" :disabled="busy"></label><div class="divider"></div><p class="eyebrow">ROOM DIMENSIONS · METRES</p><label v-for="key in ['width','depth','height']" :key="key">{{ key }}<input v-model.number="project.room[key]" type="number" min="0.1" max="1000" step="0.1" :disabled="busy"></label><p v-if="!valid" class="hint">Enter a name and dimensions from 0.1 to 1000 m.</p><button class="calculate" :disabled="busy || !valid" @click="action('calculate')">Calculate geometry ↗</button><dl v-if="metrics"><div><dt>Floor area</dt><dd>{{ metrics.area.toFixed(2) }} m²</dd></div><div><dt>Volume</dt><dd>{{ metrics.volume.toFixed(2) }} m³</dd></div><div><dt>Perimeter</dt><dd>{{ metrics.perimeter.toFixed(2) }} m</dd></div></dl><p class="hint">Dimensions describe the clear interior. Two walls are hidden in this cutaway.</p></aside>
    <main><nav aria-label="View"><button v-for="mode in ['3D','Plan']" :class="{ selected: view === mode }" @click="view = mode">{{ mode }}</button></nav><div ref="viewport" class="viewport" aria-label="Interactive room preview"></div><div class="canvas-note">{{ view === '3D' ? 'ORBIT TO EXPLORE' : 'TOP VIEW · PERSPECTIVE' }}<span>Drag to orbit · Scroll to zoom · Right-drag to pan</span></div></main>
    <footer role="status" aria-live="polite"><span class="dot"></span>{{ busy ? 'Working…' : message }}<span class="version">FOUNDATION 01 · METRES</span></footer>
  </div>
</template>
