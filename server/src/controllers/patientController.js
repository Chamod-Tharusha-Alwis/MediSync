const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const ConsultationRating = require('../models/ConsultationRating');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SessionToken = require('../models/SessionToken');
const { hashPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');

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

    const existing = await Patient.findOne({ $or: [{ nic }, { email: patientEmail }] });
    if (existing) {
      return res.status(400).json({ error: 'NIC or Email already registered' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid || strength.score < 2) {
      return res.status(400).json({ error: 'Password is too weak' });
    }

    const hashedPassword = await hashPassword(password);

    const patient = new Patient({
      nic,
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
      ipAddress: req.ip || req.connection.remoteAddress,
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
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

exports.loginPatient = async (req, res) => {
  try {
    const { nic, password } = req.body;

    const patient = await Patient.findOne({ nic });
    if (!patient) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: patient.nic }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    await SessionToken.create({
      userId: patient._id,
      userModel: 'Patient',
      tokenHash,
      deviceInfo: req.headers['user-agent'] || 'Unknown Device',
      ipAddress: req.ip || req.connection.remoteAddress,
      isValid: true,
      lastUsed: new Date()
    });

    return res.status(200).json({ 
      data: { accessToken, role: 'patient', nic: patient.nic, name: patient.fullName },
      message: "Login successful"
    });

  } catch (error) {
    return res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

exports.getPatient = async (req, res) => {
  try {
    const { nic } = req.params;
    
    // Role-based access control
    if (req.user.role === 'patient' && req.user.sub !== nic) {
      return res.status(403).json({ error: 'Access denied to other patient profiles' });
    }

    const patient = await Patient.findOne({ nic }).select('-password');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    
    const patientObj = patient.toObject();
    
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
    
    // Patient can only update own profile
    if (req.user.role === 'patient' && req.user.sub !== nic) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { bloodGroup, address, district, contactInfo, emergencyContact, chronicConditions, allergies } = req.body;
    const patient = await Patient.findOne({ nic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    if (bloodGroup) patient.bloodGroup = bloodGroup;
    if (address) patient.address = address;
    if (district) patient.district = district;
    if (contactInfo) patient.contactInfo = { ...patient.contactInfo, ...contactInfo };
    if (emergencyContact) patient.emergencyContact = { ...patient.emergencyContact, ...emergencyContact };
    if (chronicConditions) patient.chronicConditions = chronicConditions;
    if (allergies) patient.allergies = allergies;

    await patient.save();
    res.json({ message: 'Profile updated', data: patient });
  } catch (error) {
    res.status(500).json({ error: 'Update failed', details: error.message });
  }
};

exports.getTimeline = async (req, res) => {
  try {
    const { nic } = req.params;
    
    // Authorization
    if (req.user.role === 'patient' && req.user.sub !== nic) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const prescriptions = await Prescription.find({ patientNic: nic })
      .populate('doctorId', 'fullName specialization')
      .populate('hospitalId', 'name')
      .populate('dispensedBy', 'name')
      .sort({ issuedAt: -1 });

    const consultations = await Consultation.find({ patientNic: nic })
      .populate('doctorId', 'fullName specialization')
      .populate('sessionHospitalId', 'name')
      .sort({ createdAt: -1 });

    const timeline = [];
    
    consultations.forEach(c => {
      timeline.push({ type: 'consultation', date: c.createdAt, data: c });
    });
    
    prescriptions.forEach(p => {
      timeline.push({ type: 'prescription', date: p.issuedAt, data: p });
    });

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ data: timeline });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline', details: error.message });
  }
};

exports.rateConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (req.user.role !== 'patient') {
      return res.status(403).json({ error: 'Only patients can rate consultations' });
    }

    const consultation = await Consultation.findById(id);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    if (consultation.patientNic !== req.user.sub) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existingRating = await ConsultationRating.findOne({ consultationId: id, patientNic: req.user.sub });
    if (existingRating) {
      return res.status(400).json({ error: 'You have already rated this consultation' });
    }

    const newRating = new ConsultationRating({
      consultationId: id,
      patientNic: req.user.sub,
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