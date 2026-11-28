<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {constraintLayout,constraintFailureLayout} from './constraint-layout.js';
const props=defineProps({room:{type:Object,required:true},camera:{type:Function,required:true},viewport:Object,failure:Object});
const markers=ref([]),failureLines=ref([]);let frame,previous='';
function update() {
  const element=props.viewport,layout=constraintLayout(props.room,props.camera(),element?.clientWidth,element?.clientHeight),lines=constraintFailureLayout(props.room,props.failure,props.camera(),element?.clientWidth,element?.clientHeight),next=JSON.stringify([layout,lines]);
  if(next!==previous) {markers.value=layout;failureLines.value=lines;previous=next;}
  frame=requestAnimationFrame(update);
}
onMounted(update);onBeforeUnmount(()=>cancelAnimationFrame(frame));
</script>
<template>
  <svg class="constraint-overlay" aria-label="Plan constraint indicators">
    <line v-for="line in failureLines" :key="line.wall" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" :data-conflict-wall="line.wall" :aria-label="line.label" role="img" class="conflict-wall"><title>{{ line.label }}</title></line><text v-for="marker in markers" :key="marker.key" :x="marker.x" :y="marker.y" :aria-label="marker.text+': '+marker.label" role="img"><title>{{ marker.label }}</title>{{ marker.text }}</text>
  </svg>
</template>
<style>
.constraint-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden}.constraint-overlay .conflict-wall{stroke:#ff7b7b;stroke-width:6px;stroke-dasharray:8 4;opacity:.9}.constraint-overlay text{font:600 11px system-ui;fill:#ffe198;stroke:#203b33;stroke-width:4px;paint-order:stroke;stroke-linejoin:round}
</style>
