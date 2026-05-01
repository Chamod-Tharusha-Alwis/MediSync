const axios = require('axios');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const { generateReceiptNumber } = require('../utils/generateReceiptNumber');

exports.getProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id).select('-password -otpSecret');
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    return res.json({ data: doctor });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName, specialization, contactInfo } = req.body;
    const doctor = await Doctor.findByIdAndUpdate(
      req.user.id,
      { $set: { fullName, specialization, contactInfo } },
      { new: true }
    ).select('-password -otpSecret');
    
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    return res.json({ message: 'Profile updated', data: doctor });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const workspaceId = req.query.hospitalId; 
    const isPersonal = !workspaceId;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const consultQuery = { doctorId };
    if (!isPersonal) consultQuery.sessionHospitalId = workspaceId;

    const todayConsultations = await Consultation.countDocuments({
      ...consultQuery,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const pendingFollowUps = await Consultation.countDocuments({
      ...consultQuery,
      isFollowUpRequired: true,
      followUpDate: { $gte: startOfDay }
    });

    const rxQuery = { doctorId };
    if (!isPersonal) rxQuery.hospitalId = workspaceId;

    const activeRx = await Prescription.countDocuments({
      ...rxQuery,
      status: 'issued'
    });

    const uniquePatients = await Consultation.distinct('patientNic', consultQuery);
    const totalPatients = uniquePatients.length;

    const recentConsultations = await Consultation.find(consultQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('patientNic', 'fullName') // Assuming some virtual or just returning the string if not ref
      .lean();

    return res.json({
      data: {
        todayConsultations,
        activeRx,
        totalPatients,
        pendingFollowUps,
        recentConsultations
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
};

exports.createConsultation = async (req, res) => {
  try {
    const { 
      patientNic, symptoms, icdCode, icdDescription, diagnosis,
      clinicalNotes, isFollowUpRequired, followUpDate,
      loginType, sessionHospitalId, prescriptions 
    } = req.body;

    const patient = await Patient.findOne({ nic: patientNic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Check allergies against prescription drug names
    const conflictWarnings = [];
    if (patient.allergies && patient.allergies.length > 0 && prescriptions && prescriptions.length > 0) {
      const patientAllergiesLower = patient.allergies.map(a => a.toLowerCase());
      for (let rx of prescriptions) {
        const drugName = rx.name || rx.drugName || '';
        if (patientAllergiesLower.includes(drugName.toLowerCase())) {
          conflictWarnings.push(`Patient is allergic to ${drugName}`);
        }
      }
    }

    // Create consultation
    const consultation = new Consultation({
      patientNic,
      doctorId: req.user.id,
      sessionHospitalId: loginType === 'hospital' ? sessionHospitalId : null,
      symptoms,
      icdCode,
      diagnosis,
      notes: clinicalNotes,
      isFollowUpRequired,
      followUpDate: isFollowUpRequired ? followUpDate : null
    });
    await consultation.save();

    // Create prescriptions - map to flat Prescription schema fields
    let createdPrescriptions = [];
    if (prescriptions && prescriptions.length > 0) {
      for (let rx of prescriptions) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (rx.durationDays || 30));
        
        const prescription = new Prescription({
          prescriptionId: generateReceiptNumber(),
          consultationId: consultation._id,
          patientNic,
          doctorId: req.user.id,
          hospitalId: loginType === 'hospital' ? sessionHospitalId : null,
          drugName: rx.name || rx.drugName,
          dosage: rx.dosage,
          frequency: rx.frequency,
          durationDays: rx.durationDays,
          expiresAt,
          status: 'issued'
        });
        await prescription.save();
        createdPrescriptions.push(prescription);
      }
    }

    // Async ML calls (don't block)
    const mlEngineUrl = process.env.ML_ENGINE_URL || 'http://localhost:5001';
    
    // 1. Predict disease tracking
    axios.post(`${mlEngineUrl}/api/ml/predict-disease`, { symptoms }).catch(e => console.error('ML predict error:', e.message));
    
    // 2. Ingest
    axios.post(`${mlEngineUrl}/ingest`, {
      district: patient.contactInfo?.district || 'Colombo',
      drugCategory: icdDescription || diagnosis,
      date: new Date().toISOString().split('T')[0]
    }).catch(e => console.error('ML ingest error:', e.message));

    return res.status(201).json({
      message: 'Consultation created successfully',
      data: {
        consultationId: consultation._id,
        prescriptions: createdPrescriptions,
        conflictWarnings
      }
    });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to create consultation', details: error.message });
  }
};

exports.getConsultations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const consultations = await Consultation.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Consultation.countDocuments({ doctorId: req.user.id });

    return res.json({
      data: consultations,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch consultations', details: error.message });
  }
};

exports.updateFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFollowUpRequired, followUpDate } = req.body;

    const consultation = await Consultation.findOneAndUpdate(
      { _id: id, doctorId: req.user.id },
      { $set: { isFollowUpRequired, followUpDate } },
      { new: true }
    );

    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    return res.json({ message: 'Follow-up updated', data: consultation });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update follow-up', details: error.message });
  }
};
