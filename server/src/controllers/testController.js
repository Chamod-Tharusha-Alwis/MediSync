const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const TestOrder = require('../models/TestOrder');
const Consultation = require('../models/Consultation');

exports.orderTest = async (req, res) => {
  try {
    const {
      consultationId, patientNic, testName, testCategory,
      urgency, instructions, isSurgeryRelated, surgeryNotes, hospitalId
    } = req.body;

    if (!consultationId || !patientNic || !testName || !testCategory) {
      return res.status(400).json({ error: 'consultationId, patientNic, testName, and testCategory are required' });
    }

    // Verify the consultation belongs to the requesting doctor
    const consultation = await Consultation.findOne({ _id: consultationId, doctorId: req.user.id });
    if (!consultation) {
      return res.status(403).json({ error: 'Consultation not found or not authorized' });
    }

    consultation.decryptFieldsSync?.();
    const { normalizeNic } = require('../security/nicBlindIndex');
    if (!consultation.patientNic || normalizeNic(consultation.patientNic) !== normalizeNic(patientNic)) {
      return res.status(403).json({ error: 'Consultation patient mismatch' });
    }

    const testOrder = new TestOrder({
      consultationId,
      patientNic,
      doctorId: req.user.id,
      hospitalId: hospitalId || consultation.sessionHospitalId || null,
      testName,
      testCategory,
      urgency: urgency || 'routine',
      instructions,
      isSurgeryRelated: isSurgeryRelated || false,
      surgeryNotes: isSurgeryRelated ? surgeryNotes : undefined,
      status: 'ordered',
    });

    await testOrder.save();
    return res.status(201).json({ message: 'Test ordered successfully', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to order test' });
  }
};

exports.getPatientTests = async (req, res) => {
  try {
    const { nic } = req.params;

    // Patients can only view their own tests — verify against authenticated patient record
    if (req.user.role === 'patient') {
      const Patient = require('../models/Patient');
      let authNic = null;
      if (req.user.id) {
        const authPatient = await Patient.findById(req.user.id);
        if (authPatient) {
          if (typeof authPatient.decryptFieldsSync === 'function') {
            authPatient.decryptFieldsSync();
          }
          if (authPatient.nic) {
            authNic = authPatient.nic;
          }
        }
      }
      if (!authNic || String(authNic).trim().toUpperCase() !== String(nic || '').trim().toUpperCase()) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const crypto = require('crypto');
    const LabTest = require('../models/LabTest');
    const patientNic_bi = crypto.createHash('sha256').update(nic.trim()).digest('hex');

    if (req.user.role === 'doctor') {
      if (!req.headers['x-patient-access'] && !req.headers['x-patient-access-token']) return res.status(403).json({ error: 'Patient consent required' });
      const decision = await require('./patientController').verifyDoctorPatientAuthorization(req, nic, patientNic_bi);
      if (!decision?.authorized || decision.mode !== 'patient_otp_consent') return res.status(403).json({ error: 'Patient consent required' });
    } else if (!['patient', 'hospital_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const tests = await LabTest.find({ ...nicFilter(nic), ...(req.user.role === 'hospital_admin' ? { hospitalId: req.user.id } : {}) })
      .sort({ createdAt: -1 });

    const sanitizedTests = tests.map((t) => {
      const obj = typeof t.toObject === 'function' ? t.toObject() : { ...t };
      delete obj.reportPath;
      delete obj.reportPublicId;
      delete obj.encryptedFileKey;
      delete obj.fileIV;
      delete obj.patientNic;
      delete obj.patientEmail;
      delete obj.keyVersion;
      Object.keys(obj).forEach((k) => {
        if (k.startsWith('__enc_')) delete obj[k];
      });
      return obj;
    });

    return res.json({ data: sanitizedTests });
  } catch (error) {
    console.error('[TEST CONTROLLER] Patient test lookup failed.');
    return res.status(500).json({ error: 'Failed to fetch tests' });
  }
};

exports.getConsultationTests = async (req, res) => {
  try {
    const { id } = req.params;

    if (!['doctor', 'hospital_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const scope = req.user.role === 'doctor' ? { doctorId: req.user.id } : { hospitalId: req.user.id };
    const tests = await TestOrder.find({ consultationId: id, ...scope })
      .populate('doctorId', 'fullName')
      .sort({ orderedAt: -1 });

    return res.json({ data: tests.map(record => {
      const data = record.toObject ? record.toObject() : { ...record };
      for (const field of ['resultFileUrl', 'resultCloudinaryId', 'patientNic', 'keyVersion']) delete data[field];
      for (const field of Object.keys(data)) if (field.startsWith('__enc_')) delete data[field];
      return data;
    }) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch consultation tests' });
  }
};

exports.uploadTestResult = async (req, res) => {
  // Kept fail-closed for direct callers as well as the disabled HTTP route.
  return res.status(403).json({ error: 'Use the encrypted laboratory upload workflow' });
};

exports.updateTestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['ordered', 'sample_collected', 'processing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (req.user?.role !== 'hospital_admin') return res.status(403).json({ error: 'Access denied' });
    const testOrder = await TestOrder.findOne({ _id: id, hospitalId: req.user.id });
    if (!testOrder) return res.status(404).json({ error: 'Test order not found' });

    // Simple forward-only transition check
    const order = ['ordered', 'sample_collected', 'processing', 'completed'];
    const currentIdx = order.indexOf(testOrder.status);
    const newIdx = order.indexOf(status);
    if (currentIdx < 0 || newIdx < currentIdx) {
      return res.status(400).json({ error: 'Cannot move test backwards in status' });
    }

    const updated = await TestOrder.findOneAndUpdate({ _id: id, hospitalId: req.user.id, status: testOrder.status }, { $set: { status } }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ error: 'Test status changed; refresh before retrying' });
    return res.json({ message: 'Status updated', data: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update status' });
  }
};

exports.cancelTest = async (req, res) => {
  try {
    const { id } = req.params;

    const testOrder = await TestOrder.findOne({ _id: id, doctorId: req.user.id });
    if (!testOrder) return res.status(404).json({ error: 'Test order not found or not authorized' });

    if (testOrder.status !== 'ordered') {
      return res.status(400).json({ error: 'Only orders with status "ordered" can be cancelled' });
    }

    testOrder.status = 'cancelled';
    await testOrder.save();
    return res.json({ message: 'Test order cancelled', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to cancel test' });
  }
};

exports.getHospitalTests = async (req, res) => {
  try {
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = { hospitalId: hospital._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.urgency) filter.urgency = req.query.urgency;
    if (req.query.category) filter.testCategory = req.query.category;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.orderedAt = {};
      if (req.query.dateFrom) filter.orderedAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.orderedAt.$lte = new Date(req.query.dateTo);
    }
    
    const total = await TestOrder.countDocuments(filter);
    const tests = await TestOrder.find(filter)
      .populate('doctorId', 'fullName specialization doctorId')
      .sort({ orderedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({ data: tests, total, page, pages: Math.ceil(total/limit) });
  } catch (err) {
    console.error('Hospital test lookup failed.');
    res.status(500).json({ error: 'Failed to fetch hospital tests' });
  }
};

