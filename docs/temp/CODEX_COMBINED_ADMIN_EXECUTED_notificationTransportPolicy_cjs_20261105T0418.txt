'use strict';
// Test transport boundary only; actual Socket.IO authorization remains server-side.
const API='https://medisync-wabc.onrender.com';
function transportUrl(input, transport, method) {
  let url;try{url=new URL(input);}catch(_){return false;}
  const origin=url.origin.replace(/^wss:/,'https:');
  if(origin!==API||url.username||url.password||url.hash||url.pathname!=='/socket.io/'||/%|\\|(?:^|\/)\.\.(?:\/|$)/.test(input.split('?')[0]))return false;
  if(transport==='websocket'?url.protocol!=='wss:'||method!=='GET':url.protocol!=='https:'||!['GET','POST'].includes(method))return false;
  const keys=[...url.searchParams.keys()];
  if(new Set(keys).size!==keys.length||keys.some(k=>!['EIO','transport','t','sid'].includes(k)))return false;
  if(url.searchParams.get('EIO')!=='4'||url.searchParams.get('transport')!==transport)return false;
  const sid=url.searchParams.get('sid'),stamp=url.searchParams.get('t');
  if(sid!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(sid)||stamp!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(stamp))return false;
  return method!=='POST'||sid!==null;
}
function permittedFrames(data, token, {closed=false,websocket=false}={}) {
  if(typeof data!=='string'||Buffer.byteLength(data)>16384||!data.length)return false;
  const packets=data.split('\x1e');if(packets.length>8)return false;
  return packets.every(packet=>{
    if(['1','41'].includes(packet))return true; // Engine.IO / namespace close only.
    if(closed)return false;
    if(packet==='3'||websocket&&['2probe','5'].includes(packet))return true;
    if(!packet.startsWith('40')||packet.length<3||typeof token!=='string'||token.length<20)return false;
    try{const auth=JSON.parse(packet.slice(2));return auth&&typeof auth==='object'&&!Array.isArray(auth)&&Object.keys(auth).length===1&&Object.hasOwn(auth,'token')&&auth.token===token;}catch(_){return false;}
  });
}
module.exports={transportUrl,permittedFrames};
