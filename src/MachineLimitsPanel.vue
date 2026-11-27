<script setup>
import {MACHINE_LIMIT_DEFAULTS} from '../shared/machine-limits.mjs';
defineProps({settings:{type:Object,required:true}});
const emit=defineEmits(['update']);
const set=(key,value)=>emit('update',{[key]:value});
const value=event=>event.target.value===''?null:Number(event.target.value);
</script>
<template>
      <details class="cam-settings"><summary>Machine limits</summary>
        <label><input type="checkbox" aria-label="Enforce machine limits" :checked="!!settings.machine" @change="set('machine',$event.target.checked?{...MACHINE_LIMIT_DEFAULTS}:null)">Enforce machine limits</label>
        <div v-if="settings.machine" class="mm-grid"><label v-for="[key,label] in [['travelX','X travel mm'],['travelY','Y travel mm'],['offsetX','Work offset X mm'],['offsetY','Work offset Y mm'],['maxDepth','Depth below work zero mm'],['maxSafeZ','Height above work zero mm'],['maxFeed','Maximum feed mm/min'],['maxRpm','Maximum spindle rpm'],['maxToolDiameter','Maximum tool diameter mm']]" :key="key">{{ label }}<input type="number" :aria-label="'Machine '+label" :value="settings.machine[key]" @change="set('machine',{...settings.machine,[key]:value($event)})"></label></div>
        <p class="hint">User-entered limits are saved with this design and block NC export when exceeded. Work zero is the panel corner. Checks include cutter radius and conservative full-circle arc bounds; they exclude clamps, holders, tool changes and controller setup. The simulated machine uses its own fixed setup.</p>
      </details>

</template>
