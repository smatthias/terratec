export function validateCustomer(input){
  if(!input||typeof input.name!=='string'||!input.name.trim())throw Error('Customer needs a name');
  const result={};for(const [key,max] of [['name',120],['email',254],['phone',50],['address',500],['notes',1000]]){
    const value=input[key]??'';if(typeof value!=='string'||value.length>max)throw Error('Invalid customer '+key);result[key]=value.trim();
  }
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('Invalid customer email');
  return result;
}
