const crypto = require('crypto');
const axios = require('axios');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const ConsultationRating = require('../models/ConsultationRating');
const { generateLockedPrescription } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');
const { sendEmail } = require('../utils/email');
const { checkAllergyConflict } = require('../utils/ingredientResolver');
const { validateMedicines, DurationError } = require('../utils/prescriptionDuration');
const { canonicalMedicationName, MedicationNameError } = require('../utils/medicationName');

exports.getProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id)
      .select('-password -otpSecret')
      .populate('hospitals', 'name location');
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const ratings = await ConsultationRating.aggregate([
      { $match: { doctorId: doctor._id } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    
    const doctorObj = doctor.toObject();
    if (ratings.length > 0) {
      doctorObj.averageRating = Number(ratings[0].avgRating.toFixed(1));
      doctorObj.ratingCount = ratings[0].count;
    } else {
      doctorObj.averageRating = 0;
      doctorObj.ratingCount = 0;
    }

    return res.json({ data: doctorObj });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
};

exports.updateDoctorProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Hospital-login doctors cannot edit profile fields directly (only password via /api/auth/change-password)
    if (doctor.loginType === 'hospital') {
      return res.status(403).json({
        error: 'Hospital-login doctors cannot edit professional profile fields. Please contact your Hospital Administrator.'
      });
    }

    const { fullName, specialization, contactNumber, personalEmail, clinicAddress } = req.body;
    if (fullName) doctor.fullName = fullName;
    if (specialization) doctor.specialization = specialization;
    if (contactNumber) doctor.contactNumber = contactNumber;
    if (personalEmail) doctor.personalEmail = personalEmail;
    if (clinicAddress) doctor.clinicAddress = clinicAddress;

    await doctor.save();
    
    const updated = doctor.toObject();
    delete updated.password;
    delete updated.otpSecret;

    return res.json({ message: 'Profile updated', data: updated });
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
      status: { $in: ['pending', 'issued'] }
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

// The route retains verified authentication, consent and duration admission.
exports.createConsultation = require('./clinicalCommandController').createConsultation;

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
      { returnDocument: 'after' }
    );

    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    return res.json({ message: 'Follow-up updated', data: consultation });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update follow-up', details: error.message });
  }
};

exports.predictDisease = async (req, res) => {
  try {
    const { symptoms } = req.body;
    const { generateToken } = require('../utils/internalAuth');

    const mlUrl = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';

    const mlRes = await axios.post(
      `${mlUrl}/api/ml/predict-disease`,
      { symptoms },
      {
        headers: { 'x-internal-key': generateToken() },
        timeout: 60000, // 60-second timeout for Render cold starts
      }
    );
    const { inferencePredictions } = require('../utils/inferenceResponse');
    return res.json({ availability: 'available', predictions: inferencePredictions(mlRes.data) });
  } catch (_) {
    return res.status(503).json({
      availability: 'unavailable',
      predictions: [],
      error: 'AI suggestions unavailable. Please use the existing manual diagnosis option.'
    });
  }
};

exports.getPatientDirectory = async (req, res) => {
  try {
    const consultations = await Consultation.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const uniqueNics = [...new Set(consultations.map(c => c.patientNic))];
    const patients = await Patient.find({ nic: { $in: uniqueNics } }).lean();
    
    // Fetch prescriptions for these consultations
    const consultationIds = consultations.map(c => c._id);
    const prescriptions = await Prescription.find({ consultationId: { $in: consultationIds } }).lean();

    // Map patients and prescriptions to consultations
    const data = consultations.map(c => {
      const patient = patients.find(p => p.nic === c.patientNic);
      const rx = prescriptions.filter(p => String(p.consultationId) === String(c._id));
      return {
        ...c,
        patientName: patient ? patient.fullName : 'Unknown Patient',
        patientDetails: patient || null,
        prescriptions: rx
      };
    });

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch patient directory', details: error.message });
  }
};
