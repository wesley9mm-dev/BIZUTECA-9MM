'use strict';
const busy=()=>Error('Aguarde a operação de dados em andamento.');
function createMaintenance(){
 let active=false,reserved=false;
 return {
  get active(){return active;},
  async reserve(fn){
   if(reserved||active)throw busy();
   reserved=true;
   try{return await fn();}finally{reserved=false;}
  },
  async work(fn){
   if(active)throw busy();
   active=true;
   try{return await fn();}finally{active=false;}
  }
 };
}
module.exports={createMaintenance,busy};
