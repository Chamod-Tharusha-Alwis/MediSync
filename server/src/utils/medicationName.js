// Creation contract only. Alias equality does not imply clinical equivalence.
class MedicationNameError extends Error {
  constructor() { super('Provide one nonempty medication name; name and drugName must agree when both are supplied.'); this.code='INVALID_MEDICATION_NAME'; }
}
function canonicalMedicationName(medicine) {
  if (!medicine || typeof medicine !== 'object' || Array.isArray(medicine)) throw new MedicationNameError();
  const target = typeof medicine.toObject === 'function' ? medicine.toObject() : (medicine._doc || medicine);
  const keys=['name','drugName'].filter(key=>Object.prototype.hasOwnProperty.call(target,key));
  if (!keys.length || keys.some(key=>typeof target[key]!=='string' || !target[key].trim())) throw new MedicationNameError();
  const names=keys.map(key=>target[key].trim());
  if (names.some(name=>name!==names[0])) throw new MedicationNameError();
  return names[0];
}
module.exports={canonicalMedicationName,MedicationNameError};
