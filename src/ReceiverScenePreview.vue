<script setup>
import {ref,shallowRef,watch,onMounted,onBeforeUnmount} from 'vue';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {receiveTerraFluxModel} from '../shared/terraflux-receiver.mjs';
import {receiverPreviewFrame,createReceiverPreviewGroup,disposeReceiverPreviewGroup,fitReceiverPreviewCamera} from './receiver-preview-scene.js';
const props=defineProps({text:{type:String,required:true},allowOverlaps:Boolean}),emit=defineEmits(['close']);
const viewport=ref(null),closeButton=ref(null),sceneData=shallowRef(null),busy=ref(false),message=ref(''),error=ref(''),ceilings=ref(false),wireframe=ref(false),placement=ref({x:0,y:0,z:0,yaw:0});
let renderer,camera,scene,controls,group,observer,frame,disposed=false,previousFocus;
function fit(){if(!camera||!sceneData.value)return;const {span}=receiverPreviewFrame(sceneData.value),rect=viewport.value.getBoundingClientRect();fitReceiverPreviewCamera(camera,span,Math.max(1,rect.width)/Math.max(1,rect.height));controls.target.set(0,0,0);controls.update();}
function rebuild(){if(!scene||!sceneData.value)return;if(group){scene.remove(group);disposeReceiverPreviewGroup(group);}group=createReceiverPreviewGroup(sceneData.value,{ceilings:ceilings.value,wireframe:wireframe.value});scene.add(group);}
async function applyPlacement(){if(busy.value)return;if(!renderer||!camera||!scene){error.value='Receiver preview renderer is unavailable in this browser';return;}busy.value=true;error.value='';try{const next=await receiveTerraFluxModel(props.text,{allowOverlaps:props.allowOverlaps,placement:{...placement.value}});if(disposed)return;sceneData.value=next;rebuild();fit();message.value='Preview ready: '+next.summary.triangles+' triangles';}catch(cause){if(!disposed)error.value=cause.message;}finally{if(!disposed)busy.value=false;}}
watch([ceilings,wireframe],rebuild);
onMounted(async()=>{
 previousFocus=document.activeElement;closeButton.value?.focus();
 try{
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));viewport.value.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Receiver scene canvas');
  scene=new THREE.Scene();scene.background=new THREE.Color(0xe6ece4);scene.add(new THREE.HemisphereLight(0xffffff,0x596b60,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(4,8,5);scene.add(sun);
  camera=new THREE.PerspectiveCamera(45,1,.01,1000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  observer=new ResizeObserver(()=>{if(disposed)return;const r=viewport.value.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height));camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();});observer.observe(viewport.value);
  const animate=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);};animate();await applyPlacement();
 }catch(cause){error.value='Receiver preview unavailable: '+cause.message;}
});
onBeforeUnmount(()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();disposeReceiverPreviewGroup(group);renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});});
</script>
<template>
  <section class="receiver-preview" role="dialog" aria-label="Receiver scene preview" aria-modal="false" @keydown.stop @keydown.esc.prevent="emit('close')">
    <header><h3>Receiver scene preview</h3><button ref="closeButton" @click="emit('close')">Close receiver preview</button></header>
    <p>Verified file only · project-local metres · drag to orbit, wheel to zoom. Placement affects this preview only. Physics remains disconnected.</p>
    <fieldset :disabled="busy||!sceneData"><legend>Receiver placement</legend><label v-for="key in ['x','y','z','yaw']" :key="key">{{ key==='yaw'?'Yaw °':key.toUpperCase()+' m' }}<input v-model.number="placement[key]" type="number" :aria-label="'Receiver placement '+key" :step="key==='yaw'?1:.1"></label><button @click="applyPlacement">Apply receiver placement</button><button @click="fit">Fit receiver scene</button><label><input v-model="ceilings" type="checkbox">Show receiver ceilings</label><label><input v-model="wireframe" type="checkbox">Receiver wireframe</label></fieldset>
    <p data-testid="receiver-preview-status" role="status">{{ message }}</p><p v-if="error" role="alert">{{ error }} {{ sceneData?'The last valid scene remains unchanged.':'No scene has been loaded.' }}</p><p v-if="sceneData" data-testid="receiver-preview-bounds">{{ JSON.stringify(sceneData.summary.bounds) }}</p>
    <div ref="viewport" class="receiver-preview-canvas"></div>
  </section>
</template>
<style>
.receiver-preview{position:fixed;inset:4vh 4vw;z-index:200;display:flex;flex-direction:column;padding:16px;gap:6px;background:#edf1e8;color:#263e3c;box-shadow:0 8px 50px #0007;overflow:auto}.receiver-preview header{display:flex;align-items:center;justify-content:space-between;gap:12px}.receiver-preview h3,.receiver-preview p{margin:2px 0}.receiver-preview p{font-size:12px}.receiver-preview fieldset{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.receiver-preview fieldset label{display:flex;align-items:center;gap:4px;font-size:12px}.receiver-preview input[type=number]{width:90px}.receiver-preview-canvas{flex:1;min-height:220px;position:relative;overflow:hidden}.receiver-preview-canvas canvas{display:block;width:100%;height:100%;touch-action:none}
</style>
