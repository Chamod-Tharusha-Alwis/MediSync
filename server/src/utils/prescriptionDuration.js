// Calendar-independent expiry: N exact 24-hour periods after issuedAt, in UTC.
// No clinical maximum is invented; JS date representability is a technical bound.
class DurationError extends Error {
  constructor() { super('Each medicine requires durationDays as a positive whole number; legacy duration is unsupported.'); this.code='INVALID_DURATION'; }
}
function prescriptionTiming(medicine, issuedAt = new Date()) {
  if (!medicine || typeof medicine !== 'object' || Array.isArray(medicine) || Object.hasOwn(medicine,'duration') ||
      typeof medicine.durationDays !== 'number' || !Number.isSafeInteger(medicine.durationDays) || medicine.durationDays <= 0) throw new DurationError();
  const start = new Date(issuedAt), expiry = new Date(+start + medicine.durationDays * 86400000);
  if (!Number.isFinite(+start) || !Number.isFinite(+expiry)) throw new DurationError();
  return { durationDays:medicine.durationDays, issuedAt:start, expiresAt:expiry };
}
function validateMedicines(medicines, issuedAt = new Date()) {
  if (!Array.isArray(medicines)) throw new DurationError();
  return medicines.map(medicine => prescriptionTiming(medicine, issuedAt));
}
const validateRoute = list => (req,res,next) => {
  try { list ? validateMedicines(req.body?.prescriptions === undefined ? [] : req.body.prescriptions) : prescriptionTiming(req.body); next(); }
  catch (_) { return res.status(400).json({error:'INVALID_DURATION',message:new DurationError().message}); }
};
module.exports={DurationError,prescriptionTiming,validateMedicines,validateConsultationDuration:validateRoute(true),validateStandaloneDuration:validateRoute(false)};
