'use strict';
// Pure classification unless collectWindowsInventory is explicitly called.
const path=require('path'),crypto=require('crypto'),net=require('net');
const CONTRACT='5xe1-windows-inventory-v2',MAX_BOUNDARY_MS=180000;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const canonical=value=>JSON.stringify(stable(value)),digest=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const executable=value=>typeof value==='string'&&path.win32.isAbsolute(value)?path.win32.normalize(value).toLowerCase():null;
const installedMongo=value=>!!value&&/^[a-z]:\\program files(?: \(x86\))?\\mongodb\\server\\[0-9][a-z0-9.-]*\\bin\\mongod\.exe$/.test(value);
const validPid=value=>Number.isSafeInteger(value)&&value>0;
const hashString=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sorted=(rows,key)=>[...rows].sort((a,b)=>String(canonical(key(a))).localeCompare(String(canonical(key(b)))));
const basic=p=>({PID:p.PID,Name:p.Name,Unknown:p.Unknown,QA:p.QA,ExecutablePath:p.ExecutablePath??null,CreatedUtc:p.CreatedUtc??null});
function inventoryProvenance(inspectorPid){
 if(!validPid(inspectorPid))throw Error('Invalid inspection parent PID');
 return{Contract:CONTRACT,SourceSha256:crypto.createHash('sha256').update(require('fs').readFileSync(__filename)).digest('hex'),InspectorPid:inspectorPid};
}
function classifyWindowsInventory(inventory,{now=Date.now(),previousObservation,previousFingerprint,confirmedAt,expectedSourceSha256,expectedInspectorPid}={}){
 const blockers=[],recognizedServices=[];const block=(reason,pid)=>blockers.push({reason,...(pid===undefined?{}:{pid})});
 const result=(fingerprint=null,observation=null)=>({allowed:!blockers.length,blockers,recognizedServices:!blockers.length?recognizedServices:[],fingerprint,observation:!blockers.length?observation:null,localMongoConnectionPermitted:false,writerIdleConfirmed:false});
 const provenance=inventory?.Provenance;
 if(!inventory||inventory.ApiSucceeded!==true||inventory.Schema!==CONTRACT||!Array.isArray(inventory.Passes)||inventory.Passes.length!==2){block('inventory-api-unknown');return result();}
 if(!hashString(expectedSourceSha256)||provenance?.Contract!==CONTRACT||provenance.SourceSha256!==expectedSourceSha256||!validPid(provenance.InspectorPid)||(expectedInspectorPid!==undefined&&provenance.InspectorPid!==expectedInspectorPid)){block('inventory-provenance-unverified');return result();}
 if(!Number.isFinite(now))block('invalid-observation-clock');
 if(confirmedAt!==undefined){const age=now-Date.parse(confirmedAt);if(!Number.isFinite(age)||age<0||age>=900000)block('invalid-confirmation-time');}
 if(previousFingerprint!==undefined)block('unbound-previous-fingerprint');
 const signatures=[],identities=[];
 for(const pass of inventory.Passes){
  const stamp=Date.parse(pass?.ObservedAt),begin=Date.parse(pass?.StartedAt),age=now-begin;
  const evidence=pass?.Evidence;
  if(!Number.isFinite(age)||age<0||age>15000||!Number.isFinite(stamp)||stamp<begin||stamp>now||['Processes','ProcessesAfter','Services','ServicesAfter','Listeners','ListenersAfter','PidLookups'].some(k=>!Array.isArray(pass?.[k]))){block('stale-or-malformed-observation');continue;}
  if(!evidence||['ProcessQuerySucceeded','ServiceQuerySucceeded','ListenerQuerySucceeded','ProcessRecheckSucceeded','ServiceRecheckSucceeded','ListenerRecheckSucceeded','ServicePidLookupsSucceeded'].some(k=>evidence[k]!==true)||evidence.ProcessScope!=='all-api-rows-with-relevant-selection'||evidence.ListenerScope!=='qa-ports-and-27017'){block('incomplete-required-observation');continue;}
  const seen=new Set(),recognized=[],named=pass.Services.filter(s=>s?.Name==='MongoDB');
  if(named.length>1)block('unknown-or-conflicting-service');
  if([...pass.Processes,...pass.ProcessesAfter,...pass.Services,...pass.ServicesAfter,...pass.Listeners,...pass.ListenersAfter,...pass.PidLookups].some(row=>!row||typeof row!=='object')){block('malformed-observation-row');continue;}
  if(canonical(sorted(pass.Processes.map(basic),p=>p.PID))!==canonical(sorted(pass.ProcessesAfter.map(basic),p=>p.PID)))block('process-changed-during-collection');
  if(canonical(sorted(pass.Services,s=>[s.Name,s.PID]))!==canonical(sorted(pass.ServicesAfter,s=>[s.Name,s.PID])))block('service-changed-during-collection');
  if(canonical(sorted(pass.Listeners,l=>[l.LocalPort,l.LocalAddress,l.OwningProcess]))!==canonical(sorted(pass.ListenersAfter,l=>[l.LocalPort,l.LocalAddress,l.OwningProcess])))block('listener-changed-during-collection');
  // Reverse validation is mandatory even when the process candidate list is empty.
  for(const s of pass.Services){
   if(s.Name!=='MongoDB'){block('unknown-or-conflicting-service',s.PID);continue;}
   if(s.Type!=='Own Process'){block('service-identity-unverified',s.PID);continue;}
   if(s.State==='Stopped'){
    if(s.PID!==0||pass.Processes.some(p=>p.Name==='mongod.exe')||pass.PidLookups.length)block('stopped-service-process-conflict',s.PID);
    continue;
   }
   if(s.State!=='Running'||!validPid(s.PID)){block('invalid-running-service-pid-or-state',s.PID);continue;}
   const matched=pass.Processes.filter(p=>p.PID===s.PID),lookups=pass.PidLookups.filter(x=>x.PID===s.PID);
   if(matched.length!==1||matched[0]?.Name!=='mongod.exe'){block('service-process-unreconciled',s.PID);continue;}
   if(lookups.length!==1||lookups[0].QuerySucceeded!==true||!Array.isArray(lookups[0].Rows)||lookups[0].Rows.length!==1||canonical(basic(lookups[0].Rows[0]||{}))!==canonical(basic(matched[0]))){block('service-pid-lookup-unverified',s.PID);}
  }
  const expectedLookups=named.filter(s=>s.State==='Running'&&validPid(s.PID)).map(s=>s.PID);
  if(pass.PidLookups.length!==expectedLookups.length||pass.PidLookups.some(x=>!expectedLookups.includes(x.PID)))block('unexpected-or-missing-service-pid-lookup');
  for(const p of pass.Processes){
   if(!validPid(p.PID)||p.PID===provenance.InspectorPid||seen.has(p.PID)||typeof p.Name!=='string'||typeof p.Unknown!=='boolean'){block('conflicting-process-mapping',p.PID);continue;}seen.add(p.PID);
   if(p.QA!==false){block('qa-or-unclassified-writer',p.PID);continue;}
   if(p.Unknown===false&&p.Name!=='mongod.exe')continue;
   if(p.Name!=='mongod.exe'){block('unknown-process',p.PID);continue;}
   const services=pass.Services.filter(s=>s.PID===p.PID);
   if(services.length!==1||services[0].Name!=='MongoDB'||pass.Services.filter(s=>s.Name==='MongoDB').length!==1){block('unknown-or-conflicting-service',p.PID);continue;}
   const s=services[0],registered=executable(s.Executable),actual=executable(p.ImagePath),cim=executable(p.ExecutablePath),created=Date.parse(p.CreatedUtc),apiCreated=Date.parse(p.ImageCreatedUtc);
   if(s.State!=='Running'||s.Type!=='Own Process'||p.ImageQueryError!==0||!registered||!actual||!installedMongo(actual)||registered!==actual||(p.ExecutablePath&&!cim)||(cim&&cim!==actual)||!Number.isFinite(created)||created!==apiCreated||created>=begin||created<=0||(confirmedAt&&created>=Date.parse(confirmedAt))){block('service-identity-unverified',p.PID);continue;}
   recognized.push({name:s.Name,pid:p.PID,createdUtc:new Date(created).toISOString(),executable:actual});
  }
  const endpoints=new Set();
  for(const l of pass.Listeners){
   if(typeof l.LocalAddress!=='string'||!net.isIP(l.LocalAddress)||!Number.isInteger(l.LocalPort)||!validPid(l.OwningProcess)){block('listener-owner-unverified');continue;}
   const endpoint=canonical([l.LocalAddress.toLowerCase(),l.LocalPort]);
   if(endpoints.has(endpoint))block('ambiguous-listener-ownership',l.OwningProcess);endpoints.add(endpoint);
   if([3000,3100,5100,5101].includes(l.LocalPort)){block('qa-listener-present');continue;}
   if(l.LocalPort!==27017||!recognized.some(p=>p.pid===l.OwningProcess))block('unexplained-mongodb-listener',l.OwningProcess);
  }
  // Keep all reviewed evidence, including unrecognized/conflicting candidates.
  signatures.push(canonical({provenance,evidence,processes:sorted(pass.Processes,p=>p.PID),recheck:sorted(pass.ProcessesAfter,p=>p.PID),services:sorted(pass.Services,s=>[s.Name,s.PID]),serviceRecheck:sorted(pass.ServicesAfter,s=>[s.Name,s.PID]),lookups:sorted(pass.PidLookups,x=>x.PID),listeners:sorted(pass.Listeners,l=>[l.LocalPort,l.LocalAddress,l.OwningProcess]),listenerRecheck:sorted(pass.ListenersAfter,l=>[l.LocalPort,l.LocalAddress,l.OwningProcess])}));
  identities.push(recognized.sort((a,b)=>a.pid-b.pid));
 }
 if(signatures.length!==2||signatures[0]!==signatures[1])block('inconsistent-repeated-observation');
 const gap=Date.parse(inventory.Passes[1]?.ObservedAt)-Date.parse(inventory.Passes[0]?.ObservedAt);if(!Number.isFinite(gap)||gap<0||gap>10000)block('inconsistent-observation-time');
 if(Date.parse(inventory.Passes[1]?.StartedAt)<Date.parse(inventory.Passes[0]?.ObservedAt))block('overlapping-observation-passes');
 const fingerprint=signatures.length===2?digest(signatures[0]):null;
 if(previousObservation!==undefined){
  const age=now-Date.parse(previousObservation?.observedAt);
  if(!hashString(previousObservation?.fingerprint)||!Number.isFinite(age)||age<0||age>MAX_BOUNDARY_MS||canonical(previousObservation.provenance)!==canonical(provenance)||Date.parse(previousObservation.observedAt)>Date.parse(inventory.Passes[0]?.StartedAt))block('stale-or-unbound-previous-observation');
  if(previousObservation?.fingerprint!==fingerprint)block('inventory-changed-since-admission');
 }
 if(!blockers.length)recognizedServices.push(...identities[0]);
 return result(fingerprint,{fingerprint,observedAt:inventory.Passes[1].ObservedAt,provenance});
}
function windowsInspectionScript(selfPid){
 if(!Number.isSafeInteger(selfPid)||selfPid<=0)throw Error('Invalid inspection parent PID');
 const provenance=inventoryProvenance(selfPid);
 return `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class E1ReadOnlyIdentity {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint a,bool b,int c);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h,int f,StringBuilder p,ref int s);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long a,out long b,out long c,out long d);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 public static string[] Read(int pid){IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)return new[]{"","",Marshal.GetLastWin32Error().ToString()};try{int n=32768;var p=new StringBuilder(n);if(!QueryFullProcessImageName(h,0,p,ref n))return new[]{"","",Marshal.GetLastWin32Error().ToString()};long a,b,c,d;if(!GetProcessTimes(h,out a,out b,out c,out d))return new[]{p.ToString(),"",Marshal.GetLastWin32Error().ToString()};return new[]{p.ToString(),DateTime.FromFileTimeUtc(a).ToString("o"),"0"};}finally{CloseHandle(h);}}
}
'@
function Convert-E1Process($p) {
 $line=[string]$p.CommandLine
 [pscustomobject]@{PID=[int]$p.ProcessId;Name=$p.Name;Unknown=[string]::IsNullOrEmpty($line);QA=($line -match 'phase5x|medisync|jest|playwright|seed|react-scripts|flask');ExecutablePath=$p.ExecutablePath;CreatedUtc=$(if($p.CreationDate){$p.CreationDate.ToUniversalTime().ToString('o')}else{$null})}
}
function Convert-E1Service($s) {
 $raw=[string]$s.PathName;$exe=$null
 if($raw -match '^\\s*"([^"\r\n]+\\.exe)"'){$exe=$Matches[1]}elseif($raw -match '^\\s*(.+?\\.exe)(?:\\s|$)'){$exe=$Matches[1]}
 [pscustomobject]@{Name=$s.Name;State=$s.State;Type=$s.ServiceType;PID=[int]$s.ProcessId;Executable=$exe}
}
function Get-E1Listeners {
 @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -in @(3000,3100,5100,5101,27017)} | ForEach-Object {[pscustomobject]@{LocalAddress=[string]$_.LocalAddress;LocalPort=[int]$_.LocalPort;OwningProcess=[int]$_.OwningProcess}})
}
function Observe-E1Inventory {
 $started=[DateTime]::UtcNow.ToString('o')
 # These are API enumeration/lookup receipts, not a continuous/global writer guarantee.
 # Stop on any query error. Never substitute empty arrays for a failed query.
 $before=@(Get-CimInstance Win32_Process -ErrorAction Stop)
 $serviceBefore=@(Get-CimInstance Win32_Service -ErrorAction Stop)
 $listeners=@(Get-E1Listeners)
 $lookups=@($serviceBefore | Where-Object {$_.Name -eq 'MongoDB' -and $_.State -eq 'Running' -and $_.ProcessId -gt 0} | ForEach-Object {
  $id=[int]$_.ProcessId
  $found=@(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$id) -ErrorAction Stop | ForEach-Object {Convert-E1Process $_})
  [pscustomobject]@{PID=$id;QuerySucceeded=$true;Rows=$found}
 })
 $facts=@{}
 foreach($p in @($before | Where-Object {$_.Name -eq 'mongod.exe'})){$facts[[int]$p.ProcessId]=[E1ReadOnlyIdentity]::Read([int]$p.ProcessId)}
 $after=@(Get-CimInstance Win32_Process -ErrorAction Stop)
 $serviceAfter=@(Get-CimInstance Win32_Service -ErrorAction Stop)
 $listenersAfter=@(Get-E1Listeners)
 $mongoIds=@(@($before)+@($after) | Where-Object {$_.Name -eq 'mongod.exe'} | Select-Object -ExpandProperty ProcessId)
 $serviceIds=@(@($serviceBefore)+@($serviceAfter) | Where-Object {$_.Name -eq 'MongoDB' -and $_.ProcessId -gt 0} | Select-Object -ExpandProperty ProcessId)
 $listenerIds=@(@($listeners)+@($listenersAfter) | Where-Object {$_.LocalPort -eq 27017} | Select-Object -ExpandProperty OwningProcess)
 $relevantIds=@($mongoIds)+@($serviceIds)+@($listenerIds)
 $rows=@($before | Where-Object {($_.Name -match 'node|python|mongod' -or $_.ProcessId -in $relevantIds) -and $_.ProcessId -ne ${selfPid}} | ForEach-Object {
  $row=Convert-E1Process $_;$identity=@('','','-1');if($facts.ContainsKey([int]$_.ProcessId)){$identity=$facts[[int]$_.ProcessId]}
  $row | Add-Member -NotePropertyName ImagePath -NotePropertyValue $identity[0]
  $row | Add-Member -NotePropertyName ImageCreatedUtc -NotePropertyValue $identity[1]
  $row | Add-Member -NotePropertyName ImageQueryError -NotePropertyValue ([int]$identity[2])
  $row
 })
 $rowsAfter=@($after | Where-Object {($_.Name -match 'node|python|mongod' -or $_.ProcessId -in $relevantIds) -and $_.ProcessId -ne ${selfPid}} | ForEach-Object {Convert-E1Process $_})
 $services=@($serviceBefore | Where-Object {$_.Name -eq 'MongoDB' -or ($_.ProcessId -gt 0 -and $_.ProcessId -in $mongoIds)} | ForEach-Object {Convert-E1Service $_})
 $servicesAfter=@($serviceAfter | Where-Object {$_.Name -eq 'MongoDB' -or ($_.ProcessId -gt 0 -and $_.ProcessId -in $mongoIds)} | ForEach-Object {Convert-E1Service $_})
 [pscustomobject]@{StartedAt=$started;ObservedAt=[DateTime]::UtcNow.ToString('o');Processes=$rows;ProcessesAfter=$rowsAfter;Services=$services;ServicesAfter=$servicesAfter;Listeners=$listeners;ListenersAfter=$listenersAfter;PidLookups=$lookups;Evidence=[pscustomobject]@{ProcessQuerySucceeded=$true;ServiceQuerySucceeded=$true;ListenerQuerySucceeded=$true;ProcessRecheckSucceeded=$true;ServiceRecheckSucceeded=$true;ListenerRecheckSucceeded=$true;ServicePidLookupsSucceeded=$true;ProcessScope='all-api-rows-with-relevant-selection';ListenerScope='qa-ports-and-27017'}}
}
$first=Observe-E1Inventory; $second=Observe-E1Inventory
[pscustomobject]@{Schema='${CONTRACT}';Provenance=[pscustomobject]@{Contract='${provenance.Contract}';SourceSha256='${provenance.SourceSha256}';InspectorPid=${selfPid}};ApiSucceeded=$true;Passes=@($first,$second)} | ConvertTo-Json -Depth 9 -Compress`;
}
function collectWindowsInventory({run,selfPid=process.pid}={}){
 const script=windowsInspectionScript(selfPid);
 if(!run)run=s=>JSON.parse(require('child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',s],{env:inspectionEnvironment(),encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024}).replace(/^\uFEFF/,''));
 try{return run(script);}catch(_){return{ApiSucceeded:false,Passes:[]};}
}
function inspectionEnvironment(inherited=process.env){const keys=['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH','LOGONSERVER','SYSTEMDRIVE','USERDOMAIN','USERNAME'];return Object.fromEntries(keys.filter(k=>inherited[k]).map(k=>[k,inherited[k]]));}
module.exports={classifyWindowsInventory,collectWindowsInventory,windowsInspectionScript,inspectionEnvironment,inventoryProvenance,CONTRACT,MAX_BOUNDARY_MS};
