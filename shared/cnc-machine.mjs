// The CNC machine: runs an NC program, exactly as exported by cam-export.mjs, on
// a simulated 3-axis gantry router (CncMachine.vue draws and drives it).
//
//   loadProgram   reads the program text in any of the posts' dialects (ISO
//                 G-code of GRBL, LinuxCNC, Mach, Fanuc and Sinumerik, and
//                 Heidenhain Klartext) into a timeline of machine motion: rapid
//                 and feed moves (arcs as short lines), dwells, program stops
//                 and tool changes, each tied to its program line and timed at
//                 100 % feed. M6 / TOOL CALL fetch the tool from the rack at
//                 the back of the table (an automatic tool changer); GRBL's
//                 "M0 (Fit T…)" is a manual change while the program waits.
//   advance       moves a run forward by machine seconds, with feed override,
//                 single block, program stops and alarms.
//   createStock / cutStock
//                 the blank as a height field that a flat-bottomed round tool
//                 lowers as it moves (material removal).
//   checkProgram  a full dry pass of the program over the blank: alarms
//                 (a rapid move into the material, cutting with the spindle
//                 stopped or without a tool, leaving the machine's travel) and
//                 the job's figures.
//   CUTTERS, recommendTool, toolNotes
//                 a rack of real router cutters and drills with speeds and
//                 feeds from the chip load for the panel's material.
//
// Millimetres and seconds. Work coordinates are the program's: X along the
// panel's length (u), Y across its width (v), Z0 on the top of the blank and
// negative into it; work zero (G54) is the part's corner.
import {arcPoints} from './cam-export.mjs';
import {MATERIALS} from './materials.mjs';

export const MACHINE=Object.freeze({
  label:'2513 gantry router · 3 axes · tool rack',
  travel:Object.freeze({x:2500,y:1300}),  // machine X/Y from the front-left corner of the table
  stops:Object.freeze({x:40,y:40}),       // the blank's corner rests against the pop-up stops here
  zTop:100,                               // the tool tip's highest position above work Z0
  rapidXY:15000,rapidZ:6000,              // mm/min
  rack:Object.freeze({x:160,pitch:110,y:1285,z:40,pockets:20}),  // pockets along the back edge
  spoilboard:19,
});
const EPS=1e-9;

// ---- Setup: where the job lies on the machine
// A program that cuts the part free (a profile) starts from a blank `margin`
// larger than the part on every side, so the holding tabs have something to
// hold on to; any other program machines the panel itself, already cut to
// size (face B programs: the cut-out part turned over), against the stops.
export function jobSetup(program,{margin=20}={}) {
  const {lengthMm:L,widthMm:W,thicknessMm:T}=program.sheet,cutOut=program.blocks.some(b=>b.operation==='profile'),m=cutOut?margin:0;
  return {length:L,width:W,thickness:T,margin:m,cutOut,material:program.material,
    blank:{x0:-m,y0:-m,x1:L+m,y1:W+m},
    offset:{x:MACHINE.stops.x+m,y:MACHINE.stops.y+m}};  // machine position of work zero
}
export const toMachine=(setup,p)=>({x:p.x+setup.offset.x,y:p.y+setup.offset.y,z:p.z});
// The park position (home: back right, clear of the table for loading) and the
// rack pocket of tool n, in work coordinates.
export const homePosition=setup=>({x:MACHINE.travel.x-setup.offset.x,y:MACHINE.travel.y-setup.offset.y,z:MACHINE.zTop});
export function pocketPosition(setup,n) {
  const r=MACHINE.rack;
  return {x:r.x+((Math.max(1,n)-1)%r.pockets)*r.pitch-setup.offset.x,y:r.y-setup.offset.y,z:r.z};
}

// ---- Reading programs
const WORD=/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
const rapidTime=(a,b)=>Math.max(Math.hypot(b.x-a.x,b.y-a.y)/MACHINE.rapidXY,Math.abs(b.z-a.z)/MACHINE.rapidZ)*60;
// Dwell words: seconds, or milliseconds where the control reads them so.
const dwellSeconds=(post,dwellMs,value)=>post==='fanuc'||post==='mach'&&dwellMs?value/1000:value;

// Timeline segments: {line, kind, a, b, duration, t0, feed, tool, spindle, rpm,
// message?}. `kind` is rapid, feed, dwell, stop or change (tool change motion);
// `tool` is the tool in the spindle during the segment (0 for none).
export function loadProgram(text,{post='grbl',dwellMs=false,setup}) {
  const lines=String(text).replace(/\r/g,'').split('\n');
  if(lines.at(-1)==='') lines.pop();
  const st={pos:homePosition(setup),motion:0,feed:0,scale:1,tool:0,next:0,spindle:false,rpm:0,centre:null,comment:'',ended:false};
  const segments=[],warnings=[];let changes=0;
  const push=(line,kind,b,duration,extra={})=>{segments.push({line,kind,a:st.pos,b,duration,feed:0,tool:st.tool,spindle:st.spindle,rpm:st.rpm,...extra});st.pos=b;};
  const rapid=(line,to,kind='rapid')=>push(line,kind,to,rapidTime(st.pos,to));
  const feedTo=(line,to,extra)=>{
    if(!(st.feed>0)) throw Error(`Line ${line+1}: a feed move without a feed rate`);
    push(line,'feed',to,Math.hypot(to.x-st.pos.x,to.y-st.pos.y,to.z-st.pos.z)/st.feed*60,{feed:st.feed,...extra});
  };
  const dwell=(line,seconds,extra)=>push(line,'dwell',st.pos,Math.max(0,seconds),extra);
  // An automatic tool change: up, return the tool to its pocket, fetch the next.
  function change(line,n) {
    if(n===st.tool) return;
    changes++;st.spindle=false;
    rapid(line,{...st.pos,z:MACHINE.zTop},'change');
    for(const [tool,after] of [[st.tool,0],[n,n]]) {
      if(!tool) continue;
      const p=pocketPosition(setup,tool);
      rapid(line,{x:p.x,y:p.y,z:MACHINE.zTop},'change');rapid(line,p,'change');
      push(line,'change',p,.8);st.tool=after;
      rapid(line,{...p,z:MACHINE.zTop},'change');
    }
  }
  const stop=(line,message)=>{
    const fit=message.match(/\bfit T(\d+)/i);
    push(line,'stop',st.pos,0,{message:message||'Program stop'});
    if(fit) {st.tool=Number(fit[1]);changes++;}
  };
  function move(line,g,words) {
    const to={x:words.X!==undefined?words.X*st.scale:st.pos.x,y:words.Y!==undefined?words.Y*st.scale:st.pos.y,z:words.Z!==undefined?words.Z*st.scale:st.pos.z};
    if(g===0) rapid(line,to);
    else if(g===1) feedTo(line,to);
    else {
      const from=st.pos;
      for(const p of arcPoints(from,{g,...to,i:(words.I??0)*st.scale,j:(words.J??0)*st.scale})) feedTo(line,{x:p.x,y:p.y,z:p.z},{arc:true});
    }
  }
  const heidenhain=/BEGIN PGM/.test(lines[0]??'');
  lines.forEach((raw,line)=>{
    if(st.ended) return;
    if(heidenhain) {heidenhainBlock(line,raw);return;}
    const comments=[];
    let code=raw.replace(/\(([^)]*)\)/g,(_,c)=>{comments.push(c.trim());return ' ';});
    const semi=code.indexOf(';');if(semi>=0) {comments.push(code.slice(semi+1).trim());code=code.slice(0,semi);}
    code=code.trim().toUpperCase();
    if(!code||code==='%'||/^O\d+/.test(code)) {if(comments.length) st.comment=comments.join(' ');return;}
    const words={},gs=[],ms=[];
    for(const [,letter,value] of code.matchAll(WORD)) {
      const v=Number(value);
      if(letter==='G') gs.push(v);else if(letter==='M') ms.push(v);else words[letter]=v;
    }
    if(gs.includes(91)) throw Error(`Line ${line+1}: incremental moves (G91) are not simulated`);
    if(gs.some(g=>g===20||g===70)) st.scale=25.4;
    if(gs.some(g=>g===21||g===71)) st.scale=1;
    const dwelling=gs.includes(4);
    if(words.F!==undefined&&!dwelling) st.feed=words.F*st.scale;
    if(words.S!==undefined) st.rpm=words.S;
    if(words.T!==undefined) st.next=words.T;
    if(ms.includes(6)) change(line,st.next);
    if(ms.includes(3)) st.spindle=true;
    if(dwelling) dwell(line,words.P!==undefined?dwellSeconds(post,dwellMs,words.P):words.F??0);
    const motion=gs.find(g=>g>=0&&g<=3);
    if(motion!==undefined) st.motion=motion;
    if(!dwelling&&['X','Y','Z'].some(k=>words[k]!==undefined)) move(line,st.motion,words);
    if(ms.includes(5)) st.spindle=false;
    if(ms.includes(0)||ms.includes(1)) stop(line,comments.join(' ')||st.comment);
    if(ms.includes(2)||ms.includes(30)) {st.spindle=false;st.ended=true;}
  });
  function heidenhainBlock(line,raw) {
    const code=raw.replace(/^\s*\d+\s*/,'').trim();
    if(code.startsWith(';')) {st.comment=code.slice(1).trim();return;}
    if(/^BEGIN PGM/.test(code)) {st.scale=/\bINCH\b/.test(code)?25.4:1;return;}
    if(/^END PGM/.test(code)) {st.ended=true;return;}
    if(/^TOOL CALL/.test(code)) {
      const n=Number(code.match(/TOOL CALL\s+(\d+)/)?.[1]??0),s=code.match(/\bS(\d+(?:\.\d+)?)/);
      if(s) st.rpm=Number(s[1]);
      change(line,n);return;
    }
    if(/^CYCL DEF 9\.1/.test(code)) {dwell(line,Number(code.match(/DWELL\s*([\d.]+)/)?.[1]??0));return;}
    if(code==='STOP'||/^STOP\b/.test(code)) {stop(line,st.comment);return;}
    const words={},ms=[];
    for(const [,letter,value] of code.matchAll(WORD)) {if(letter==='M') ms.push(Number(value));else words[letter]=Number(value);}
    if(/^CC\b/.test(code)) {st.centre={x:(words.X??0)*st.scale,y:(words.Y??0)*st.scale};return;}
    if(!/^(L|C)\b/.test(code)) return;
    if(ms.includes(3)) st.spindle=true;
    if(!/\bFMAX\b/.test(code)&&words.F!==undefined) st.feed=words.F*st.scale;
    if(/^L\b/.test(code)) {
      if(['X','Y','Z'].some(k=>words[k]!==undefined)) move(line,/\bFMAX\b/.test(code)?0:1,words);
    } else {
      if(!st.centre) throw Error(`Line ${line+1}: a circle without a centre (CC)`);
      const g=/DR\+/.test(code)?3:2,c=st.centre;
      move(line,g,{X:words.X,Y:words.Y,I:(c.x-st.pos.x)/st.scale,J:(c.y-st.pos.y)/st.scale});
    }
    if(ms.includes(5)) st.spindle=false;
    if(ms.includes(30)||ms.includes(2)) {st.spindle=false;st.ended=true;}
  }
  if(!st.ended) warnings.push('The program does not end with M30 / END PGM');
  // Start times (at 100 % feed) and the feed / other time before each segment,
  // so run times follow the feed override.
  let t=0,feedBefore=0,otherBefore=0;
  for(const s of segments) {s.t0=t;s.feedBefore=feedBefore;s.otherBefore=otherBefore;t+=s.duration;if(s.kind==='feed') feedBefore+=s.duration;else otherBefore+=s.duration;}
  return {lines,segments,warnings,toolChanges:changes,duration:t,feedTime:feedBefore,otherTime:otherBefore,start:homePosition(setup)};
}

// ---- Running
// A clock is {index, elapsed}: the current segment and the program seconds
// (at 100 % feed) into it. Feed moves run at `override` (0.1–2); rapids,
// dwells and tool changes at full speed, as on a real control.
export const runTime=(run,override=1)=>run.feedTime/override+run.otherTime;
export function clockTime(run,clock,override=1) {
  const s=run.segments[clock.index];
  if(!s) return runTime(run,override);
  return s.feedBefore/override+s.otherBefore+clock.elapsed/(s.kind==='feed'?override:1);
}
export function positionAt(run,clock) {
  const s=run.segments[clock.index];
  if(!s) return run.segments.at(-1)?.b??run.start;
  const t=s.duration>EPS?Math.min(1,clock.elapsed/s.duration):0;
  return {x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t,z:s.a.z+(s.b.z-s.a.z)*t};
}
// Moves the clock forward by `seconds` of machine time. Stops early at a
// program stop (passing it: Cycle start continues), at an alarm (before the
// offending move; `pass` lets one alarm through once it is cleared), at the end
// of a line in single block mode, and at the end of the program.
// Returns {clock, used (machine seconds), event: null | {type, index}}.
export function advance(run,clock,seconds,{override=1,singleBlock=false,alarms=null,pass=-1}={}) {
  const segs=run.segments;let {index,elapsed}=clock,left=seconds,used=0;
  const at=(type,i)=>({clock:{index,elapsed},used,event:{type,index:i}});
  while(index<segs.length) {
    const s=segs[index];
    if(elapsed===0) {
      if(alarms?.has(index)&&index!==pass) return at('alarm',index);
      if(s.kind==='stop') {index++;return at('stop',index-1);}
    }
    const rate=s.kind==='feed'?override:1,need=(s.duration-elapsed)/rate;
    if(left+EPS<need) {elapsed+=left*rate;used+=left;return {clock:{index,elapsed},used,event:null};}
    left-=need;used+=need;index++;elapsed=0;
    if(singleBlock&&index<segs.length&&segs[index].line!==s.line&&segs[index].kind!=='stop') return at('block',index);
  }
  return at('end',segs.length);
}
// The clock `seconds` (at 100 % feed) into the run.
export function clockAtTime(run,seconds) {
  const segs=run.segments;let lo=0,hi=segs.length;
  while(lo<hi) {const mid=(lo+hi)>>1;if(segs[mid].t0+segs[mid].duration<=seconds) lo=mid+1;else hi=mid;}
  if(lo>=segs.length) return {index:segs.length,elapsed:0};
  return {index:lo,elapsed:Math.min(segs[lo].duration,Math.max(0,seconds-segs[lo].t0))};
}
// The job as a timeline (times at 100 % feed): runs of one tool (`cut`, rapids
// included), tool changes (`change`) and program stops (`stop`, no duration).
export function runBlocks(run) {
  const blocks=[];
  run.segments.forEach((s,index)=>{
    const kind=s.kind==='stop'?'stop':s.kind==='change'?'change':'cut',last=blocks.at(-1);
    if(kind!=='stop'&&last&&last.kind===kind&&last.tool===(kind==='cut'?s.tool:last.tool)) {last.t1=s.t0+s.duration;last.last=index;return;}
    blocks.push({kind,tool:kind==='cut'?s.tool:0,t0:s.t0,t1:s.t0+s.duration,first:index,last:index,...(kind==='stop'?{message:s.message}:{})});
  });
  return blocks;
}
// The clock at the start of program line `line` (or the next line that moves).
export function clockAtLine(run,line) {
  const index=run.segments.findIndex(s=>s.line>=line);
  return {index:index<0?run.segments.length:index,elapsed:0};
}

// ---- The blank: a height field of the top surface (0 = untouched, -thickness
// = through). Vertices on a grid of about `maxPoints` points.
export function createStock(setup,{maxPoints=200000}={}) {
  const {x0,y0,x1,y1}=setup.blank,L=x1-x0,W=y1-y0,cell=Math.max(.5,Math.sqrt(L*W/maxPoints));
  const nx=Math.max(2,Math.ceil(L/cell)),ny=Math.max(2,Math.ceil(W/cell));
  return {x0,y0,nx,ny,cx:L/nx,cy:W/ny,thickness:setup.thickness,heights:new Float32Array((nx+1)*(ny+1))};
}
export const resetStock=stock=>{stock.heights.fill(0);return stock;};
// Lowers the stock under a flat-bottomed round tool (its tip moving from a to
// b). With `probe`, only reports whether it would cut. Returns {touched
// (cuts deeper than `tolerance` into material), removed (mm³ of the blank),
// dirty: null | [i0, i1, j0, j1] (vertex ranges changed)}.
export function cutStock(stock,a,b,radius,{probe=false,tolerance=.05}={}) {
  const out={touched:false,removed:0,dirty:null};
  if(Math.min(a.z,b.z)>=0) return out;
  const {x0,y0,nx,ny,cx,cy,heights:h,thickness:T}=stock,r=Math.max(radius,0),r2=r*r,area=cx*cy;
  const stamp=(x,y,z)=>{
    if(z>=0) return;
    let i0=Math.max(0,Math.ceil((x-r-x0)/cx-EPS)),i1=Math.min(nx,Math.floor((x+r-x0)/cx+EPS)),j0=Math.max(0,Math.ceil((y-r-y0)/cy-EPS)),j1=Math.min(ny,Math.floor((y+r-y0)/cy+EPS));
    // A tool finer than the grid still marks its nearest point.
    const nearest=i0>i1||j0>j1;
    if(nearest) {const i=Math.round((x-x0)/cx),j=Math.round((y-y0)/cy);if(i<0||i>nx||j<0||j>ny) return;i0=i1=i;j0=j1=j;}
    for(let j=j0;j<=j1;j++) {
      const dy=y0+j*cy-y,row=j*(nx+1);
      for(let i=i0;i<=i1;i++) {
        const dx=x0+i*cx-x;
        if(!nearest&&dx*dx+dy*dy>r2) continue;
        const k=row+i,current=h[k];
        if(current<=z+1e-6) continue;
        // Skimming a surface already cut (within the tolerance) is not touching material.
        if(current>z+tolerance) out.touched=true;
        if(probe) continue;
        out.removed+=Math.max(0,Math.min(current,0)-Math.max(z,-T))*area;h[k]=z;
        const d=out.dirty??(out.dirty=[i,i,j,j]);
        if(i<d[0]) d[0]=i;if(i>d[1]) d[1]=i;if(j<d[2]) d[2]=j;if(j>d[3]) d[3]=j;
      }
    }
  };
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<1e-6) {stamp(b.x,b.y,Math.min(a.z,b.z));return out;}
  const n=Math.max(1,Math.ceil(length/(Math.min(cx,cy)/2)));
  for(let k=0;k<=n;k++) {const t=k/n;stamp(a.x+dx*t,a.y+dy*t,a.z+(b.z-a.z)*t);}
  return out;
}
export const heightAt=(stock,x,y)=>{
  const i=Math.round((x-stock.x0)/stock.cx),j=Math.round((y-stock.y0)/stock.cy);
  return i<0||i>stock.nx||j<0||j>stock.ny?null:stock.heights[j*(stock.nx+1)+i];
};

// ---- Checking a program (a full pass over a fresh blank, as a simulator does)
const ALARMS={
  rapid:'rapid move (G0) into the material',
  spindle:'cutting with the spindle stopped',
  tool:'cutting with no tool in the spindle',
};
// `radiusOf(n)`: the radius of tool n. Returns {alarms: [{index, line, code,
// message}], removed (cm³), cutLength and rapidLength (m), stock}.
export function checkProgram(run,setup,radiusOf,{maxPoints=200000}={}) {
  const stock=createStock(setup,{maxPoints}),alarms=[],beyond={x:null,y:null};
  let removed=0,cut=0,rapidLength=0;
  const alarm=(index,code,message)=>{if(alarms.length<50) alarms.push({index,line:run.segments[index].line,code,message:`Line ${run.segments[index].line+1}: ${message}`});return alarms.at(-1);};
  run.segments.forEach((s,index)=>{
    const m=toMachine(setup,s.b);
    // Soft limits: one alarm per axis, at the first move past it, with the count of the others.
    let outside=false;
    for(const [axis,limit] of [['x',MACHINE.travel.x],['y',MACHINE.travel.y]]) if(m[axis]<-EPS||m[axis]>limit+EPS) {
      outside=true;
      if(beyond[axis]) beyond[axis].more++;else beyond[axis]={alarm:alarm(index,'travel',`beyond the machine's ${axis.toUpperCase()} travel (0–${limit} mm)`),more:0};
    }
    if(outside) return;
    if(s.kind==='dwell'||s.kind==='stop') return;
    const length=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y,s.b.z-s.a.z),radius=s.tool?radiusOf(s.tool):1.5;
    if(s.kind!=='feed') {rapidLength+=length;if(cutStock(stock,s.a,s.b,radius,{probe:true}).touched) alarm(index,'rapid',ALARMS.rapid);return;}
    const result=cutStock(stock,s.a,s.b,radius,{probe:!s.tool||!s.spindle});
    if(result.touched) {cut+=length;if(!s.tool) alarm(index,'tool',ALARMS.tool);else if(!s.spindle) alarm(index,'spindle',ALARMS.spindle);}
    removed+=result.removed;
  });
  for(const b of Object.values(beyond)) if(b?.more&&b.alarm) b.alarm.message+=` and ${b.more} more move${b.more===1?'':'s'}`;
  return {alarms,removed:removed/1000,cutLength:cut/1000,rapidLength:rapidLength/1000,stock};
}

// ---- Cutters: a rack of common router cutters and drills for furniture work.
// `reach` is the flute length (the deepest cut); `kind` drill, upcut, downcut,
// compression or straight. Drills only drill holes of their own size; end
// mills also bore larger holes helically, clear pockets and cut profiles.
const cutter=(id,kind,diameter,flutes,reach,label,use)=>Object.freeze({id,kind,diameter,flutes,reach,label,use});
export const CUTTERS=Object.freeze([
  cutter('drill-3','drill',3,2,20,'Ø3 drill bit','pilot holes'),
  cutter('drill-5','drill',5,2,30,'Ø5 dowel drill','shelf pins, 32 mm system'),
  cutter('drill-8','drill',8,2,35,'Ø8 dowel drill','dowels'),
  cutter('drill-10','drill',10,2,35,'Ø10 dowel drill','dowels, connectors'),
  cutter('drill-15','drill',15,2,20,'Ø15 connector bit','cam connectors'),
  cutter('drill-35','drill',35,2,15,'Ø35 hinge boring bit','hinge cups'),
  cutter('upcut-3','upcut',3,1,12,'Ø3 single-flute upcut','small holes and slots, clears chips'),
  cutter('upcut-6','upcut',6,2,22,'Ø6 2-flute upcut spiral','pockets, clears chips upward'),
  cutter('downcut-6','downcut',6,2,22,'Ø6 2-flute downcut spiral','grooves, clean top edge'),
  cutter('compression-6','compression',6,2,22,'Ø6 compression spiral','profiles, clean on both faces'),
  cutter('compression-8','compression',8,2,28,'Ø8 compression spiral','profiles in laminated board'),
  cutter('straight-10','straight',10,2,30,'Ø10 2-flute straight','grooves and rebates'),
  cutter('compression-12','compression',12,3,35,'Ø12 3-flute compression','fast nesting profiles'),
]);
export const CUTTER_KINDS=Object.freeze({drill:'drill',upcut:'upcut spiral',downcut:'downcut spiral',compression:'compression spiral',straight:'straight'});
export const customCutter=diameter=>Object.freeze({id:'custom',kind:'upcut',diameter,flutes:2,reach:Math.max(8,Math.round(diameter*3)),label:`Ø${diameter} end mill`,use:'the diameter set under CAM settings'});
// Cutters that can do a layer's operation: drills on drill layers, end mills anywhere.
export const cuttersFor=operation=>CUTTERS.filter(c=>c.kind!=='drill'||operation==='drill');
const PREFERRED={drill:['drill','upcut','compression'],groove:['downcut','straight','upcut','compression'],pocket:['upcut','downcut','straight','compression'],profile:['compression','upcut','straight','downcut']};
// The cutter that fits a layer's tool: `chosen` (a cutter id) if it has the
// tool's diameter, else the usual cutter of that size for the operation.
export function mountedCutter(operation,diameter,chosen=null) {
  const fits=c=>Math.abs(c.diameter-diameter)<1e-6&&(c.kind!=='drill'||operation==='drill');
  const pick=CUTTERS.find(c=>c.id===chosen&&fits(c));
  if(pick) return pick;
  for(const kind of PREFERRED[operation]??PREFERRED.pocket) {const c=CUTTERS.find(c=>c.kind===kind&&fits(c));if(c) return c;}
  return customCutter(diameter);
}
// Chip load (mm per tooth) at a 6 mm cutter, by material group; smaller
// cutters take less, larger more.
const CHIP={softwood:.2,hardwood:.13,board:.17,plywood:.15,aluminium:.04,metal:.02};
export function materialGroup(material) {
  const m=MATERIALS[material];
  if(!m) return 'board';
  if(m.category==='metal') return material==='aluminium'?'aluminium':'metal';
  if(m.form==='solid') return material==='pine'?'softwood':'hardwood';
  return m.form==='plywood'?'plywood':'board';
}
export const chipLoadTarget=(c,material)=>CHIP[materialGroup(material)]*Math.min(2,Math.max(.45,(c.diameter/6)**.7));
const round50=v=>Math.max(50,Math.round(v/50)*50);
// Speeds and feeds for a cutter in a material (valid layer tool settings).
export function recommendTool(c,material) {
  const group=materialGroup(material),metal=group==='aluminium'||group==='metal';
  if(c.kind==='drill') {
    const rpm=c.diameter>=20?3000:c.diameter>=12?4500:6000,plunge=Math.min(5000,round50(rpm*(metal?.05:c.diameter>=20?.12:.2)));
    return {diameter:c.diameter,rpm,feed:plunge,plunge,stepdown:Math.min(c.reach,Math.max(2,c.diameter*2))};
  }
  const rpm=metal?16000:c.diameter<=4?22000:c.diameter>=10?16000:18000;
  const feed=Math.min(20000,round50(rpm*c.flutes*chipLoadTarget(c,material)));
  const stepdown=Math.round(Math.min(c.reach-2,c.diameter*(metal?.25:1))*10)/10;
  return {diameter:c.diameter,rpm,feed,plunge:round50(feed*(c.kind==='upcut'?.35:.25)),stepdown};
}
export const chipLoad=(tool,c)=>tool.rpm>0?tool.feed/(tool.rpm*c.flutes):Infinity;
// Workshop notes on a layer tool with its cutter: {severity, message}.
// `depth` is the deepest cut the program asks of it; `bores` whether it must
// bore holes larger than itself.
export function toolNotes(tool,c,material,{depth=0,bores=false}={}) {
  const notes=[],group=materialGroup(material);
  if(group==='metal') notes.push({severity:'error',message:`${MATERIALS[material]?.label??material} is not machined on a wood router`});
  if(!(tool.rpm>0)) notes.push({severity:'error',message:'Spindle speed is 0 rpm'});
  if(c.kind==='drill') {
    if(bores) notes.push({severity:'error',message:`A drill bit cannot bore holes larger than Ø${c.diameter}; fit an end mill`});
  } else if(tool.rpm>0) {
    const load=chipLoad(tool,c),target=chipLoadTarget(c,material);
    if(load<target*.45) notes.push({severity:'warning',message:`Chip load ${load.toFixed(3)} mm/tooth is low: the cutter rubs, burns the wood and dulls; raise the feed or lower the speed`});
    else if(load>target*2) notes.push({severity:'warning',message:`Chip load ${load.toFixed(3)} mm/tooth is high: the cutter may break; lower the feed`});
  }
  if(depth>c.reach+EPS) notes.push({severity:'error',message:`The program cuts ${Math.round(depth*10)/10} mm deep; the flutes reach ${c.reach} mm`});
  if(tool.stepdown>c.reach+EPS) notes.push({severity:'warning',message:`Step-down ${tool.stepdown} mm is deeper than the ${c.reach} mm flutes`});
  else if(c.kind!=='drill'&&tool.stepdown>c.diameter*(group==='aluminium'?.5:1.5)+EPS) notes.push({severity:'warning',message:`Step-down ${tool.stepdown} mm is more than ${group==='aluminium'?'half':'1.5 ×'} the diameter: heavy load on a Ø${c.diameter} cutter`});
  return notes;
}
// m:ss or h:mm:ss.
export function clockText(seconds) {
  const s=Math.max(0,Math.round(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');
  return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`;
}
