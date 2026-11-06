'use strict';

// Legacy patient URLs use a NIC; newer login responses use a stable account id.
// Resolve only the authenticated patient's own id, then retain every downstream
// NIC/consent/ownership check. Other roles and NIC-addressed requests are unchanged.
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const NIC = /^(?:[0-9]{9}[VX]|[0-9]{12})$/;

module.exports = async function patientRouteIdentity(req, res, next) {
  const target = req.params?.nic;
  if (req.user?.role !== 'patient' || typeof target !== 'string' || !OBJECT_ID.test(target)) return next();

  const actorId = req.user.id;
  if (typeof actorId !== 'string' || !OBJECT_ID.test(actorId) || target.toLowerCase() !== actorId.toLowerCase()) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const patient = await require('../models/Patient').findById(actorId).select('_id nic');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const nic = typeof patient.nic === 'string' ? patient.nic.trim().toUpperCase() : '';
    if (String(patient._id).toLowerCase() !== actorId.toLowerCase() || !NIC.test(nic)) {
      return res.status(503).json({ error: 'Patient identity unavailable' });
    }
    req.params.nic = nic;
    return next();
  } catch (_) {
    return res.status(503).json({ error: 'Patient identity unavailable' });
  }
};
