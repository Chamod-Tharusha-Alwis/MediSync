'use strict';
const {normalizeLoginIdentifier}=require('./loginIdentifier');
const roles=new Set(['admin','super_admin','superadmin','patient','doctor','hospital','hospital_admin','pharmacy','pharmacist','pharmacy_admin','assistant']);
const pharmacyRoles=new Set(['pharmacy','pharmacist','pharmacy_admin','assistant']);
function isLoginRequest(body,{pharmacyOnly=false}={}){
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.password!=='string'||!body.password.length||body.password.length>1024)return false;
  // Login is not password creation: preserve legacy short passwords and exact
  // spelling, while bounding malformed input before any repository/hash work.
  for(const key of ['email','identifier','nic','regNo','doctorId'])if(body[key]!=null&&typeof body[key]!=='string')return false;
  try{normalizeLoginIdentifier(pharmacyOnly?body.email:(body.email||body.identifier||body.nic||body.regNo||body.doctorId));}catch{return false;}
  if(body.role!=null&&body.role!==''&&(typeof body.role!=='string'||!(pharmacyOnly?pharmacyRoles:roles).has(body.role)))return false;
  if(body.loginType!=null&&!['personal','hospital'].includes(body.loginType))return false;
  return true;
}
module.exports={isLoginRequest};
