export const stockRateKey=value=>[value.material,value.thicknessMm,value.stockLengthMm,value.stockWidthMm].map((v,i)=>i?Math.round(v*1000):v).join(':');
export function validateStockRates(value){
 if(!Array.isArray(value)||value.length>128)throw Error('Expected at most 128 stock price overrides');
 const keys=new Set(),dimension=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&Math.abs(v*1000-Math.round(v*1000))<1e-6;
 return value.map(row=>{
  if(!row||!['oak','birch','white'].includes(row.material)||!dimension(row.thicknessMm,12,50)||!dimension(row.stockLengthMm,100,10000)||!dimension(row.stockWidthMm,100,10000)||!Number.isSafeInteger(row.unitCents)||row.unitCents<0||row.unitCents>1000000)throw Error('Invalid stock price: thickness 12–50 mm, stock 100–10000 mm, up to three dimension decimals and integer cents 0–1000000');
  const result={material:row.material,thicknessMm:Math.round(row.thicknessMm*1000)/1000,stockLengthMm:Math.round(row.stockLengthMm*1000)/1000,stockWidthMm:Math.round(row.stockWidthMm*1000)/1000,unitCents:row.unitCents},key=stockRateKey(result);
  if(keys.has(key))throw Error('Duplicate stock price for material, thickness and ordered sheet dimensions');keys.add(key);return result;
 });
}
