const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');

// POST /api/prescription/issue — Doctor issues prescription
exports.issuePrescription = async (req, res) => {
  try {
    const { patientNic, drugName, dosage, frequency, durationDays } = req.body;

    // Allergy cross-reference check
    const patient = await Patient.findOne({ nic: patientNic });
    if (patient?.allergies?.some(a => drugName.toLowerCase().includes(a.toLowerCase()))) {
      return res.status(400).json({ 
        error: 'ALLERGY_CONFLICT', 
        message: `Patient is allergic to: ${patient.allergies.join(', ')}` 
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (durationDays || 7));

    const rx = await Prescription.create({
      patientNic, drugName, dosage, frequency,
      durationDays, expiresAt,
      doctorId: req.user.id
    });

    // Send anonymized data point to Python ML engine
    try {
      await fetch(`${process.env.ML_ENGINE_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: req.body.district,
          drugCategory: req.body.drugCategory || 'general',
          date: new Date().toISOString().split('T')[0]
          // NIC intentionally NOT sent — anonymized
        })
      });
    } catch (e) { /* ML engine errors should not block prescription */ }

    res.status(201).json(rx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/prescription/pending/:nic — Pharmacist gets pending prescriptions
exports.getPendingByNic = async (req, res) => {
  try {
    const rxList = await Prescription.find({
      patientNic: req.params.nic,
      status: 'issued',
      expiresAt: { $gt: new Date() }
    }).populate('doctorId', 'fullName specialization');

    res.json(rxList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/prescription/dispense/:id — Pharmacist marks dispensed
exports.dispense = async (req, res) => {
  try {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    if (rx.status === 'dispensed') {
      return res.status(400).json({ error: 'DUPLICATE_DISPENSE', message: 'Already dispensed' });
    }
    if (rx.status === 'expired' || rx.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Prescription has expired' });
    }

    rx.status = 'dispensed';
    rx.dispensedAt = new Date();
    rx.dispensedBy = req.body.pharmacyId;
    await rx.save();

    res.json({ message: 'Dispensed successfully', rx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};