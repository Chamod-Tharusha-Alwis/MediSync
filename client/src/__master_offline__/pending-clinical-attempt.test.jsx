import {pendingClinicalAttempt,beginClinicalAttempt,finishClinicalAttempt} from '../utils/pendingClinicalAttempt';
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
const key='owned-consultation-0001';
test('pending operation survives reload/revocation while no patient details, draft or tokens are stored',()=>{
 const s=storage();beginClinicalAttempt(key,s);expect(pendingClinicalAttempt(s)).toEqual({blocked:true,key});expect(()=>beginClinicalAttempt('different-operation-0001',s)).toThrow();expect([...s.values.values()]).toEqual([JSON.stringify({key})]);
});
test('only a matching confirmed operation can clear the hold',()=>{const s=storage();beginClinicalAttempt(key,s);expect(()=>finishClinicalAttempt('different-operation-0001',s)).toThrow();expect(pendingClinicalAttempt(s).blocked).toBe(true);finishClinicalAttempt(key,s);expect(pendingClinicalAttempt(s).blocked).toBe(false);});
test.each(['invalid-json','{}','{"key":{}}'])('corrupt persisted state %s cannot silently create a fresh checkout',value=>{const s=storage();s.values.set('medisync:pending-consultation',value);expect(pendingClinicalAttempt(s)).toEqual({blocked:true,key:null});expect(()=>beginClinicalAttempt(key,s)).toThrow();});
test('storage failure blocks dispatch rather than falling back to an untracked operation',()=>{const s={getItem(){throw Error('storage unavailable');}};expect(pendingClinicalAttempt(s).blocked).toBe(true);expect(()=>beginClinicalAttempt(key,s)).toThrow();});
