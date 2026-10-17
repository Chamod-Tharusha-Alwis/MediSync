// Explicit response projections. No authentication/session/encryption internals.
const fields = Object.freeze({
  patient: ['_id','nic','fullName','dateOfBirth','gender','district','email','contactInfo','address','bloodGroup','allergies','chronicConditions','emergencyContact','insurance','height','weight','riskScore','riskLevel','profilePicture'],
  doctor: ['_id','nic','fullName','dateOfBirth','gender','bloodGroup','allergies','chronicConditions','height','weight','riskScore','riskLevel'],
  admin: ['_id','nic','fullName','email','district','isActive','createdAt','updatedAt'],
  super_admin: ['_id','nic','fullName','email','district','isActive','createdAt','updatedAt']
});
function projectProfile(patient, role) {
  const allowed = fields[role];
  if (!allowed) throw new Error('Profile role has no approved field policy');
  const source = typeof patient.toObject === 'function' ? patient.toObject() : patient;
  const result = Object.fromEntries(allowed.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  // Nested objects also use allowlists; schema extensions must not leak silently.
  const nested = { emergencyContact:['name','relationship','phone'], insurance:['provider','policyNumber','expiryDate'] };
  for (const [name, keys] of Object.entries(nested)) if (result[name]) result[name] = Object.fromEntries(keys.filter(key=>result[name][key]!==undefined).map(key=>[key,result[name][key]]));
  return result;
}
function profileSelection(role) {
  const allowed = fields[role];
  if (!allowed) throw new Error('Profile role has no approved field policy');
  const encrypted = ['fullName','contactInfo','allergies'].filter(field=>allowed.includes(field));
  // Markers/data are necessary for AES array hydration, but never projected out.
  return [...allowed,'keyVersion',...encrypted.flatMap(field=>[`__enc_${field}`,`__enc_${field}_d`])].join(' ');
}
module.exports={fields,projectProfile,profileSelection};
