const { nicFilter, writeNicFields } = require('../security/nicPersistence');
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
const { fields: profileFields, projectProfile, profileSelection } = require('../utils/patientProfilePolicy');


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

    const existing = await Patient.findOne({ $or: [nicFilter(normalizedNic, { plainFields: ['nic'] }), { email: patientEmail }] });
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
      ...writeNicFields(normalizedNic),
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
      await emailService.sendWelcomeEmail(patientEmail, fullName, 'patient', require('../services/recipientLanguageService').languageOptionsForRecord('Patient', patient));
    } catch (e) {
      console.error('Welcome email failed:');
    }

    res.status(201).json({ message: 'Patient registered successfully', data: { accessToken, role: 'patient', name: fullName, nic } });
  } catch (error) {
    if (error.code === 11000 || (error.message && error.message.includes('11000'))) {
      return res.status(400).json({ error: 'NIC or Email already registered' });
    }
    res.status(500).json({ error: 'Registration failed' });
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
    return res.status(500).json({ error: 'Login failed' });
  }
};

const stripEncryptionMetadata = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('__enc_') || key === 'keyVersion' || key === 'encryptedFileKey' || key === 'fileIV' || key === 'reportPath' || key === 'reportPublicId' || key === 'patientNic_hmac' || key === 'patientNic_bi' || key === 'nicHash') {
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
  const AuditLog = require('../models/AuditLog');
  const audit = outcome => AuditLog.create({actorId:String(req.user?.id || 'unknown'),actorRole:req.user?.role || 'unknown',
    action:`patient_profile:${outcome}`,accessedNic:'N/A',deviceModel:'N/A'});
  const deny = async () => { await audit('denied'); return res.status(403).json({error:'Access denied'}); };
  try {
    const normalizedNic = String(req.params.nic || '').trim().toUpperCase();
    const role = req.user?.role;
    if (!/^([0-9]{9}[VX]|[0-9]{12})$/.test(normalizedNic) || !profileFields[role]) return await deny();
    if (role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || authNic !== normalizedNic) return await deny();
    } else if (role === 'doctor') {
      const hash = crypto.createHash('sha256').update(normalizedNic).digest('hex');
      const authorization = await verifyDoctorPatientAuthorization(req, normalizedNic, hash);
      if (!authorization.authorized) return await deny();
    } else {
      // Account-management projection only, consistent with /admin/users.
      // Super-admin status is checked against the stored account, never the NIC.
      const admin = await Admin.findById(req.user.id).select('_id role isActive isSuperAdmin').lean();
      if (!admin || admin.isActive !== true || !['admin','super_admin'].includes(admin.role) ||
          (role === 'super_admin' && admin.isSuperAdmin !== true)) return await deny();
    }
    const patient = await Patient.findOne({ ...nicFilter(normalizedNic, { plainFields: ['nic'] }), ...(role === 'patient' ? {_id:req.user.id} : {}) }).select(profileSelection(role));
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    patient.decryptFieldsSync();
    await audit(role === 'admin' || role === 'super_admin' ? 'account_management_allowed' : 'clinical_allowed');
    return res.json({ data: projectProfile(patient, role) });
  } catch (error) {
    // Audit/authorization failures must not return a partially loaded profile.
    return res.status(503).json({ error: 'Profile access unavailable' });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    if (req.user?.role !== 'patient' || !req.user.id) return res.status(403).json({ error: 'Access denied' });
    const { validateProfileUpdate, applyProfileUpdate } = require('../security/patientProfileUpdate');
    const updates = validateProfileUpdate(req.body, { legacy: true });
    const normalizedNic = typeof req.params?.nic === 'string' ? req.params.nic.trim().toUpperCase() : '';
    const authNic = await resolveAuthenticatedPatientNic(req.user);
    if (!authNic || authNic !== normalizedNic) return res.status(403).json({ error: 'Access denied' });
    const patient = await Patient.findOne({ ...nicFilter(normalizedNic, { plainFields: ['nic'] }), _id: req.user.id });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    applyProfileUpdate(patient, updates);
    await patient.save();
    if (typeof patient.decryptFieldsSync === 'function') patient.decryptFieldsSync();
    res.json({ message: 'Profile updated', data: projectProfile(patient, 'patient') });
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ error: 'Invalid profile update' });
    res.status(500).json({ error: 'Update failed' });
  }
};

const Admin = require('../models/Admin');
const mongoose = require('mongoose');

const NIC_FORMAT_REGEX = /^([0-9]{9}[VX]|[0-9]{12})$/;
const ACTIVE_CONSULTATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const verifyDoctorPatientAuthorization = async (req, targetNic, targetHash) => {
  if (!req.user || req.user.role !== 'doctor' || !req.user.id) {
    return { authorized: false, reason: 'invalid_actor' };
  }

  // 1. Verify requesting doctor account is active and verified
  const doctor = await Doctor.findById(req.user.id).select('_id isActive isVerified role').lean();
  if (!doctor || doctor.role !== 'doctor' || doctor.isActive !== true || doctor.isVerified !== true) {
    return { authorized: false, reason: 'doctor_inactive_or_unverified' };
  }

  // 2. Resolve target patient unambiguously
  const matchingPatients = await Patient.find(nicFilter(targetNic, { plainFields: ['nic'] }))
    .select('_id nic patientNic_bi patientNic_hmac reportedDoctors')
    .lean();

  if (matchingPatients.length !== 1) {
    return { authorized: false, reason: matchingPatients.length === 0 ? 'patient_not_found' : 'ambiguous_patient' };
  }
  const targetPatient = matchingPatients[0];

  // 3. Deny immediately if the patient has reported/revoked this doctor
  const isRevokedByPatient = Array.isArray(targetPatient.reportedDoctors) &&
    targetPatient.reportedDoctors.some(
      (r) => r && String(r.doctorId) === String(req.user.id) && r.status !== 'dismissed'
    );
  if (isRevokedByPatient) {
    return { authorized: false, reason: 'relationship_revoked_by_patient' };
  }

  // 4. If an explicit patient-access consent token header is provided, validate it strictly (fail closed, never fall back)
  const primaryConsent = req.headers['x-patient-access'];
  const aliasConsent = req.headers['x-patient-access-token'];
  if (primaryConsent !== undefined && aliasConsent !== undefined && primaryConsent !== aliasConsent) {
    return { authorized:false, reason:'ambiguous_consent_headers' };
  }
  const rawConsentToken = primaryConsent !== undefined ? primaryConsent : aliasConsent;
  if (rawConsentToken !== undefined) {
    const tokenStr = String(rawConsentToken || '').trim();
    if (!tokenStr) {
      return { authorized: false, reason: 'empty_consent_token' };
    }
    let decodedConsent;
    try {
      decodedConsent = jwt.verify(tokenStr, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return { authorized: false, reason: 'expired_or_invalid_consent_token' };
    }

    // Fail closed if any required claim (type, nic, sessionId, requesterId, requesterRole, exp) is missing or mismatched
    if (
      !decodedConsent ||
      decodedConsent.type !== 'patient-access' ||
      !decodedConsent.nic ||
      String(decodedConsent.nic).trim().toUpperCase() !== targetNic ||
      !decodedConsent.sessionId ||
      !mongoose.Types.ObjectId.isValid(String(decodedConsent.sessionId)) ||
      !decodedConsent.requesterId ||
      !decodedConsent.requesterRole ||
      typeof decodedConsent.exp !== 'number'
    ) {
      return { authorized: false, reason: 'ambiguous_or_incomplete_consent_token' };
    }

    if (String(decodedConsent.requesterId) !== String(req.user.id)) {
      return { authorized: false, reason: 'consent_token_actor_mismatch' };
    }
    if (decodedConsent.requesterRole !== 'doctor') {
      return { authorized: false, reason: 'consent_token_role_mismatch' };
    }

    const OTPSession = require('../models/OTPSession');
    const otpSession = await OTPSession.findById(decodedConsent.sessionId).lean();

    // Fail closed if session is missing, not patient-access, unused, or if any consent metadata field is missing on older sessions
    if (
      !otpSession ||
      otpSession.purpose !== 'patient-access' ||
      otpSession.used !== true ||
      String(otpSession.userId) !== String(targetPatient._id) ||
      !otpSession.metadata ||
      !otpSession.metadata.requesterId ||
      String(otpSession.metadata.requesterId) !== String(req.user.id) ||
      otpSession.metadata.requesterRole !== 'doctor' ||
      !otpSession.metadata.accessNic ||
      String(otpSession.metadata.accessNic).trim().toUpperCase() !== targetNic ||
      !otpSession.metadata.accessExpiresAt ||
      !Number.isFinite(new Date(otpSession.metadata.accessExpiresAt).getTime()) ||
      new Date(otpSession.metadata.accessExpiresAt) <= new Date() ||
      otpSession.metadata.revoked === true
    ) {
      return { authorized: false, reason: 'consent_session_missing_metadata_revoked_or_expired' };
    }

    return { authorized: true, mode: 'patient_otp_consent', patientId: targetPatient._id, consentSessionId: decodedConsent.sessionId };
  }

  // 5. Otherwise, require an active, non-expired, non-revoked clinical consultation relationship
  const consultations = await Consultation.find({
    doctorId: req.user.id,
    $or: [
      { patientId: targetPatient._id },
      nicFilter(targetNic, { legacyFields: ['nicHash', 'patientNic_bi'] })
    ]
  })
    .select('_id status createdAt isFollowUpRequired followUpDate')
    .sort({ createdAt: -1 })
    .lean();

  if (!consultations || consultations.length === 0) {
    return { authorized: false, reason: 'missing_relationship' };
  }

  const nonRevokedConsultations = consultations.filter(
    (c) => c && c.status !== 'revoked' && c.status !== 'cancelled'
  );
  if (nonRevokedConsultations.length === 0) {
    return { authorized: false, reason: 'revoked_consultation_relationship' };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activeCutoff = new Date(now.getTime() - ACTIVE_CONSULTATION_WINDOW_MS);

  const hasActiveConsultation = nonRevokedConsultations.some((c) => {
    if (c.followUpDate && new Date(c.followUpDate) < startOfToday) {
      return false;
    }
    if (c.isFollowUpRequired && c.followUpDate && new Date(c.followUpDate) >= startOfToday) {
      return true;
    }
    return c.createdAt && new Date(c.createdAt) >= activeCutoff;
  });

  if (!hasActiveConsultation) {
    return { authorized: false, reason: 'expired_consultation_relationship' };
  }

  return { authorized: true, mode: 'active_clinical_consultation', patientId: targetPatient._id };
};

exports.verifyDoctorPatientAuthorization = verifyDoctorPatientAuthorization;

exports.getTimeline = async (req, res) => {
  try {
    if (!['patient', 'doctor'].includes(req.user?.role)) return res.status(403).json({ error: 'Access denied' });
    // ── Primary identity: Patient._id from the JWT (never encrypted) ──────
    const patientMongoId = req.user.id;

    // ── Authorization against authenticated patient record or doctor relationship ──
    const nicParam = req.params.nic?.trim().toUpperCase();
    if (!nicParam || !NIC_FORMAT_REGEX.test(nicParam)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let targetNic  = nicParam;
    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || (nicParam && authNic !== nicParam)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      targetNic = authNic;
    } else if (req.user.role === 'doctor') {
      const targetHashForAuth = crypto.createHash('sha256').update(targetNic).digest('hex');
      const authCheck = await verifyDoctorPatientAuthorization(req, targetNic, targetHashForAuth);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const targetHash = crypto.createHash('sha256').update(targetNic || '').digest('hex');

    const [myPrescriptions, myConsultations, myLabTests, myRatings, myReviews] = await Promise.all([
      Prescription.find(nicFilter(targetNic))
        .populate('doctorId', 'fullName specialization')
        .populate('hospitalId', 'name')
        .populate('dispensedBy', 'name')
        .sort({ issuedAt: -1 }),

      Consultation.find(nicFilter(targetNic))
        .populate('doctorId', 'fullName specialization')
        .populate('sessionHospitalId', 'name')
        .populate('hospitalId', 'name')
        .sort({ createdAt: -1 }),

      LabTest.find(nicFilter(targetNic))
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
    console.error('[Timeline] ERROR:');
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
};

exports.getPrescriptions = async (req, res) => {
  try {
    const nicParam = String(req.params.nic || '').trim().toUpperCase();
    if (!nicParam || !NIC_FORMAT_REGEX.test(nicParam)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let targetNic = nicParam;

    if (req.user.role === 'patient') {
      const authNic = await resolveAuthenticatedPatientNic(req.user);
      if (!authNic || authNic !== nicParam) {
        return res.status(403).json({ error: 'Access denied' });
      }
      targetNic = authNic;
    } else if (req.user.role === 'doctor') {
      const targetHashForAuth = crypto.createHash('sha256').update(targetNic).digest('hex');
      const authCheck = await verifyDoctorPatientAuthorization(req, targetNic, targetHashForAuth);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      const adminDoc = await Admin.findById(req.user.id).select('_id isActive role').lean();
      if (!adminDoc || adminDoc.isActive === false) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const targetHash = crypto.createHash('sha256').update(targetNic).digest('hex');

    const myPrescriptions = await Prescription.find(nicFilter(targetNic, { legacyFields: ['nicHash', 'patientNic_bi'] }))
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
    res.status(500).json({ error: 'Failed to fetch prescriptions' });
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
    res.status(500).json({ error: 'Failed to submit rating' });
  }
};

// ─── NEW: Request OTP-gated access to patient record ─────────────────────────
exports.requestPatientAccess = async (req, res) => {
  try {
    const { patientNic, requesterRole, requesterName } = req.body;

    const patient = await Patient.findOne(nicFilter(patientNic, { plainFields: ['nic'] }));
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

    const normalizedAccessNic = String(patientNic || '').trim().toUpperCase();
    const otpSession = await OTPSession.create({
      userId: patient._id,
      userModel: 'Patient',
      otp: hashedOtp,
      expiresAt,
      purpose: 'patient-access',
      metadata: {
        requesterId: String(req.user.id),
        requesterRole: req.user.role || requesterRole,
        requesterName,
        accessNic: normalizedAccessNic,
        revoked: false
      }
    });

    const emailResult = await emailService.sendOTPEmail(
      patient.email,
      patient.fullName,
      otp,
      require('../services/recipientLanguageService').languageOptionsForRecord('Patient', patient)
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
    return res.status(500).json({ error: 'Failed to request access' });
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

    // Fail closed if older OTPSession is missing required metadata bindings
    if (
      !otpRecord.metadata ||
      !otpRecord.metadata.requesterId ||
      String(otpRecord.metadata.requesterId) !== String(req.user.id) ||
      !otpRecord.metadata.requesterRole ||
      otpRecord.metadata.requesterRole !== req.user.role ||
      !otpRecord.metadata.accessNic
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const normalizedPatientNic = String(patientNic || '').trim().toUpperCase();
    if (
      !normalizedPatientNic ||
      String(otpRecord.metadata.accessNic).trim().toUpperCase() !== normalizedPatientNic
    ) {
      return res.status(403).json({ error: 'Access denied' });
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

    const accessGrantedAt = new Date();
    const accessExpiresAt = new Date(accessGrantedAt.getTime() + 15 * 60 * 1000);
    const claimedOtp = await OTPSession.findOneAndUpdate(
      { _id: otpRecord._id, userId: otpRecord.userId, purpose: 'patient-access', used: false, expiresAt: { $gt: accessGrantedAt }, failedAttempts: { $lt: 5 }, 'metadata.revoked': false },
      {
        $set: {
          used: true,
          expiresAt: accessExpiresAt,
          'metadata.accessGrantedAt': accessGrantedAt,
          'metadata.accessExpiresAt': accessExpiresAt
        }
      },
      { returnDocument: 'after' }
    );
    if (!claimedOtp) {
      return res.status(401).json({ error: 'OTP has already been used' });
    }

    await clearAttempts('patient:' + sessionId);
    await clearAttempts(patientAccessKey);

    // Issue a temporary 15-min patient-access token bound to the requesting actor and OTP session
    const accessToken = jwt.sign(
      {
        type: 'patient-access',
        nic: normalizedPatientNic,
        requesterId: String(req.user.id),
        requesterRole: req.user.role,
        sessionId: String(otpRecord._id),
        grantedAt: accessGrantedAt.getTime()
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({ accessToken, patientNic: normalizedPatientNic });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify access' });
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

    // Emit Socket.IO event to notify admins (role-scoped to prevent patient leakage)
    const io = req.app.get('io');
    if (typeof io?.emitToVerifiedAdmins === 'function') {
      await io.emitToVerifiedAdmins('new_report', { patientId: patient._id, doctorId: targetId });
    }

    return res.status(201).json({ message: 'Report submitted. We will review it shortly.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to submit report' });
  }
};

// ─── Patient self-service profile update (keyed off JWT — no NIC in URL) ──────
exports.verifyDoctorPatientAuthorization = verifyDoctorPatientAuthorization;

exports.updatePatientProfile = async (req, res) => {
  try {
    if (req.user?.role !== 'patient' || !req.user.id) return res.status(403).json({ error: 'Access denied' });
    const { validateProfileUpdate, applyProfileUpdate } = require('../security/patientProfileUpdate');
    const updates = validateProfileUpdate(req.body);
    // Stable account ownership is authoritative; an optional/stale NIC claim
    // must never choose the record receiving a self-service write.
    const patient = await Patient.findById(req.user.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    applyProfileUpdate(patient, updates);
    await patient.save();
    if (typeof patient.decryptFieldsSync === 'function') patient.decryptFieldsSync();
    res.json({ message: 'Profile updated successfully', data: projectProfile(patient, 'patient') });
  } catch (error) {
    if (error.code === 'PROFILE_INPUT_INVALID') return res.status(400).json({ error: 'Invalid profile update' });
    res.status(500).json({ error: 'Profile update failed' });
  }
};
