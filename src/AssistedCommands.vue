<script setup>
import {ref,shallowRef,computed,watch} from 'vue';
import {activeRoomId} from '../shared/project-rooms.mjs';
import {prepareDesignCommands,applyPreparedDesignCommands} from '../shared/design-commands.mjs';
const props=defineProps({project:{type:Object,required:true},disabled:Boolean}),emit=defineEmits(['apply']);
const text=ref(''),preview=shallowRef(null),message=ref('');
const roomId=computed(()=>activeRoomId(props.project)),stale=computed(()=>preview.value&&preview.value.sourceKey!==JSON.stringify(props.project));
watch(text,()=>{preview.value=null;message.value='';});
function example(){text.value=JSON.stringify({version:1,units:'m',roomId:roomId.value,commands:[{op:'add-cabinet',item:{id:crypto.randomUUID(),name:'Command cabinet',width:.6,depth:.4,height:1.2,x:0,z:0}}]},null,2);}
function prepare(){try{preview.value=prepareDesignCommands(props.project,text.value);message.value='Preview ready; the project has not changed';}catch(error){preview.value=null;message.value=error.message;}}
function apply(){if(props.disabled)return;try{const prepared=preview.value,next=applyPreparedDesignCommands(props.project,prepared);emit('apply',{sourceKey:prepared.sourceKey,room:next.room,count:prepared.count});preview.value=null;message.value='';}catch(error){message.value=error.message;}}
const description=item=>item?`${item.name} · (${item.x}, ${item.z}) m · ${item.rotation}° · ${item.width} × ${item.depth} × ${item.height} m`:'—';
</script>
<template>
  <section aria-label="Assisted design commands">
    <h3>Structured design commands</h3><p class="hint">A local command interface for furniture edits. No language model or external service is connected. Preview checks the entire batch; apply records one undo step. Positions and cabinet dimensions are metres, rotations are degrees. Wall constraints and linked openings remain enforced.</p>
    <p>Active room: <code data-testid="command-room-id">{{ roomId }}</code></p><p class="hint">Existing furniture IDs: {{ project.room.furniture.map(i=>i.id+' ('+i.name+')').join(', ')||'none' }}</p>
    <fieldset :disabled="disabled"><button type="button" @click="example">Load command example</button><label>Design command JSON<textarea v-model="text" rows="12" spellcheck="false"></textarea></label><p class="hint">Operations: add-cabinet, move, rotate, rename, remove. Maximum 20 commands and 32 KiB. The example uses the room centre; choose free space if occupied.</p><button type="button" @click="prepare">Preview design commands</button></fieldset>
    <p data-testid="command-message" role="status">{{ message }}</p><p v-if="stale" role="status">Project changed after preview; preview the commands again.</p>
    <div v-if="preview" data-testid="command-preview"><p>{{ preview.count }} commands · {{ preview.changes.length }} changed furniture items</p><table><thead><tr><th>Action / ID</th><th>Before</th><th>After</th></tr></thead><tbody><tr v-for="change in preview.changes" :key="change.id"><td>{{ change.action }} · {{ change.id }}</td><td>{{ description(change.before) }}</td><td>{{ description(change.after) }}</td></tr></tbody></table><button type="button" :disabled="disabled||stale" @click="apply">Apply command batch</button></div>
  </section>
</template>
