const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');

// GET /api/patient/:nic — Doctor fetches full patient history
exports.getPatientByNic = async (req, res) => {
  try {
    const { nic } = req.params;
    const patient = await Patient.findOne({ nic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const consultations = await Consultation.find({ patientNic: nic })
      .populate('doctorId', 'fullName specialization')
      .sort({ createdAt: -1 });

    const prescriptions = await Prescription.find({ patientNic: nic })
      .sort({ issuedAt: -1 });

    res.json({ patient, consultations, prescriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/patient — Register new patient
exports.createPatient = async (req, res) => {
  try {
    const patient = await Patient.create(req.body);
    res.status(201).json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};