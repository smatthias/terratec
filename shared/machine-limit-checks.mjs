import {validateMachineLimits} from './machine-limits.mjs';
export function machineLimitIssues(programs,input) {
  if(!input)return [];
  const m=validateMachineLimits(input),issues=[];
  for(const program of programs) {
    const codes=new Map(),add=(code,message)=>codes.set(code,{code:'MACHINE_'+code,severity:'error',partId:program.partId,message:program.name+' face '+program.face+': '+message});
    if(program.sheet.lengthMm+m.offsetX>m.travelX||program.sheet.widthMm+m.offsetY>m.travelY)add('STOCK','panel extends beyond machine XY travel');
    for(const block of program.blocks) {
      const tool=block.tool,r=tool.diameter/2;
      if(tool.diameter>m.maxToolDiameter)add('TOOL','tool diameter exceeds the machine limit');
      if(tool.rpm>m.maxRpm)add('RPM','spindle speed exceeds the machine limit');
      if(Math.max(tool.feed,tool.plunge)>m.maxFeed)add('FEED','tool feed or plunge exceeds the machine limit');
      let previous;
      for(const move of block.moves) {
        if(move.z>m.maxSafeZ+1e-7||move.z< -m.maxDepth-1e-7)add('Z','toolpath exceeds work-relative Z limits');
        if(move.f>m.maxFeed)add('FEED','toolpath feed exceeds the machine limit');
        let minX=move.x,maxX=move.x,minY=move.y,maxY=move.y;
        // Full-circle bounds are conservative for partial arcs and include helices.
        if((move.g===2||move.g===3)&&previous) {
          const x=previous.x+move.i,y=previous.y+move.j,radius=Math.hypot(move.i,move.j);
          minX=x-radius;maxX=x+radius;minY=y-radius;maxY=y+radius;
        }
        if(minX-r+m.offsetX< -1e-7||maxX+r+m.offsetX>m.travelX+1e-7||minY-r+m.offsetY< -1e-7||maxY+r+m.offsetY>m.travelY+1e-7)add('XY','cutter envelope exceeds machine XY travel at the configured work offset');
        previous=move;
      }
    }
    issues.push(...codes.values());
  }
  return issues;
}
