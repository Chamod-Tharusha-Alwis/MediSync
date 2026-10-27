'use strict';
const { clinicalDto } = require('../services/clinicalRecordDto');
function createConsultationHandler({ execute = req => require('../services/consultationCommandService').executeClinicalWrite(req),
  prescriptions = filter => require('../models/Prescription').find(filter), labs = filter => require('../models/LabTest').find(filter) } = {}) {
  const handler = async (req, res) => {
    try {
      const outcome = await execute(req), result = outcome.result;
      const scope = { doctorId: req.user.id, patientId: req.clinicalAuthorization.patientId };
      const rxRows = await prescriptions({ _id: { $in: result.prescriptionIds }, ...scope });
      const labRows = await labs({ _id: { $in: result.labTestIds }, referredBy: req.user.id, patientId: scope.patientId });
      if (rxRows.length !== result.prescriptionIds.length || labRows.length !== result.labTestIds.length) return res.status(503).json({ error: 'Committed clinical records cannot be read safely', commandId: outcome.commandId });
      return res.status(outcome.replayed ? 200 : 201).json({ message: 'Consultation committed successfully', consultationId: result.consultationId,
        prescriptions: rxRows.map(row => clinicalDto(row, 'prescription')), tests: labRows.map(row => clinicalDto(row, 'lab')),
        conflictWarnings: [], replayed: outcome.replayed, commandId: outcome.commandId,
        notifications: { requested: false, deliveryConfirmed: false } });
    } catch (error) {
      const { ClinicalCommandError } = require('../services/clinicalErrors');
      if (error instanceof ClinicalCommandError) return res.status(error.status).json({ error: error.code });
      if (['DurationError', 'MedicationNameError'].includes(error.name)) return res.status(400).json({ error: error.code, message: error.message });
      return res.status(503).json({ error: 'Clinical write could not be completed safely' });
    }
  };
  handler.securityCommandVersion = 1;
  return handler;
}
module.exports = { createConsultationHandler, createConsultation: createConsultationHandler() };
