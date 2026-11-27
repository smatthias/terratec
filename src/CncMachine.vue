<script setup>
// CNC machine: runs the NC program of a panel face, exactly as exported, on a
// simulated gantry router (cnc-machine.mjs, cnc-scene.js). Load a job, fit the
// cutters in the tool rack, then Cycle start: the machine changes tools, the
// spindle follows the program line by line and the blank is cut away, with
// feed hold, single block, feed override, dry run and alarms as on a real
// control. Picking a cutter in the rack sets its layer's tool (speeds and feeds
// from the chip load) as one design edit. Loaded on first use.
import {ref,shallowRef,computed,watch,onMounted,onBeforeUnmount,onActivated,onDeactivated,nextTick} from 'vue';
import BenchDesk from './BenchDesk.vue';
import {createCncScene,FEED_RAMP} from './cnc-scene.js';
import {cutterForm} from './tool-models.js';
import {toolIcon} from './tool-icons.js';
const CUTTER_FORMS={twist:'Twist drill',brad:'Brad point drill',forstner:'Forstner / hinge boring bit',upcut:'Upcut spiral',downcut:'Downcut spiral',compression:'Compression spiral',straight:'Straight bit'};
import {camPlan,POSTS} from '../shared/design-cam.mjs';
import {partProgram} from '../shared/cam-export.mjs';
import {updateLayerTool} from '../shared/furniture-design-edit.mjs';
import * as M from '../shared/cnc-machine.mjs';
import {MATERIALS} from '../shared/materials.mjs';

const props=defineProps({design:{type:Object,required:true},partId:{type:String,required:true},face:{type:String,default:null},
  // The studio's bottom taskbar: the bench's taskbar moves there while it is on screen.
  taskbar:{type:null,default:undefined},taskbarActive:{type:Boolean,default:true}});
const emit=defineEmits(['commit','close','message']);
const say=text=>emit('message',text);

// The bench's windows (BenchDesk.vue), back to front, with where they open.
const top=d=>Math.round(d.height*.52);
const WINDOWS=[
  {id:'setup',title:'Job setup and checks',rect:d=>({x:8,y:top(d),w:360,h:Math.max(160,d.height-top(d)-8)})},
  {id:'rack',title:'Tool rack',rect:d=>({x:8,y:8,w:360,h:Math.max(160,top(d)-16)})},
  {id:'program',title:'NC program',rect:d=>({x:Math.max(8,d.width-408),y:Math.min(632,d.height-168),w:400,h:Math.max(160,d.height-Math.min(632,d.height-168)-8)})},
  {id:'control',title:'Machine control',rect:d=>({x:Math.max(8,d.width-408),y:8,w:400,h:Math.min(616,d.height-16)})},
  {id:'help',title:'Help',rect:d=>({x:Math.round(d.width/2-230),y:Math.max(8,Math.round(d.height/2-130)),w:460,h:260}),minimized:true},
];

// ---- The job: one panel face of the design's CAM plan.
const plan=computed(()=>{try {return camPlan(props.design);} catch(error) {return {error:error.message,programs:[],tools:[],issues:[],cam:{post:'grbl'}};}});
const keyOf=p=>p.partId+'|'+p.face;
function firstJob() {
  const programs=plan.value.programs,own=programs.find(p=>p.partId===props.partId&&(!props.face||p.face===props.face));
  return own??programs.find(p=>p.partId===props.partId)??programs[0];
}
const jobKey=ref(firstJob()?keyOf(firstJob()):'');
const program=computed(()=>plan.value.programs.find(p=>keyOf(p)===jobKey.value)??null);
watch(()=>plan.value.programs.map(keyOf).join(),()=>{if(!program.value) jobKey.value=firstJob()?keyOf(firstJob()):'';});
const part=computed(()=>props.design.parts.find(p=>p.id===program.value?.partId)??null);
if(program.value&&program.value.partId!==props.partId) {const asked=props.design.parts.find(p=>p.id===props.partId);if(asked) say(`${asked.name} has no machining of its own · loaded ${program.value.name} face ${program.value.face}`);}
const margin=ref(20);
const setup=computed(()=>program.value?M.jobSetup(program.value,{margin:margin.value}):null);
const post=computed(()=>plan.value.cam?.post??'grbl');
const loaded=computed(()=>{
  if(plan.value.error) return {error:plan.value.error};
  if(!program.value) return {error:'The design has no panel machining to run: put a panel on a profile layer or give it holes, grooves or pockets.'};
  try {
    const text=partProgram(props.design,program.value.partId,program.value.face);
    return {text,run:M.loadProgram(text,{post:post.value,dwellMs:plan.value.cam.dwellMs,setup:setup.value})};
  } catch(error) {return {error:error.message};}
});
const run=computed(()=>loaded.value.run??null);
const inch=computed(()=>plan.value.cam?.units==='inch');

// ---- Tool rack: the design's layer tools with the cutters fitted for them.
const CHOICES='terratec.cnc.cutters.v1';
const choices=ref((()=>{try {return JSON.parse(localStorage.getItem(CHOICES)??'{}')??{};} catch {return {};}})());
const layerOf=id=>props.design.layers.find(l=>l.id===id);
const rack=computed(()=>plan.value.tools.map(t=>{const layer=layerOf(t.layerId);return {...t,layer,cutter:M.mountedCutter(layer.operation,t.diameter,choices.value[t.layerId])};}));
const toolOf=n=>rack.value.find(t=>t.number===n);
const radiusOf=n=>(toolOf(n)?.diameter??3)/2;
// What the job asks of each tool: its deepest cut and whether it bores holes larger than itself.
const usage=computed(()=>{
  const map=new Map();
  for(const b of program.value?.blocks??[]) {
    const u=map.get(b.tool.number)??{depth:0,bores:false};
    for(const m of b.moves) {if(-m.z>u.depth) u.depth=-m.z;if(b.operation==='drill'&&m.g>1) u.bores=true;}
    map.set(b.tool.number,u);
  }
  return map;
});
const material=computed(()=>part.value?.material??'birch');
const notes=t=>M.toolNotes(t,t.cutter,material.value,usage.value.get(t.number)??{});
const recommended=t=>M.recommendTool(t.cutter,material.value);
const isRecommended=t=>{const r=recommended(t);return ['rpm','feed','plunge','stepdown'].every(k=>Math.abs(r[k]-t[k])<1e-6);};
const chip=t=>M.chipLoad(t,t.cutter).toFixed(3);
function fitTool(t,cutter,text) {
  try {
    const tool=M.recommendTool(cutter,material.value);
    emit('commit',{design:updateLayerTool(props.design,t.layerId,tool),message:`T${t.number}${text} · ${tool.rpm} rpm · feed ${tool.feed} mm/min`});
  } catch(error) {say(error.message);}
}
function loadCutter(t,id) {
  const cutter=M.CUTTERS.find(c=>c.id===id);if(!cutter) return;
  choices.value={...choices.value,[t.layerId]:id};
  try {localStorage.setItem(CHOICES,JSON.stringify(choices.value));} catch {}
  fitTool(t,cutter,`: ${cutter.label} fitted`);
}
const useRecommended=t=>fitTool(t,t.cutter,' speeds and feeds for '+MATERIALS[material.value].label.toLowerCase());

// ---- The check (a full pass over a fresh blank) and its alarms.
const check=computed(()=>run.value?M.checkProgram(run.value,setup.value,radiusOf):null);
const alarmSet=computed(()=>new Set(check.value?.alarms.map(a=>a.index)??[]));
const camIssues=computed(()=>plan.value.issues.filter(i=>!program.value||i.partId===program.value.partId));

// ---- Running. `clock` is the run's position (cnc-machine.mjs advance); the
// display refs are refreshed every frame.
const STATES={ready:'READY',running:'CYCLE RUNNING',hold:'FEED HOLD',stopped:'PROGRAM STOP',alarm:'ALARM',done:'PROGRAM COMPLETE'};
const state=ref('ready'),notice=ref(''),override=ref(100),speed=ref(10),singleBlock=ref(false),dryRun=ref(false),camera=ref('machine');
// How the view shows the blank ('material' | 'depth') and the toolpath ('layer' | 'feed' | 'off').
const blankMode=ref('material'),pathMode=ref('layer');
const dro=shallowRef({x:0,y:0,z:0,mx:0,my:0,mz:0,feed:0,rapid:false,rpm:0,tool:0,line:-1,index:0,time:0,total:0,at:0});
const removed=ref(0),load=ref(0),loadTrace=shallowRef([]);
let clock={index:0,elapsed:0},pass=-1,machineTime=0,stock=null,view=null,lastLine=-1,shown=0,loadNow=0;
const DRY_Z=25;
const ov=()=>override.value/100;
// Cuts the blank from one clock to the next; returns {touched, volume (mm³)}.
function cutBetween(from,to) {
  const r=run.value;if(!r||!stock||dryRun.value) return {touched:false,volume:0};
  let dirty=null,touched=false,volume=0;
  for(let k=from.index;k<=Math.min(to.index,r.segments.length-1);k++) {
    if(k===to.index&&to.elapsed===0) break;
    const s=r.segments[k];if(s.kind!=='feed'||!s.tool) continue;
    const a=k===from.index?M.positionAt(r,from):s.a,b=k===to.index?M.positionAt(r,to):s.b,cut=M.cutStock(stock,a,b,radiusOf(s.tool));
    touched||=cut.touched;volume+=cut.removed;
    if(cut.dirty) dirty=dirty?[Math.min(dirty[0],cut.dirty[0]),Math.max(dirty[1],cut.dirty[1]),Math.min(dirty[2],cut.dirty[2]),Math.max(dirty[3],cut.dirty[3])]:cut.dirty;
  }
  if(dirty) view?.updateStock(dirty);
  removed.value+=volume/1000;
  return {touched,volume};
}
// Spindle load: the rate of material removal against a full-width slot at the
// step-down and programmed feed of the tool in the spindle (100 %).
// Smoothed over about a quarter of a second of real time, whatever the frame rate.
function spindleLoad(volume,seconds,segment,dt) {
  const t=segment&&toolOf(segment.tool);
  const full=t?t.diameter*Math.min(t.stepdown,setup.value.thickness)*t.feed/60:0,now=seconds>0&&full>0?volume/seconds/full:0;
  loadNow+=(now-loadNow)*(1-Math.exp(-dt/.25));if(loadNow<.005) loadNow=0;
}
// The machine moves every frame; the readouts refresh about 20 times a second while running.
function show(dt=0,cutting=false) {
  const r=run.value;if(!r) return;
  const s=r.segments[clock.index],current=s??r.segments.at(-1),p=M.positionAt(r,clock),m=M.toMachine(setup.value,p);
  view?.setPose(dryRun.value?{...p,z:p.z+DRY_Z}:p,{tool:current?.tool??0,spindle:!!current?.spindle&&state.value==='running',cutting,dt});
  view?.setProgress(clock.index);
  const now=performance.now();
  if(dt>0&&state.value==='running'&&now-shown<50) return;
  shown=now;
  const remaining=M.runTime(r,ov())-M.clockTime(r,clock,ov());
  dro.value={...p,mx:m.x,my:m.y,mz:m.z+(dryRun.value?DRY_Z:0),feed:s?.kind==='feed'?s.feed*ov():0,rapid:!!s&&(s.kind==='rapid'||s.kind==='change'),
    rpm:current?.spindle?current.rpm:0,tool:current?.tool??0,line:s?s.line:r.lines.length-1,index:clock.index,time:machineTime,total:machineTime+remaining,at:M.clockTime(r,clock)};
  load.value=Math.round(loadNow*100);
  if(state.value==='running') loadTrace.value=[...loadTrace.value.slice(-89),Math.min(150,load.value)];
  if(state.value==='running'&&dro.value.line!==lastLine) follow(dro.value.line);
  lastLine=dro.value.line;
}
function handle(event) {
  const r=run.value,s=r.segments[event.index];
  if(event.type==='stop') {
    state.value='stopped';
    notice.value=/\bfit T\d/i.test(s.message)?`Manual tool change · ${s.message}. Press Cycle start when it is fitted.`:`Program stop (M0) · ${s.message}. Press Cycle start to continue.`;
  } else if(event.type==='block') {state.value='hold';notice.value=`Single block · line ${r.segments[event.index-1].line+1} done`;}
  else if(event.type==='alarm') {
    state.value='alarm';const alarm=check.value.alarms.find(a=>a.index===event.index);
    notice.value=`${alarm.message}. Reset, or clear the alarm to run the move anyway.`;say('CNC alarm · '+alarm.message);
  } else if(event.type==='end') {
    state.value='done';notice.value=`Program complete in ${M.clockText(machineTime)} · ${removed.value.toFixed(1)} cm³ removed`;say(`${program.value.name} face ${program.value.face} machined · ${M.clockText(machineTime)}`);
  }
}
function step(dt) {
  if(!run.value) return;
  let cutting=false;
  if(state.value==='running') {
    const from={...clock},result=M.advance(run.value,clock,dt*speed.value,{override:ov(),singleBlock:singleBlock.value,alarms:dryRun.value?null:alarmSet.value,pass});
    clock=result.clock;machineTime+=result.used;
    const cut=cutBetween(from,clock);cutting=cut.touched;
    spindleLoad(cut.volume,result.used,run.value.segments[Math.min(clock.index,run.value.segments.length-1)],dt);
    if(result.event) handle(result.event);
  } else spindleLoad(0,0,null,dt);
  show(dt,cutting);
}
function cycleStart() {
  if(!run.value) {say(loaded.value.error);return;}
  if(state.value==='alarm') {say('Clear the alarm or reset first');return;}
  if(state.value==='done') rewind();
  state.value='running';notice.value='';
}
function feedHold() {if(state.value==='running') {state.value='hold';notice.value='Feed hold · Cycle start continues';}}
function rewind(silent=true) {
  clock={index:0,elapsed:0};pass=-1;machineTime=0;removed.value=0;state.value='ready';notice.value='';loadNow=0;loadTrace.value=[];
  if(stock) {M.resetStock(stock);view?.refreshStock();}
  show();if(!silent) say('Program rewound · blank reloaded');
}
function clearAlarm() {pass=clock.index;state.value='hold';notice.value='Alarm cleared · Cycle start runs the move anyway';}
// Runs to the end at once (program stops pass; alarms still stop the run).
function runToEnd() {
  if(!run.value) return;
  if(state.value==='done') rewind();
  for(let guard=0;guard<1e5;guard++) {
    const from={...clock},result=M.advance(run.value,clock,1e9,{override:ov(),alarms:dryRun.value?null:alarmSet.value,pass});
    clock=result.clock;machineTime+=result.used;cutBetween(from,clock);
    if(result.event.type==='stop') continue;
    handle(result.event);break;
  }
  show();follow(dro.value.line);
}
// Moves the run to a point at once, cutting everything before it.
function seek(target) {
  const r=run.value;if(!r) return;
  if(target.index<clock.index||target.index===clock.index&&target.elapsed<clock.elapsed) {
    clock={index:0,elapsed:0};removed.value=0;if(stock) {M.resetStock(stock);view?.refreshStock();}
  }
  cutBetween(clock,target);clock=target;pass=-1;machineTime=M.clockTime(r,clock,ov());
  const done=clock.index>=r.segments.length;
  state.value=done?'done':'hold';notice.value=done?'At the end of the program':`At line ${r.segments[clock.index].line+1} · Cycle start continues from here`;
  show();
}
const seekLine=n=>seek(M.clockAtLine(run.value,n));
// Reload the blank whenever the program, the blank or the rack change.
const jobSignature=computed(()=>run.value?[loaded.value.text,JSON.stringify(setup.value),rack.value.map(t=>t.cutter.id).join()].join('|'):'');
function loadJob() {
  const r=run.value;stock=r?M.createStock(setup.value):null;
  if(r&&view) {
    view.setJob({setup:setup.value,stock,segments:r.segments,look:look(),colorOf:n=>toolOf(n)?.layer.color??'#ffffff',rack:rack.value.map(t=>({number:t.number,cutter:t.cutter,color:t.layer.color}))});
    view.pathMode(pathMode.value);view.blankMode(blankMode.value);
  }
  rewind();
}
// (The note goes to the control window: the edit that changed the program has its own message.)
watch(jobSignature,(now,before)=>{loadJob();if(before&&now) notice.value='Program changed · rewound to the start';});
watch(pathMode,v=>view?.pathMode(v));
watch(blankMode,v=>view?.blankMode(v));
watch(camera,v=>view?.view(v));
watch(dryRun,v=>{if(state.value==='running') feedHold();say(v?`Dry run · Z ${DRY_Z} mm above the program: nothing is cut and alarms are off`:'Dry run off');});
// How the blank looks: its material (textures, core), its top colour (the
// piece's colour, tinting the grain) and, for solid wood, the paler colour of a fresh cut.
const mix=(a,b,t)=>[16,8,0].reduce((n,s)=>n+(Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t)<<s),0);
function look() {
  const id=material.value,top=parseInt((part.value?.color??'#dec49a').slice(1),16);
  return {material:id,top,cut:mix(MATERIALS[id]?.color??top,0xffffff,.22)};
}

// ---- Visualisation: the job timeline, the spindle load trace, legends and the depth probe.
const blocks=computed(()=>run.value?M.runBlocks(run.value):[]);
const duration=computed(()=>run.value?.duration||1);
const pct=v=>Math.max(0,Math.min(100,v/duration.value*100))+'%';
const blockColor=b=>b.kind==='cut'?toolOf(b.tool)?.layer.color??'#8a9a94':null;
const blockTitle=b=>`${b.kind==='stop'?'Program stop · '+b.message:b.kind==='change'?'Tool change':b.tool?`T${b.tool} ${toolOf(b.tool)?.layer.name??''}`:'Rapid to the job'} · ${M.clockText(b.t0)}${b.kind==='stop'?'':'–'+M.clockText(b.t1)}`;
function seekTimeline(event) {
  if(!run.value) return;
  const rect=event.currentTarget.getBoundingClientRect();
  seek(M.clockAtTime(run.value,Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*duration.value));
}
const trace=computed(()=>loadTrace.value.map((v,k)=>`${(k/89*100).toFixed(1)},${(36-v/150*34).toFixed(1)}`).join(' '));
const loadLevel=computed(()=>load.value>110?'high':load.value>80?'busy':'ok');
const mounted=computed(()=>{const t=toolOf(dro.value.tool);return t?`T${t.number} · ${t.cutter.label} · ${t.layer.name}`:'No tool in the spindle';});
const feedRange=computed(()=>{const f=(run.value?.segments??[]).filter(s=>s.kind==='feed').map(s=>s.feed);return f.length?[Math.min(...f),Math.max(...f)]:[0,0];});
const rampCss=colors=>`linear-gradient(90deg,${colors.join(',')})`;
const FEED_CSS=rampCss(FEED_RAMP.map(c=>'#'+c.toString(16).padStart(6,'0')));
const DEPTH_CSS=rampCss(['#d1cfc4','#54c7f5 8%','#40cc73 34%','#fad638 67%','#f05c33 97%','#b82e94 100%']);
const probeInfo=ref(null);
let probing=0;
function probeAt(event) {
  if(probing||!view) return;
  probing=requestAnimationFrame(()=>{
    probing=0;const hit=view?.probe(event),rect=host.value?.getBoundingClientRect();
    probeInfo.value=hit&&rect?{left:event.clientX-rect.left+14,top:event.clientY-rect.top+14,
      text:`X ${fmt(hit.x)} · Y ${fmt(hit.y)} · ${hit.through?'cut through':hit.depth<.02?'top surface':'depth '+(inch.value?(hit.depth/25.4).toFixed(4)+' in':hit.depth.toFixed(2)+' mm')}`}:null;
  });
}

// ---- The program listing: only the rows on screen are drawn.
const ROW=18,listEl=ref(null),scrollTop=ref(0),listHeight=ref(300);
const lines=computed(()=>run.value?.lines??[]);
const rows=computed(()=>{const first=Math.max(0,Math.floor(scrollTop.value/ROW)-8),count=Math.ceil(listHeight.value/ROW)+16;return lines.value.slice(first,first+count).map((text,k)=>({n:first+k,text}));});
function onScroll() {const el=listEl.value;if(el) {scrollTop.value=el.scrollTop;listHeight.value=el.clientHeight||300;}}
function follow(line) {
  const el=listEl.value;if(!el||line<0) return;
  const y=line*ROW;if(y<el.scrollTop+ROW||y>el.scrollTop+el.clientHeight-2*ROW) el.scrollTop=Math.max(0,y-el.clientHeight/2);
  onScroll();
}
function download() {
  const text=loaded.value.text;if(!text) return;
  const name=(props.design.name+'_'+program.value.name).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60)+'_face-'+program.value.face+POSTS[post.value].extension;
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('NC program saved · '+name);
}
function setMargin(event) {const v=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(v)&&v>=0&&v<=200) margin.value=v;else event.target.value=margin.value;}

// ---- Display helpers
const units=computed(()=>inch.value?'in':'mm');
const fmt=v=>inch.value?(v/25.4).toFixed(4):v.toFixed(3);
const feedText=computed(()=>dro.value.rapid?'RAPID':inch.value?(dro.value.feed/25.4).toFixed(1):Math.round(dro.value.feed));
const progress=computed(()=>run.value?.segments.length?Math.round(dro.value.index/run.value.segments.length*100):0);
const readout=computed(()=>run.value?`${STATES[state.value]} · ${program.value.name} face ${program.value.face} · line ${dro.value.line+1}/${lines.value.length} · ${M.clockText(dro.value.time)} of ${M.clockText(dro.value.total)}`:loaded.value.error??'');
const SPEEDS=[1,2,5,10,25,50,100,500];

// ---- Keys: Space starts or holds the cycle; Escape returns to the designer.
function keydown(event) {
  const tag=event.target?.tagName;
  if(event.key==='Escape') {event.preventDefault();emit('close');return;}
  if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)||event.ctrlKey||event.metaKey||event.altKey) return;
  if(event.key===' ') {event.preventDefault();if(state.value==='running') feedHold();else cycleStart();}
}
const host=ref(null),webgl=ref(true);
let timer=0,resized=null;
onMounted(async()=>{
  window.addEventListener('keydown',keydown);
  await nextTick();
  try {view=createCncScene(host.value,{onFrame:step});}
  catch {webgl.value=false;view=null;let last=performance.now();const loop=now=>{timer=requestAnimationFrame(loop);step(Math.min(.1,(now-last)/1000));last=now;};timer=requestAnimationFrame(loop);}
  loadJob();onScroll();
  resized=new ResizeObserver(onScroll);if(listEl.value) resized.observe(listEl.value);
});
onActivated(()=>window.addEventListener('keydown',keydown));
onDeactivated(()=>{window.removeEventListener('keydown',keydown);feedHold();});
onBeforeUnmount(()=>{window.removeEventListener('keydown',keydown);cancelAnimationFrame(timer);resized?.disconnect();view?.dispose();});
</script>
<template>
  <section class="workbench cnc-machine" aria-label="CNC machine">
    <BenchDesk storage-key="cnc-machine" :windows="WINDOWS" :status="readout" :taskbar-target="taskbar" :taskbar-active="taskbarActive">
      <template #background>
        <div ref="host" class="bench-canvas" @pointermove="probeAt" @pointerleave="probeInfo=null"></div>
        <p v-if="!webgl" class="bench-note">The machine view needs WebGL; the program still runs from the windows.</p>
        <nav v-if="webgl" class="cnc-views" aria-label="Machine view">
          <span class="label">Blank</span>
          <button :aria-pressed="blankMode==='material'" title="The material: its face, and the core or plies where it is cut" @click="blankMode='material'">Material</button>
          <button :aria-pressed="blankMode==='depth'" title="Colour the blank by how deep it is cut" @click="blankMode='depth'">Depth map</button>
          <span class="sep"></span><span class="label">Toolpath</span>
          <button v-for="[mode,label] in [['layer','By layer'],['feed','Feed rate'],['off','Off']]" :key="mode" :aria-pressed="pathMode===mode" @click="pathMode=mode">{{ label }}</button>
          <span v-if="blankMode==='depth'" class="legend" data-testid="depth-legend"><i :style="{background:DEPTH_CSS}"></i>top · {{ setup?.thickness }} mm through</span>
          <span v-if="pathMode==='feed'" class="legend" data-testid="feed-legend"><i :style="{background:FEED_CSS}"></i>{{ feedRange[0] }}–{{ feedRange[1] }} mm/min · rapids yellow</span>
        </nav>
        <p v-if="probeInfo" class="cnc-probe" data-testid="cnc-probe" :style="{left:probeInfo.left+'px',top:probeInfo.top+'px'}">{{ probeInfo.text }}</p>
      </template>
      <template #start>
        <button @click="emit('close')">Back to designer</button>
        <button :aria-pressed="camera==='machine'" @click="camera='machine'">Machine view</button>
        <button :aria-pressed="camera==='follow'" @click="camera='follow'">Follow the tool</button>
        <button :aria-pressed="camera==='top'" @click="camera='top'">Top view</button>
      </template>
      <template #control><div class="bench-panel cnc-control">
        <div class="cnc-state" :class="state" data-testid="cnc-state"><span class="lamp"></span><strong>{{ STATES[state] }}</strong><span v-if="program">{{ program.name }} · face {{ program.face }}</span></div>
        <p v-if="notice" class="cnc-notice" :class="state" role="status" data-testid="cnc-notice">{{ notice }}</p>
        <p v-if="loaded.error" class="bench-problem" role="alert">{{ loaded.error }}</p>
        <div class="dro" role="group" aria-label="Position readout">
          <div v-for="axis in ['x','y','z']" :key="axis" class="dro-axis"><span>{{ axis.toUpperCase() }}</span><output :aria-label="'Work '+axis.toUpperCase()">{{ fmt(dro[axis]) }}</output><small>{{ units }} · machine {{ fmt(dro['m'+axis]) }}</small></div>
          <p class="dro-tool" data-testid="cnc-tool"><svg v-if="toolOf(dro.tool)" class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="toolIcon(cutterForm(toolOf(dro.tool).cutter))"/></svg>{{ mounted }}</p>
          <div class="dro-load" :class="loadLevel"><span>LOAD</span><b><i :style="{width:Math.min(100,load/1.5)+'%'}"></i></b><output aria-label="Spindle load">{{ load }} %</output>
            <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="13.3" y2="13.3"/><polyline :points="trace"/></svg></div>
          <div class="dro-row"><span>F <output aria-label="Feed">{{ feedText }}</output></span><span>S <output aria-label="Spindle speed">{{ dro.rpm }}</output></span><span>T <output aria-label="Tool">{{ dro.tool||'–' }}</output></span><span>N <output aria-label="Line">{{ dro.line+1 }}</output></span></div>
        </div>
        <div class="cnc-buttons">
          <button class="primary" :disabled="!run||state==='running'||state==='alarm'" title="Space" @click="cycleStart">▶ Cycle start</button>
          <button :disabled="state!=='running'" title="Space" @click="feedHold">❚❚ Feed hold</button>
          <button :disabled="!run" @click="rewind(false)">■ Reset</button>
          <button :disabled="!run||state==='done'" @click="runToEnd">⏭ Run to end</button>
          <button v-if="state==='alarm'" class="danger" @click="clearAlarm">Clear alarm</button>
        </div>
        <label>Feed override · {{ override }} %<input v-model.number="override" type="range" min="10" max="200" step="10" aria-label="Feed override"></label>
        <div class="cnc-options">
          <label>Simulation<select v-model.number="speed" aria-label="Simulation speed"><option v-for="s in SPEEDS" :key="s" :value="s">{{ s===1?'real time':s+' × faster' }}</option></select></label>
          <label class="snap-toggle"><input v-model="singleBlock" type="checkbox" aria-label="Single block">Single block</label>
          <label class="snap-toggle"><input v-model="dryRun" type="checkbox" aria-label="Dry run">Dry run</label>
        </div>
        <div class="cnc-timeline" role="group" aria-label="Job timeline: click to go there" title="Click to go to that moment of the job" @click="seekTimeline">
          <span v-for="(b,k) in blocks" :key="k" :class="b.kind" :style="{left:pct(b.t0),width:b.kind==='stop'?'':pct(b.t1-b.t0),background:blockColor(b)}" :title="blockTitle(b)"></span>
          <i class="now" :style="{left:pct(dro.at)}"></i>
        </div>
        <label>Program · {{ progress }} %<input type="range" min="0" :max="run?.segments.length??0" :value="dro.index" aria-label="Program position" :disabled="!run" @input="seek({index:Number($event.target.value),elapsed:0})"></label>
        <p class="hint">Machine time {{ M.clockText(dro.time) }} of {{ M.clockText(dro.total) }} at {{ override }} % feed · {{ removed.toFixed(1) }} cm³ removed</p>
      </div></template>
      <template #program><div class="bench-panel cnc-program">
        <p class="eyebrow">{{ POSTS[post].label.toUpperCase() }} · {{ lines.length }} LINES</p>
        <div ref="listEl" class="nc-list" role="list" aria-label="Program lines" @scroll="onScroll">
          <div :style="{height:lines.length*ROW+'px'}" class="nc-lines">
            <button v-for="row in rows" :key="row.n" role="listitem" class="nc-line" :class="{current:row.n===dro.line,done:row.n<dro.line}" :style="{top:row.n*ROW+'px'}" :title="'Run to line '+(row.n+1)" @click="seekLine(row.n)"><span>{{ row.n+1 }}</span>{{ row.text }}</button>
          </div>
        </div>
        <button :disabled="!loaded.text" @click="download">Save this program ({{ POSTS[post].extension }})</button>
      </div></template>
      <template #rack><div class="bench-panel cnc-rack">
        <p class="hint">{{ MATERIALS[material]?.label }} · speeds and feeds from the chip load. Fitting a cutter sets its layer's tool; Ctrl/⌘+Z undoes it.</p>
        <ol class="rack-list">
          <li v-for="t in rack" :key="t.layerId" :class="{idle:!usage.has(t.number)}">
            <p class="rack-head"><svg class="tool-icon" viewBox="0 0 24 24" :aria-label="CUTTER_FORMS[cutterForm(t.cutter)]"><path :d="toolIcon(cutterForm(t.cutter))"/></svg><strong>T{{ t.number }}</strong><span class="swatch" :style="{background:t.layer.color}"></span>{{ t.layer.name }} · {{ t.layer.operation }}<small v-if="!usage.has(t.number)">not in this job</small></p>
            <select :value="t.cutter.id" :aria-label="'Cutter for T'+t.number" @change="loadCutter(t,$event.target.value)">
              <option v-if="t.cutter.id==='custom'" value="custom">{{ t.cutter.label }} · {{ t.cutter.use }}</option>
              <option v-for="c in M.cuttersFor(t.layer.operation)" :key="c.id" :value="c.id">{{ c.label }} · {{ c.use }}</option>
            </select>
            <p class="rack-data">Ø{{ t.diameter }} · {{ t.cutter.flutes }} flute{{ t.cutter.flutes>1?'s':'' }} · reach {{ t.cutter.reach }} mm · {{ t.rpm }} rpm · feed {{ t.feed }} · plunge {{ t.plunge }} · step {{ t.stepdown }} mm<template v-if="t.cutter.kind!=='drill'"> · chip load {{ chip(t) }} mm/tooth</template></p>
            <ul v-if="notes(t).length" class="rack-notes"><li v-for="(n,k) in notes(t)" :key="k" :class="n.severity">{{ n.message }}</li></ul>
            <button v-if="!isRecommended(t)" :aria-label="'Recommended speeds and feeds for T'+t.number" @click="useRecommended(t)">Use {{ recommended(t).rpm }} rpm · feed {{ recommended(t).feed }} · step {{ recommended(t).stepdown }} mm</button>
          </li>
        </ol>
      </div></template>
      <template #setup><div class="bench-panel cnc-setup">
        <label>Job<select v-model="jobKey" aria-label="Job"><option v-for="p in plan.programs" :key="keyOf(p)" :value="keyOf(p)">{{ p.name }} · face {{ p.face }}</option></select></label>
        <p class="hint">{{ M.MACHINE.label }} · {{ POSTS[post].label }}</p>
        <dl v-if="setup" class="cnc-facts">
          <div><dt>Blank</dt><dd>{{ setup.blank.x1-setup.blank.x0 }} × {{ setup.blank.y1-setup.blank.y0 }} × {{ setup.thickness }} mm · {{ program.material }}</dd></div>
          <div><dt>Work zero (G54)</dt><dd>part corner · X {{ setup.offset.x }} Y {{ setup.offset.y }} mm from the table corner · Z0 on top</dd></div>
          <div v-if="run"><dt>Cycle time</dt><dd data-testid="cnc-cycle-time">{{ M.clockText(M.runTime(run,override/100)) }} at {{ override }} % · {{ run.toolChanges }} tool change{{ run.toolChanges===1?'':'s' }}</dd></div>
          <div v-if="check"><dt>Cutting</dt><dd>{{ check.cutLength.toFixed(2) }} m · {{ check.removed.toFixed(1) }} cm³ · rapids {{ check.rapidLength.toFixed(2) }} m</dd></div>
        </dl>
        <label v-if="setup?.cutOut">Blank margin mm<input type="number" min="0" max="200" step="1" :value="margin" aria-label="Blank margin" @change="setMargin"></label>
        <p v-if="setup?.cutOut" class="hint">The part is cut free from a blank {{ margin }} mm larger on every side, held by {{ program.tabs }} tab{{ program.tabs===1?'':'s' }}.</p>
        <p v-if="program?.face==='B'" class="hint">Face B: load the cut-out panel turned over about its length, face B up, against the stops.</p>
        <p v-if="program?.edgeHoles" class="hint">{{ program.edgeHoles }} edge hole{{ program.edgeHoles===1?' needs':'s need' }} a horizontal drilling unit and {{ program.edgeHoles===1?'is':'are' }} not in this program.</p>
        <p class="eyebrow">PROGRAM CHECK</p>
        <p v-if="check" data-testid="cnc-check" :class="check.alarms.length?'cnc-blocked':'cnc-ready'">{{ check.alarms.length?`${check.alarms.length} alarm${check.alarms.length===1?'':'s'}: the run stops before ${check.alarms.length===1?'it':'each'}`:'No alarms · no rapid into the material, the spindle runs for every cut, all within travel' }}</p>
        <ul class="cnc-issues">
          <li v-for="a in check?.alarms??[]" :key="'a'+a.index" class="error"><button @click="seekLine(a.line)">{{ a.message }}</button></li>
          <li v-for="(i,k) in camIssues" :key="'i'+k" :class="i.severity">{{ i.message }}</li>
        </ul>
      </div></template>
      <template #help><div class="bench-panel"><p class="hint">Cycle start (Space) runs the program; Feed hold (Space) pauses it. At a tool change the machine returns its tool to the rack and fetches the next; on GRBL it waits (M0) for you to fit the tool. Single block stops after every line; feed override speeds feed moves up or down as on the control (rapids and tool changes keep their speed); Simulation runs the whole machine faster than real time. Dry run lifts the tool {{ DRY_Z }} mm and cuts nothing. Click a program line or drag the program slider to go there at once. The program check runs the whole program before you start: an alarm stops the run before the move. Escape returns to the designer.</p></div></template>
    </BenchDesk>
  </section>
</template>
<style>
/* Not scoped, namespaced under .cnc-machine (bench.css has the shared bench styles). */
.cnc-machine .cnc-views{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:2px;max-width:calc(100% - 820px);min-width:300px;padding:4px;background:#f2f3ebf2;border-radius:8px;font-size:11px}
.cnc-machine .cnc-views button{padding:5px 9px;border:0;font-size:11px}.cnc-machine .cnc-views button[aria-pressed=true]{background:#263e3c;color:#f2f3eb}
.cnc-machine .cnc-views .label{margin:0 4px;color:#60746a;font-size:10px;letter-spacing:1px;text-transform:uppercase}.cnc-machine .cnc-views .sep{width:1px;align-self:stretch;margin:2px 4px;background:#c9d3c8}
.cnc-machine .cnc-views .legend{display:flex;align-items:center;gap:6px;margin-left:8px;color:#3f5a52}.cnc-machine .cnc-views .legend i{display:inline-block;width:90px;height:9px;border-radius:3px}
.cnc-machine .cnc-probe{position:absolute;z-index:3;margin:0;padding:4px 8px;border-radius:5px;background:#0f1816e6;color:#8fe3b0;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;pointer-events:none;white-space:nowrap}
.cnc-machine .dro-tool .tool-icon{width:16px;height:16px;margin-right:5px;vertical-align:-4px;color:#8fe3b0}.cnc-machine .rack-head .tool-icon{width:24px;height:24px;color:#263e3c}
.cnc-machine .dro-tool{margin:6px 0 0;padding-top:6px;border-top:1px solid #24352f;font-size:11px;color:#cfe0d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cnc-machine .dro-load{display:grid;grid-template-columns:38px 1fr 46px;grid-template-rows:auto 30px;align-items:center;gap:2px 6px;margin-top:6px;font-size:11px;color:#f2f3eb}
.cnc-machine .dro-load b{height:8px;border-radius:4px;background:#24352f;overflow:hidden}.cnc-machine .dro-load b i{display:block;height:100%;background:#46d37e;transition:width .15s}
.cnc-machine .dro-load.busy b i{background:#f0b429}.cnc-machine .dro-load.high b i{background:#ff4d3d}.cnc-machine .dro-load output{text-align:right;color:#8fe3b0}
.cnc-machine .dro-load svg{grid-column:1/-1;width:100%;height:30px}.cnc-machine .dro-load polyline{fill:none;stroke:#8fe3b0;stroke-width:1.2;vector-effect:non-scaling-stroke}.cnc-machine .dro-load line{stroke:#3a5249;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.cnc-machine .cnc-timeline{position:relative;height:18px;margin:8px 0 2px;border-radius:4px;background:#dfe6dc;overflow:hidden;cursor:pointer}
.cnc-machine .cnc-timeline span{position:absolute;top:0;bottom:0;opacity:.9}.cnc-machine .cnc-timeline span.cut{border-right:1px solid #f2f3eb}
.cnc-machine .cnc-timeline span.change{background:repeating-linear-gradient(45deg,#6c7a74 0 3px,#9aa7a0 3px 6px)}.cnc-machine .cnc-timeline span.stop{width:3px;margin-left:-1px;background:#d9382a;z-index:1}
.cnc-machine .cnc-timeline .now{position:absolute;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:#14201e;box-shadow:0 0 0 1px #f2f3eb;z-index:2}
.cnc-machine .cnc-state{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:#14201e;color:#cfe0d6;font-size:11px}
.cnc-machine .cnc-state strong{letter-spacing:1.5px;color:#f2f3eb}.cnc-machine .cnc-state span:last-child{margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cnc-machine .lamp{width:10px;height:10px;border-radius:50%;background:#6c7a74;flex:none}
.cnc-machine .running .lamp{background:#46d37e;box-shadow:0 0 8px #46d37e}.cnc-machine .hold .lamp,.cnc-machine .stopped .lamp{background:#f0b429;animation:cnc-blink 1s steps(2) infinite}
.cnc-machine .alarm .lamp{background:#ff4d3d;box-shadow:0 0 8px #ff4d3d;animation:cnc-blink .5s steps(2) infinite}.cnc-machine .done .lamp{background:#5fb3ff}
@keyframes cnc-blink{50%{opacity:.25}}
.cnc-machine .cnc-notice{margin:6px 0;padding:6px 8px;border-radius:6px;background:#e9eddd;font-size:11px}.cnc-machine .cnc-notice.alarm{background:#f6d9d3;color:#8d2b19;font-weight:700}.cnc-machine .cnc-notice.stopped{background:#f7e8bf}
.cnc-machine .dro{margin:8px 0;padding:8px 10px;border-radius:6px;background:#0f1816;color:#8fe3b0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cnc-machine .dro-axis{display:grid;grid-template-columns:18px 1fr;align-items:baseline}.cnc-machine .dro-axis span{color:#f2f3eb;font-weight:700}
.cnc-machine .dro-axis output{font-size:20px;text-align:right;letter-spacing:1px}.cnc-machine .dro-axis small{grid-column:2;text-align:right;font-size:10px;color:#5f8f78}
.cnc-machine .dro-row{display:flex;justify-content:space-between;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #24352f;font-size:12px;color:#f2f3eb}.cnc-machine .dro-row output{color:#8fe3b0}
.cnc-machine .cnc-buttons{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0}.cnc-machine .cnc-buttons button{padding:8px 6px;font-size:12px}
.cnc-machine .cnc-buttons .danger{grid-column:1/-1;background:#8d2b19;color:#fff;border-color:#8d2b19}
.cnc-machine input[type=range]{padding:0;margin-top:4px;accent-color:#263e3c}
.cnc-machine .cnc-options{display:flex;align-items:flex-end;gap:10px}.cnc-machine .cnc-options label{margin:4px 0}.cnc-machine .cnc-options select{margin-top:3px;padding:5px;width:auto}
.cnc-machine .cnc-options .snap-toggle{white-space:nowrap;margin-bottom:9px}
.cnc-machine .cnc-program{display:flex;flex-direction:column;height:100%}.cnc-machine .cnc-program .eyebrow{margin:0 0 4px}
.cnc-machine .nc-list{flex:1;min-height:80px;overflow:auto;border-radius:6px;background:#0f1816;font:11px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cnc-machine .nc-lines{position:relative}.cnc-machine .nc-line{position:absolute;left:0;right:0;height:18px;padding:0 8px 0 0;border:0;border-radius:0;text-align:left;white-space:pre;overflow:hidden;color:#cfe0d6;font:inherit}
.cnc-machine .nc-line span{display:inline-block;width:44px;margin-right:8px;padding-right:6px;text-align:right;color:#5f8f78;background:#14201e}
.cnc-machine .nc-line.done{color:#6f8a7e}.cnc-machine .nc-line.current{background:#f0b429;color:#14201e}.cnc-machine .nc-line.current span{background:#d89c12;color:#14201e}.cnc-machine .nc-line:hover{background:#24352f}
.cnc-machine .cnc-program>button{margin-top:6px;font-size:11px;padding:6px}
.cnc-machine .rack-list{list-style:none;margin:4px 0;padding:0}.cnc-machine .rack-list>li{padding:6px 0;border-bottom:1px solid #dde3d9}.cnc-machine .rack-list>li.idle{opacity:.6}
.cnc-machine .rack-head{display:flex;align-items:center;gap:6px;margin:0 0 4px;font-size:12px}.cnc-machine .rack-head small{margin-left:auto;color:#60746a}
.cnc-machine .swatch{display:inline-block;width:10px;height:10px;border:1px solid #0003;border-radius:2px}
.cnc-machine .rack-list select{margin:0;padding:5px;font-size:11px}.cnc-machine .rack-data{margin:4px 0;font-size:11px;color:#3f5a52}
.cnc-machine .rack-notes{list-style:none;margin:2px 0;padding:0;font-size:11px}.cnc-machine .rack-notes .warning{color:#7a5a10}.cnc-machine .rack-notes .error{color:#8d2b19;font-weight:700}
.cnc-machine .rack-list button{font-size:11px;padding:4px 8px}
.cnc-machine .cnc-facts{margin:6px 0;font-size:11px}.cnc-machine .cnc-facts div{display:grid;grid-template-columns:96px 1fr;gap:6px;padding:4px 0}.cnc-machine .cnc-facts dd{font-weight:500}
.cnc-machine .cnc-issues{list-style:none;margin:4px 0;padding:0;font-size:11px}.cnc-machine .cnc-issues li{padding:2px 0}.cnc-machine .cnc-issues button{width:100%;padding:3px;border:0;text-align:left;font-size:11px;color:#8d2b19}
.cnc-machine .cnc-issues .warning{color:#7a5a10}.cnc-machine .cnc-issues .info{color:#60746a}.cnc-machine .cnc-issues .error{color:#8d2b19}
.cnc-machine .cnc-ready{color:#2e7d5b;font-weight:700;font-size:11px}.cnc-machine .cnc-blocked{color:#8d2b19;font-weight:700;font-size:11px}
</style>
