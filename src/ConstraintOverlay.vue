<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {constraintLayout} from './constraint-layout.js';
const props=defineProps({room:{type:Object,required:true},camera:{type:Function,required:true},viewport:Object});
const markers=ref([]);let frame,previous='';
function update() {
  const element=props.viewport,layout=constraintLayout(props.room,props.camera(),element?.clientWidth,element?.clientHeight),next=JSON.stringify(layout);
  if(next!==previous) {markers.value=layout;previous=next;}
  frame=requestAnimationFrame(update);
}
onMounted(update);onBeforeUnmount(()=>cancelAnimationFrame(frame));
</script>
<template>
  <svg class="constraint-overlay" aria-label="Plan constraint indicators">
    <text v-for="marker in markers" :key="marker.key" :x="marker.x" :y="marker.y" :aria-label="marker.text+': '+marker.label" role="img"><title>{{ marker.label }}</title>{{ marker.text }}</text>
  </svg>
</template>
<style>
.constraint-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden}.constraint-overlay text{font:600 11px system-ui;fill:#ffe198;stroke:#203b33;stroke-width:4px;paint-order:stroke;stroke-linejoin:round}
</style>
