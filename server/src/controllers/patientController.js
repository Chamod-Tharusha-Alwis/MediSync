const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const LabTest = require('../models/LabTest');
const ConsultationRating = require('../models/ConsultationRating');
const Review = require('../models/Review');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SessionToken = require('../models/SessionToken');
const { hashPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const {
  incrementAttempts,
  getAttempts,
  clearAttempts,
  checkOtpRequestThrottle,
  recordOtpRequestSent,
} = require('../config/redis');
const { parseDeviceModel } = require('../utils/deviceParser');


exports.registerPatient = async (req, res) => {
  try {
    const { 
      nic, fullName, dateOfBirth, gender, district,
      bloodGroup, address, contactInfo, emergencyContact, 
      chronicConditions, allergies, password,
      email: directEmail
    } = req.body;

    // Accept email either at top level or nested in contactInfo
    const patientEmail = directEmail || contactInfo?.email;
    const patientPhone = contactInfo?.phone || contactInfo;

    if (!nic || !fullName || !dateOfBirth || !password || !patientEmail) {
      return res.status(400).json({ error: 'Required fields missing (nic, fullName, dateOfBirth, password, email)' });
    }

    const nicPattern = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
    if (!nicPattern.test(nic)) {
      return res.status(400).json({ error: 'Invalid NIC format. Use 9 digits + V/X or 12 digits.' });
    }

    const normalizedNic = nic.toUpperCase();

    const existing = await Patient.findOne({ $or: [{ nic: normalizedNic }, { email: patientEmail }] });
    if (existing) {
      return res.status(400).json({ error: 'NIC or Email already registered' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'Password is too weak. Must meet complexity requirements.' });
    }

    const hashedPassword = await hashPassword(password);

    const patient = new Patient({
      nic: normalizedNic,
      fullName,
      email: patientEmail,
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      district,
      contactInfo: patientPhone ? String(patientPhone) : undefined,
      emergencyContact,
      chronicConditions: chronicConditions || [],
      allergies: allergies || [],
      password: hashedPassword,
      riskScore: 0,
      riskLevel: 'low'
    });

    await patient.save();

    const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: patient.nic }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    await SessionToken.create({
      userId: patient._id,
      userModel: 'Patient',
      tokenHash,
      deviceInfo: req.headers['user-agent'] || 'Unknown Device',
      deviceFingerprint: req.headers['x-device-fingerprint'] || null,
      deviceModel: parseDeviceModel(req.headers['user-agent']),
      isValid: true,
      lastUsed: new Date()
    });

    try {
      await emailService.sendWelcomeEmail(patientEmail, fullName, 'patient');
    } catch (e) {
      console.error('Welcome email failed:', e.message);
    }

    res.status(201).json({ message: 'Patient registered successfully', data: { accessToken, role: 'patient', name: fullName, nic } });
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes('11000'))) {
      return res.status(400).json({ error: 'NIC or Email already registered' });
    }
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

exports.loginPatient = async (req, res) => {
  try {
    const authController = require('./authController');
    const identifier = req.body?.email || req.body?.identifier || req.body?.nic || '';
    req.body = {
      ...req.body,
      email: String(identifier).trim(),
      role: 'patient',
    };
    return await authController.login(req, res);
  } catch (error) {
    return res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

const stripEncryptionMetadata = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('__enc_') || key === 'keyVersion' || key === 'encryptedFileKey' || key === 'fileIV' || key === 'reportPath' || key === 'reportPublicId') {
      delete cleaned[key];
    }
  }
  return cleaned;
};

const resolveAuthenticatedPatientNic = async (reqUser) => {
  if (!reqUser) return null;
  if (reqUser.nic) return String(reqUser.nic).trim().toUpperCase();
  if (reqUser.id) {
    const doc = await Patient.findById(reqUser.id).select('nic');
    if (doc?.nic) return String(doc.nic).trim().toUpperCase();
  }
  if (reqUser.sub && String(reqUser.sub) !== String(reqUser.id)) {
    return String(reqUser.sub).trim().toUpperCase();
  }
  return null;
};

exports.getPatient = async (req, res) => {
  try {
    const { nic } = req.params;
    const normalizedNic = nic.toUpperCase();
    
    // Role-based access control against authenticated patient record
    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || authNic !== normalizedNic) {
        return res.status(403).json({ error: 'Access denied to other patient profiles' });
      }
    }

    const patient = await Patient.findOne({ nic: normalizedNic }).select('-password');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    
    const patientObj = stripEncryptionMetadata(patient.toObject());
    
    // Mask NIC in response if not the patient themselves or doctor
    if (req.user.role !== 'patient' && req.user.role !== 'doctor') {
      patientObj.nic = patientObj.nic.replace(/^(.{4})(.*)(.{2})$/, '$1****$3');
    }

    res.json({ data: patientObj });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patient', details: error.message });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const { nic } = req.params;
    const normalizedNic = nic.toUpperCase();
    
    // Patient can only update own profile
    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || authNic !== normalizedNic) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { bloodGroup, address, district, contactInfo, emergencyContact, chronicConditions, allergies } = req.body;
    const patient = await Patient.findOne({ nic: normalizedNic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    if (bloodGroup) patient.bloodGroup = bloodGroup;
    if (address) patient.address = address;
    if (district) patient.district = district;
    if (contactInfo) patient.contactInfo = { ...patient.contactInfo, ...contactInfo };
    if (emergencyContact) patient.emergencyContact = { ...patient.emergencyContact, ...emergencyContact };
    if (chronicConditions) patient.chronicConditions = chronicConditions;
    if (allergies) patient.allergies = allergies;

    await patient.save();
    res.json({ message: 'Profile updated', data: stripEncryptionMetadata(patient.toObject()) });
  } catch (error) {
    res.status(500).json({ error: 'Update failed', details: error.message });
  }
};

exports.getTimeline = async (req, res) => {
  try {
    // ── Primary identity: Patient._id from the JWT (never encrypted) ──────
    const patientMongoId = req.user.id;

    // ── Authorization against authenticated patient record ───────────────
    const nicParam = req.params.nic?.trim().toUpperCase();
    let targetNic  = nicParam;
    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || (nicParam && authNic !== nicParam)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      targetNic = authNic;
    }

    const targetHash = crypto.createHash('sha256').update(targetNic || '').digest('hex');

    const [myPrescriptions, myConsultations, myLabTests, myRatings, myReviews] = await Promise.all([
      Prescription.find({ patientNic_bi: targetHash })
        .populate('doctorId', 'fullName specialization')
        .populate('hospitalId', 'name')
        .populate('dispensedBy', 'name')
        .sort({ issuedAt: -1 }),

      Consultation.find({ patientNic_bi: targetHash })
        .populate('doctorId', 'fullName specialization')
        .populate('sessionHospitalId', 'name')
        .populate('hospitalId', 'name')
        .sort({ createdAt: -1 }),

      LabTest.find({ patientNic_bi: targetHash })
        .populate('referredBy', 'fullName specialization')
        .populate('hospitalId', 'name')
        .sort({ orderedAt: -1 }),

      ConsultationRating.find({ patientNic: targetNic }),

      Review.find({ reviewerId: patientMongoId })
    ]);

    const consultations = myConsultations;
    const prescriptions = myPrescriptions;
    const labTests = myLabTests;
    const ratings = myRatings;
    const reviews = myReviews;

    // Decrypt all documents
    consultations.forEach(c => {
      if (typeof c.decryptFieldsSync === 'function') {
        try { c.decryptFieldsSync(); } catch (e) {}
      }
    });
    prescriptions.forEach(p => {
      if (typeof p.decryptFieldsSync === 'function') {
        try { p.decryptFieldsSync(); } catch (e) {}
      }
    });
    labTests.forEach(l => {
      if (typeof l.decryptFieldsSync === 'function') {
        try { l.decryptFieldsSync(); } catch (e) {}
      }
    });

    const timeline = [];

    // Separate doctor-issued and OTC pharmacist dispensings
    const otcPrescriptions = prescriptions.filter(p => p.isOTC);
    const doctorPrescriptions = prescriptions.filter(p => !p.isOTC);

    // Map through consultations and embed their matching prescriptions
    consultations.forEach(c => {
      const cObj = stripEncryptionMetadata(c.toObject());
      
      cObj.prescriptions = doctorPrescriptions
        .filter(p => 
          (p.consultationId && p.consultationId.toString() === c._id.toString()) ||
          (p.consultationRef && c.consultationId && p.consultationRef === c.consultationId)
        )
        .map(p => stripEncryptionMetadata(p.toObject()));

      cObj.labTests = labTests
        .filter(l => 
          (l.consultationId && l.consultationId.toString() === c._id.toString()) ||
          (l.consultationRef && c.consultationId && l.consultationRef === c.consultationId)
        )
        .map(l => stripEncryptionMetadata(l.toObject()));

      const ratingObj = ratings.find(r => r.consultationId.toString() === c._id.toString());
      if (ratingObj) {
        cObj.rating = ratingObj.toObject();
      }

      // Append any Reviews submitted for this consultation
      cObj.reviews = reviews
        .filter(r => r.consultationId && r.consultationId.toString() === c._id.toString())
        .map(r => r.toObject());

      timeline.push({
        type: 'consultation',
        date: c.createdAt,
        data: cObj
      });
    });

    // Send back isOTC: true pharmacist dispensings as standalone events
    otcPrescriptions.forEach(p => {
      timeline.push({
        type: 'prescription',
        date: p.issuedAt || p.createdAt,
        data: stripEncryptionMetadata(p.toObject())
      });
    });

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ data: timeline });
  } catch (error) {
    console.error('[Timeline] ERROR:', error.message);
    res.status(500).json({ error: 'Failed to fetch timeline', details: error.message });
  }
};

exports.getPrescriptions = async (req, res) => {
  try {
    const nicParam = (req.params.nic || '').trim().toUpperCase();
    let targetNic = nicParam;
    
    // Authorization check against authenticated patient record
    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || (nicParam && authNic !== nicParam)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      targetNic = authNic;
    }

    const targetHash = crypto.createHash('sha256').update(targetNic).digest('hex');
    
    const myPrescriptions = await Prescription.find({
      $or: [
        { nicHash: targetHash },
        { patientNic_bi: targetHash }
      ]
    })
      .populate('doctorId', 'fullName specialization')
      .populate('hospitalId', 'name')
      .populate('dispensedBy', 'name')
      .sort({ createdAt: -1 });

    // Decrypt all documents
    const cleanedPrescriptions = myPrescriptions.map(p => {
      if (typeof p.decryptFieldsSync === 'function') {
        try { p.decryptFieldsSync(); } catch (e) {}
      }
      return stripEncryptionMetadata(p.toObject());
    });

    res.json({ data: cleanedPrescriptions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prescriptions', details: error.message });
  }
};

exports.rateConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (req.user.role !== 'patient') {
      return res.status(403).json({ error: 'Only patients can rate consultations' });
    }

    const authNic = await resolveAuthenticatedPatientNic(req.user);
    const consultation = await Consultation.findById(id);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    if (!authNic || consultation.patientNic.toUpperCase() !== authNic) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existingRating = await ConsultationRating.findOne({ consultationId: id, patientNic: authNic });
    if (existingRating) {
      return res.status(400).json({ error: 'You have already rated this consultation' });
    }

    const newRating = new ConsultationRating({
      consultationId: id,
      patientNic: authNic,
      doctorId: consultation.doctorId,
      rating,
      comment
    });

    await newRating.save();
    res.status(201).json({ message: 'Rating submitted successfully', data: newRating });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit rating', details: error.message });
  }
};

// ─── NEW: Request OTP-gated access to patient record ─────────────────────────
exports.requestPatientAccess = async (req, res) => {
  try {
    const { patientNic, requesterRole, requesterName } = req.body;

    const patient = await Patient.findOne({ nic: patientNic });
    // Always return same message to prevent enumeration
    if (!patient) {
      return res.status(200).json({ message: 'Verification sent if patient exists' });
    }

    if (!patient.email) {
      return res.status(400).json({ error: 'Patient has no registered email address for OTP verification' });
    }

    const patientAccessKey = 'patient-access:' + String(patient._id);
    const throttle = await checkOtpRequestThrottle(patientAccessKey, req.ip);
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        error: throttle.message,
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    const crypto = require('crypto');
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const OTPSession = require('../models/OTPSession');

    // Delete any existing unused OTP documents for this patient to prevent clutter
    await OTPSession.deleteMany({
      userId: patient._id,
      purpose: 'patient-access',
      used: false
    });

    const otpSession = await OTPSession.create({
      userId: patient._id,
      userModel: 'Patient',
      otp: hashedOtp,
      expiresAt,
      purpose: 'patient-access',
      metadata: { requesterRole, requesterName, accessNic: patientNic }
    });

    const emailResult = await emailService.sendOTPEmail(
      patient.email,
      patient.fullName,
      otp
    );

    if (!emailResult || !emailResult.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpSession._id });
      return res.status(emailResult?.statusCode || 503).json({
        error: 'Unable to deliver patient access OTP email right now. Please try again shortly.',
        message: 'Unable to deliver patient access OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(patientAccessKey, req.ip);

    return res.status(200).json({
      message: 'OTP sent to patient\'s registered contact',
      sessionId: otpSession._id,
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to request access', details: error.message });
  }
};

// ─── NEW: Verify patient access OTP ──────────────────────────────────────────
exports.verifyPatientAccess = async (req, res) => {
  try {
    const { sessionId, otp, patientNic } = req.body;
    const OTPSession = require('../models/OTPSession');
    const jwt = require('jsonwebtoken');

    const sessionAttempts = await getAttempts('patient:' + sessionId);
    if (sessionAttempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const otpRecord = await OTPSession.findOne({
      _id: sessionId,
      purpose: 'patient-access',
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      await incrementAttempts('patient:' + sessionId);
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    const patientAccessKey = 'patient-access:' + String(otpRecord.userId);
    const persistedFailures = Number(otpRecord._doc?.failedAttempts || otpRecord.failedAttempts || 0);
    if ((await getAttempts(patientAccessKey)) >= 5 || persistedFailures >= 5) {
      if (persistedFailures >= 5) {
        await OTPSession.updateOne({ _id: otpRecord._id }, { $set: { used: true } });
      }
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const isMatch = await bcrypt.compare(String(otp || '').trim(), otpRecord.otp);
    if (!isMatch) {
      const sAttempts = await incrementAttempts('patient:' + sessionId);
      const pAttempts = await incrementAttempts(patientAccessKey);
      const nextDocFailures = persistedFailures + 1;
      await OTPSession.collection.updateOne(
        { _id: otpRecord._id },
        {
          $inc: { failedAttempts: 1 },
          ...(sAttempts >= 5 || pAttempts >= 5 || nextDocFailures >= 5 ? { $set: { used: true } } : {}),
        }
      );
      return res.status(401).json({ error: 'Incorrect OTP' });
    }

    const claimedOtp = await OTPSession.findOneAndUpdate(
      { _id: otpRecord._id, used: false },
      { $set: { used: true } },
      { returnDocument: 'after' }
    );
    if (!claimedOtp) {
      return res.status(401).json({ error: 'OTP has already been used' });
    }

    await clearAttempts('patient:' + sessionId);
    await clearAttempts(patientAccessKey);

    // Issue a temporary 15-min patient-access token
    const accessToken = jwt.sign(
      { type: 'patient-access', nic: patientNic, grantedAt: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({ accessToken, patientNic });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify access', details: error.message });
  }
};

// ─── NEW: Report a doctor ─────────────────────────────────────────────────────
exports.reportUser = async (req, res) => {
  try {
    const { targetId, reason } = req.body;

    const patient = await Patient.findById(req.user.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    patient.reportedDoctors.push({
      doctorId: targetId,
      reason,
      reportedAt: new Date(),
      status: 'pending'
    });

    await patient.save();

    // Emit Socket.IO event to notify admins
    const io = req.app.get('io');
    if (io) {
      io.emit('new_report', { patientId: patient._id, doctorId: targetId, reason });
    }

    return res.status(201).json({ message: 'Report submitted. We will review it shortly.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to submit report', details: error.message });
  }
};

// ─── Patient self-service profile update (keyed off JWT — no NIC in URL) ──────
exports.updatePatientProfile = async (req, res) => {
  try {
    // req.user.sub = NIC embedded in the JWT at login / register time
    const normalizedNic = req.user.sub.toUpperCase();
    const patient = await Patient.findOne({ nic: normalizedNic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const {
      contactInfo,      // phone string
      bloodGroup,
      height,           // number (cm)
      weight,           // number (kg)
      allergies,        // string[] — replaces the whole array
      emergencyContact, // { name, relationship, phone }
    } = req.body;

    if (contactInfo !== undefined) patient.contactInfo = String(contactInfo);
    if (bloodGroup  !== undefined) patient.bloodGroup  = bloodGroup;
    if (height      !== undefined) patient.height      = Number(height);
    if (weight      !== undefined) patient.weight      = Number(weight);

    // Allergies: accept comma-separated string OR array
    if (allergies !== undefined) {
      patient.allergies = Array.isArray(allergies)
        ? allergies.map(a => a.trim()).filter(Boolean)
        : String(allergies).split(',').map(a => a.trim()).filter(Boolean);
    }

    // Merge emergency contact subfields (don't overwrite fields that aren't sent)
    if (emergencyContact) {
      patient.emergencyContact = {
        ...(patient.emergencyContact?.toObject?.() || patient.emergencyContact || {}),
        ...emergencyContact,
      };
    }

    await patient.save();

    // Strip password before returning
    const safe = patient.toObject();
    delete safe.password;

    res.json({ message: 'Profile updated successfully', data: safe });
  } catch (error) {
    res.status(500).json({ error: 'Profile update failed', details: error.message });
  }
};