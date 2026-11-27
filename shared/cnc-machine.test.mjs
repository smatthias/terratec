import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as D from './furniture-design-edit.mjs';
import {camPlan,POSTS} from './design-cam.mjs';
import {partProgram} from './cam-export.mjs';
import * as M from './cnc-machine.mjs';
const ids=p=>{let n=0;return ()=>p+(++n);};
const box=()=>D.createDesign({id:'box',name:'Box',template:'box',makeId:ids('b')});
const byName=(design,name)=>design.parts.find(p=>p.name===name);
// The blank's heights are single precision.
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-4,`${message??''} ${a} ≉ ${b}`);
// Loads the program of one panel face as the machine does, with its setup and tool radii.
function machine(design,partId,face='A',options={}) {
  const plan=camPlan(design),program=plan.programs.find(p=>p.partId===partId&&p.face===face),setup=M.jobSetup(program,options);
  const run=M.loadProgram(partProgram(design,partId,face),{post:plan.cam.post,dwellMs:plan.cam.dwellMs,setup});
  const radius=n=>plan.tools.find(t=>t.number===n).diameter/2;
  return {plan,program,setup,run,radius,check:M.checkProgram(run,setup,radius)};
}

test('every post, unit and arc setting runs the same program: identical cuts and no alarms',()=>{
  const design=box(),left=byName(design,'Left side'),reference=machine(design,left.id);
  const h=(x,y)=>M.heightAt(reference.check.stock,x,y);
  near(h(60,346),-12,'shelf-pin hole');near(h(13,360),-10,'back panel groove');
  near(h(-3,360),-18.3,'profile through the panel and 0.3 mm into the spoilboard');assert.equal(h(280,300),0,'untouched face');
  assert.equal(reference.run.toolChanges,3);assert.deepEqual(reference.run.warnings,[]);
  for(const post of Object.keys(POSTS)) for(const units of ['mm','inch']) for(const arcs of ['native','lines']) {
    const other=machine(D.updateCam(design,{post,units,arcs}),left.id);
    assert.deepEqual(other.check.alarms,[],`${post} ${units} ${arcs}: no alarms`);
    // Inch programs round to 0.0001 in (0.0025 mm): a few grid points right on the tool's edge may differ.
    const differ=other.check.stock.heights.filter((v,i)=>Math.abs(v-reference.check.stock.heights[i])>1e-3).length;
    assert.ok(units==='mm'?differ===0:differ<reference.check.stock.heights.length/1000,`${post} ${units} ${arcs}: same cuts (${differ} points differ)`);
    assert.ok(Math.abs(other.run.feedTime-reference.run.feedTime)<.5,`${post} ${units} ${arcs}: same feed time`);
  }
});

test('helical bores and pockets are cut from arcs, with the blank margin round a profiled part',()=>{
  let design=box();const left=byName(design,'Left side');
  const hole=D.addFeature(design,left.id,'drill',()=>'hole');design=D.updateFeature(hole.design,'hole',{u:200,v:200,diameter:12,depth:10});
  const pocket=D.addFeature(design,left.id,'pocket',()=>'pocket');design=D.updateFeature(pocket.design,'pocket',{u:300,v:420,length:80,width:40,depth:6});
  const m=machine(design,left.id);
  assert.deepEqual(m.check.alarms,[]);
  assert.ok(m.run.segments.some(s=>s.arc),'the Ø12 hole is bored helically with the Ø5 tool');
  const h=(x,y)=>M.heightAt(m.check.stock,x,y);
  assert.equal(h(200,200),-10);assert.equal(h(204,200),-10,'the bore is wider than the tool');
  assert.equal(h(340,440),-6);assert.equal(h(303.5,423.5),-6,'pocket corner within the tool radius');
  assert.deepEqual([m.setup.margin,m.setup.blank.x0,m.setup.blank.x1,m.setup.offset.x],[20,-20,580,60]);
  const wide=machine(design,left.id,'A',{margin:40});assert.equal(wide.setup.blank.y1,760);
});

test('holding tabs stay at the tab height on the profile; a face B program machines the cut-out panel',()=>{
  const design=box(),left=byName(design,'Left side'),m=machine(design,left.id),{stock}=m.check;
  // Walk the tool-centre loop of the profile and collect the heights under it.
  const r=3,loop=[[-r,-r],[-r,720+r],[560+r,720+r],[560+r,-r],[-r,-r]],heights=[];
  for(let k=0;k<4;k++) {const [x0,y0]=loop[k],[x1,y1]=loop[k+1],n=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let s=0;s<n;s++) heights.push(M.heightAt(stock,x0+(x1-x0)*s/n,y0+(y1-y0)*s/n));}
  const tabs=heights.filter((h,i)=>h>-16&&!(heights[i-1]>-16)).length;
  assert.equal(tabs,4,'four tabs');assert.ok(heights.every(h=>Math.abs(h+18.3)<1e-4||Math.abs(h+15)<1e-4),'tabs are 3 mm high');
  const right=byName(design,'Right side'),b=machine(design,right.id,'B');
  assert.deepEqual([b.setup.cutOut,b.setup.margin,b.setup.blank.x1],[false,0,560]);
  assert.deepEqual(b.check.alarms,[]);
});

test('automatic tool changes visit the rack; GRBL waits for a manual change',()=>{
  const design=D.updateCam(box(),{post:'linuxcnc'}),left=byName(design,'Left side'),{run,setup}=machine(design,left.id);
  const changes=run.segments.filter(s=>s.kind==='change');
  assert.ok(changes.every(s=>Math.abs(s.b.z-M.MACHINE.zTop)<1e-9||Math.abs(s.b.y-M.pocketPosition(setup,1).y)<1e-9));
  // The tool in the spindle while cutting is the tool of the block: T1 drills, T2 grooves, T4 profiles.
  const cutting=[...new Set(run.segments.filter(s=>s.kind==='feed').map(s=>s.tool))];
  assert.deepEqual(cutting,[1,2,4]);
  const pocket4=M.pocketPosition(setup,4);
  assert.ok(changes.some(s=>s.duration===.8&&s.b.x===pocket4.x),'T4 fetched from pocket 4');
  assert.equal(M.toMachine(setup,pocket4).x,M.MACHINE.rack.x+3*M.MACHINE.rack.pitch);
  const grbl=machine(box(),left.id).run,stops=grbl.segments.filter(s=>s.kind==='stop');
  assert.deepEqual(stops.map(s=>s.message.match(/Fit (T\d)/)[1]),['T1','T2','T4']);
  assert.equal(grbl.segments.filter(s=>s.kind==='change').length,0);
  const afterFirst=grbl.segments[grbl.segments.indexOf(stops[0])+1];assert.equal(afterFirst.tool,1);
  assert.equal(stops[0].tool,0,'no tool until it is fitted');
});

test('the run clock follows feed override, program stops, single block and alarms',()=>{
  const design=box(),left=byName(design,'Left side'),{run}=machine(design,left.id);
  assert.ok(Math.abs(M.runTime(run,1)-run.duration)<1e-9);
  assert.ok(Math.abs(M.runTime(run,2)-(run.feedTime/2+run.otherTime))<1e-9);
  // From the start, the first event is the M0 for T1.
  let step=M.advance(run,{index:0,elapsed:0},1e6);
  assert.equal(step.event.type,'stop');assert.match(run.segments[step.event.index].message,/Fit T1/);
  const resumed=M.advance(run,step.clock,1e6);assert.equal(resumed.event.type,'stop','the next tool change');
  // Machine time at 50 % feed: feed moves take twice as long.
  const firstFeed=run.segments.findIndex(s=>s.kind==='feed'),s=run.segments[firstFeed];
  const half=M.advance(run,{index:firstFeed,elapsed:0},s.duration,{override:.5});
  assert.equal(half.clock.index,firstFeed);assert.ok(Math.abs(half.clock.elapsed-s.duration/2)<1e-9);
  assert.ok(Math.abs(M.clockTime(run,half.clock,.5)-(s.feedBefore/.5+s.otherBefore+s.duration))<1e-9);
  // Single block: stops at the start of the next line.
  const block=M.advance(run,{index:firstFeed,elapsed:0},1e6,{singleBlock:true});
  assert.equal(block.event.type,'block');assert.notEqual(run.segments[block.clock.index].line,s.line);assert.equal(run.segments[block.clock.index-1].line,s.line);
  // Alarms stop before the move until passed.
  const alarms=new Set([firstFeed+2]),held=M.advance(run,{index:firstFeed,elapsed:0},1e6,{alarms});
  assert.deepEqual([held.event.type,held.clock.index],['alarm',firstFeed+2]);
  assert.notEqual(M.advance(run,held.clock,1e6,{alarms,pass:firstFeed+2}).event.type,'alarm');
  assert.deepEqual(M.clockAtLine(run,s.line),{index:firstFeed,elapsed:0});
  const end=M.advance(run,{index:run.segments.length-3,elapsed:0},1e6);assert.equal(end.event.type,'end');
  assert.deepEqual(M.positionAt(run,{index:run.segments.length,elapsed:0}),run.segments.at(-1).b);
  assert.equal(M.clockText(75),'1:15');assert.equal(M.clockText(3725),'1:02:05');
});

test('the check raises alarms for crashes, a stopped spindle, a missing tool and leaving the travel',()=>{
  const setup=M.jobSetup({sheet:{lengthMm:400,widthMm:300,thicknessMm:18},blocks:[{operation:'profile'}],material:'Birch plywood'});
  const run=text=>{const r=M.loadProgram(text,{post:'linuxcnc',setup});return M.checkProgram(r,setup,()=>3).alarms.map(a=>a.code+'@'+a.message.match(/^Line (\d+)/)[1]);};
  assert.deepEqual(run('G21 G90\nT1 M6\nS18000 M3\nG0 X50 Y50 Z5\nG0 Z-5\nM30\n'),['rapid@5']);
  assert.deepEqual(run('G21 G90\nT1 M6\nG0 X50 Y50 Z5\nG1 Z-5 F500\nM30\n'),['spindle@4']);
  assert.deepEqual(run('G21 G90\nM3 S18000\nG0 X50 Y50 Z5\nG1 Z-5 F500\nM30\n'),['tool@4']);
  assert.deepEqual(run('G21 G90\nT1 M6\nS18000 M3\nG0 X2600 Y50 Z5\nM30\n'),['travel@4']);
  // A soft limit alarms once per axis, at the first move past it.
  const travel=M.checkProgram(M.loadProgram('G21 G90\nT1 M6\nS18000 M3\nG0 X2600 Y50 Z5\nG0 X2700\nG0 X2600 Y1400\nM30\n',{post:'linuxcnc',setup}),setup,()=>3).alarms;
  assert.deepEqual(travel.map(a=>a.message),["Line 4: beyond the machine's X travel (0–2500 mm) and 2 more moves","Line 6: beyond the machine's Y travel (0–1300 mm)"]);
  assert.deepEqual(run('G21 G90\nT1 M6\nS18000 M3\nG0 X50 Y50 Z5\nG1 Z-5 F500\nG0 Z5\nM30\n'),[],'cutting with the spindle running is fine');
  assert.throws(()=>M.loadProgram('G91\nG1 X5 F100\n',{setup}),/incremental/);
  assert.throws(()=>M.loadProgram('G21\nG1 X5\n',{setup}),/without a feed rate/);
  assert.deepEqual(M.loadProgram('G21\nG0 X5\n',{setup}).warnings,['The program does not end with M30 / END PGM']);
  // Heidenhain dwell cycle and G4 in milliseconds (Fanuc, or Mach set so) take their time in seconds.
  const time=(text,post,dwellMs)=>M.loadProgram(text,{post,dwellMs,setup}).segments.filter(s=>s.kind==='dwell').map(s=>s.duration);
  assert.deepEqual(time('G4 P2000\nM30\n','fanuc'),[2]);assert.deepEqual(time('G4 P1500\nM30\n','mach',true),[1.5]);assert.deepEqual(time('G4 P1.5\nM30\n','mach',false),[1.5]);
  assert.deepEqual(time('G4 F2.0\nM30\n','siemens'),[2]);assert.deepEqual(time('0 BEGIN PGM X MM\n1 CYCL DEF 9.0 DWELL TIME\n2 CYCL DEF 9.1 DWELL 2.5\n3 END PGM X MM\n','heidenhain'),[2.5]);
});

test('the stock cuts under a round tool and reports the material removed',()=>{
  const setup=M.jobSetup({sheet:{lengthMm:100,widthMm:100,thicknessMm:18},blocks:[],material:'Birch plywood'}),stock=M.createStock(setup,{maxPoints:10000});
  assert.deepEqual([stock.nx,stock.ny,stock.cx],[100,100,1]);
  const plunge=M.cutStock(stock,{x:50,y:50,z:5},{x:50,y:50,z:-10},3);
  assert.ok(plunge.touched);assert.equal(M.heightAt(stock,50,50),-10);assert.equal(M.heightAt(stock,53,50),-10);assert.equal(M.heightAt(stock,54,50),0);
  assert.ok(Math.abs(plunge.removed-29*10)<1e-6,'29 grid points within 3 mm, 10 mm deep');
  assert.deepEqual(plunge.dirty,[47,53,47,53]);
  assert.equal(M.cutStock(stock,{x:50,y:50,z:-10},{x:50,y:50,z:5},3).touched,false,'retracting up its own hole');
  // A finishing pass a few hundredths deeper still cuts, without counting as touching material.
  const skim=M.cutStock(stock,{x:50,y:50,z:-10.03},{x:50,y:50,z:-10.03},3);
  assert.equal(skim.touched,false);near(M.heightAt(stock,50,50),-10.03);
  assert.equal(M.cutStock(stock,{x:10,y:10,z:-2},{x:30,y:10,z:-2},3,{probe:true}).touched,true);assert.equal(M.heightAt(stock,20,10),0,'a probe does not cut');
  assert.equal(M.cutStock(stock,{x:10,y:10,z:-30},{x:10,y:10,z:-30},3).removed,29*18,'only the blank counts');
  assert.equal(M.cutStock(stock,{x:20,y:20,z:-1},{x:20.2,y:20,z:-1},.1).touched,true,'a tool finer than the grid marks its nearest point');
  assert.equal(M.resetStock(stock).heights.every(v=>v===0),true);
});

test('the rack has real cutters with speeds and feeds from the chip load',()=>{
  const design=box(),drill=design.layers.find(l=>l.operation==='drill');
  for(const c of M.CUTTERS) for(const material of ['pine','oak','birch','white','walnut','aluminium']) {
    const tool=M.recommendTool(c,material);
    assert.doesNotThrow(()=>D.updateLayerTool(design,drill.id,tool),`${c.id} in ${material}`);
    if(c.kind!=='drill') {
      const load=M.chipLoad(tool,c);assert.ok(load>M.chipLoadTarget(c,material)*.6&&load<M.chipLoadTarget(c,material)*1.5,`${c.id} in ${material}: chip load ${load}`);
      assert.deepEqual(M.toolNotes(tool,c,material),[],`${c.id} in ${material}: no notes`);
    }
  }
  assert.equal(M.mountedCutter('profile',6).id,'compression-6');assert.equal(M.mountedCutter('groove',6).id,'downcut-6');
  assert.equal(M.mountedCutter('drill',5).id,'drill-5');assert.equal(M.mountedCutter('pocket',5).label,'Ø5 end mill');
  assert.equal(M.mountedCutter('groove',6,'upcut-6').id,'upcut-6','a chosen cutter of the right size');
  assert.equal(M.mountedCutter('groove',6,'drill-5').id,'downcut-6','drills only on drill layers');
  assert.ok(M.cuttersFor('groove').every(c=>c.kind!=='drill'));
  // The defaults groove at a low chip load (rubbing); a drill cannot bore; depth beyond the flutes.
  const notes=(tool,c,options,material='birch')=>M.toolNotes(tool,c,material,options).map(n=>n.severity+': '+n.message.split(':')[0].split(' mm')[0]);
  assert.deepEqual(notes({diameter:6,feed:2000,plunge:500,rpm:18000,stepdown:3},M.mountedCutter('groove',6)),['warning: Chip load 0.056']);
  assert.deepEqual(notes({diameter:5,feed:600,plunge:300,rpm:12000,stepdown:4},M.mountedCutter('drill',5),{bores:true}),['error: A drill bit cannot bore holes larger than Ø5; fit an end mill']);
  assert.deepEqual(notes(M.recommendTool(M.mountedCutter('profile',6),'birch'),M.mountedCutter('profile',6),{depth:30}),['error: The program cuts 30']);
  assert.deepEqual(notes(M.recommendTool(M.CUTTERS[7],'steel'),M.CUTTERS[7],{},'steel').slice(0,1),['error: Zinc-plated steel is not machined on a wood router']);
  assert.deepEqual(['pine','oak','birch','beech','aluminium','steel'].map(M.materialGroup),['softwood','board','plywood','hardwood','aluminium','metal']);
});

test('the job timeline: tool runs, tool changes and stops, and seeking by time',()=>{
  const design=box(),left=byName(design,'Left side'),grbl=machine(design,left.id).run;
  const blocks=M.runBlocks(grbl);
  assert.deepEqual(blocks.map(b=>b.kind+(b.tool||'')),['cut','stop','cut1','stop','cut2','stop','cut4'],'GRBL: a stop to fit each tool');
  assert.ok(blocks.every((b,k)=>k===0||Math.abs(b.t0-blocks[k-1].t1)<1e-9),'blocks follow each other');
  assert.ok(Math.abs(blocks.at(-1).t1-grbl.duration)<1e-9);
  const atc=machine(D.updateCam(design,{post:'fanuc'}),left.id).run;
  assert.deepEqual(M.runBlocks(atc).map(b=>b.kind+(b.tool||'')),['cut','change','cut1','change','cut2','change','cut4']);
  // Seeking by time lands inside the segment running at that moment.
  for(const t of [0,1.5,grbl.duration/3,grbl.duration*.9]) {
    const at=M.clockAtTime(grbl,t),s=grbl.segments[at.index];
    assert.ok(s.t0<=t+1e-9&&t<=s.t0+s.duration+1e-9,'time '+t);assert.ok(Math.abs(M.clockTime(grbl,at)-t)<1e-6);
  }
  assert.deepEqual(M.clockAtTime(grbl,grbl.duration+5),{index:grbl.segments.length,elapsed:0});
});
