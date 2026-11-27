// User-entered planning limits, in mm and mm/min. No hardware certification.
export const MACHINE_LIMIT_DEFAULTS=Object.freeze({travelX:2500,travelY:1300,offsetX:40,offsetY:40,maxDepth:50,maxSafeZ:100,maxFeed:6000,maxRpm:24000,maxToolDiameter:20});
export function validateMachineLimits(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Machine limits must be an object');
  const out={};
  for(const key of Object.keys(MACHINE_LIMIT_DEFAULTS)) {
    const n=value[key];if(typeof n!=='number'||!Number.isFinite(n)||n<(key.startsWith('offset')?0:.01)||n>1000000)throw Error('Machine '+key+' must be a finite '+(key.startsWith('offset')?'nonnegative':'positive')+' number up to 1000000');
    out[key]=n;
  }
  if(out.offsetX>=out.travelX||out.offsetY>=out.travelY)throw Error('Machine work offsets must lie inside its travel');
  return out;
}
