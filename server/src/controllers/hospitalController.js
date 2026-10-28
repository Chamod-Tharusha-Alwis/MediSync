const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const SessionToken = require('../models/SessionToken');
const TrustedDevice = require('../models/TrustedDevice');
const { generateTempPassword, hashPassword } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

const parseDeviceModel = (ua, clientHw) => {
  if (clientHw && clientHw !== 'Unknown' && clientHw !== '""') return clientHw.replace(/"/g, '');
  if (!ua) return 'Unknown Device';
  if (ua.includes('iPhone')) return 'Apple iPhone';
  if (ua.includes('iPad')) return 'Apple iPad';
  if (ua.includes('Macintosh')) return 'MacBook / Mac Device';
  if (ua.includes('Windows')) return 'Windows PC (Desktop)';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux Workstation';
  return 'Unknown Device';
};

const resolveLocation = async (ip) => {
  try {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { isp: 'Local Network', country: 'Sri Lanka', city: 'Colombo', region: 'Western' };
    }
    const cleanIp = ip.includes(',') ? ip.split(',')[0].trim() : ip;
    const res = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,regionName,city,isp`, { timeout: 2500 });
    if (res.data && res.data.status === 'success') {
      return { isp: res.data.isp, country: res.data.country, city: res.data.city, region: res.data.regionName };
    }
  } catch (e) {}
  return { isp: 'Internet Service Provider', country: 'Sri Lanka', city: 'Colombo', region: 'Western' };
};

exports.registerHospital = async (req, res) => {
  try {
    const {
      name, regNo, district, address, contactNo, phone,
      // Support both direct-account fields (old) and admin-setup fields (new test format)
      email, password,
      adminEmail, adminPassword
    } = req.body;

    // Resolve the actual email and password (prefer admin* fields if present)
    const resolvedEmail    = adminEmail    || email;
    const resolvedPassword = adminPassword || password;

    if (!name || !regNo || !resolvedEmail || !resolvedPassword) {
      return res.status(400).json({ error: 'Required fields missing (name, regNo, email/adminEmail, password/adminPassword)' });
    }

    const existing = await Hospital.findOne({ $or: [{ email: resolvedEmail }, { regNo }] });
    if (existing) return res.status(400).json({ error: 'Hospital email or Registration Number already exists' });

    const hashedPassword = await hashPassword(resolvedPassword);
    const hospital = new Hospital({
      name, regNo,
      email: resolvedEmail,
      password: hashedPassword,
      district,
      address,
      phone: phone || contactNo || ''
    });

    await hospital.save();
    res.status(201).json({ message: 'Hospital registered successfully', data: { hospitalId: hospital._id } });
  } catch (error) {
    console.error('Hospital registration unavailable.');
    if (error.code === 11000 || (error.message && error.message.includes('11000'))) {
      return res.status(400).json({ error: 'Hospital email or Registration Number already exists' });
    }
    res.status(500).json({ error: 'Registration failed', details: 'Request could not be completed.' });
  }
};

exports.loginHospital = async (req, res) => {
  try {
    const authController = require('./authController');
    const identifier = req.body?.email || req.body?.identifier || req.body?.regNo || '';
    req.body = {
      ...req.body,
      email: String(identifier).trim(),
      role: 'hospital_admin',
    };
    return await authController.login(req, res);
  } catch (error) {
    return res.status(500).json({ error: 'Login failed', details: 'Request could not be completed.' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const hospitalId = req.user.id;

    const allDoctors = await Doctor.find({ 'orgLogins.hospitalId': hospitalId });
    const totalDoctors = allDoctors.length;
    const activeDoctors = allDoctors.filter(d => d.orgLogins.some(org => org.hospitalId.toString() === hospitalId && org.isActive)).length;
    const inactiveDoctors = totalDoctors - activeDoctors;

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    const consultationsToday = await Consultation.countDocuments({ sessionHospitalId: hospitalId, createdAt: { $gte: startOfDay } });
    const consultationsThisMonth = await Consultation.countDocuments({ sessionHospitalId: hospitalId, createdAt: { $gte: startOfMonth } });
    const totalConsultations = await Consultation.countDocuments({ sessionHospitalId: hospitalId });

    const doctorIds = allDoctors.map(d => d._id);
    const prescriptionsToday = await Prescription.countDocuments({ doctorId: { $in: doctorIds }, issuedAt: { $gte: startOfDay } });

    res.json({
      data: { totalDoctors, activeDoctors, inactiveDoctors, consultationsToday, consultationsThisMonth, totalConsultations, prescriptionsToday },
      message: 'Hospital stats fetched successfully',
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching hospital stats', details: 'Request could not be completed.' });
  }
};

exports.getDoctors = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const doctors = await Doctor.find({ 'orgLogins.hospitalId': hospitalId }).select('fullName doctorId specialization email orgLogins createdAt');
    const formattedDoctors = doctors.map(d => {
      const orgEntry = d.orgLogins.find(o => o.hospitalId.toString() === hospitalId);
      return {
        _id: d._id, fullName: d.fullName, doctorId: d.doctorId, specialization: d.specialization || 'General Practice',
        orgEmail: orgEntry ? orgEntry.orgEmail : d.email, isActive: orgEntry ? orgEntry.isActive : false,
        mustChangePassword: orgEntry ? orgEntry.mustChangePassword : false, joinedAt: orgEntry ? orgEntry._id?.getTimestamp?.() : d.createdAt,
      };
    });
    res.json({ data: formattedDoctors, message: 'Doctor roster fetched successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching doctor roster', details: 'Request could not be completed.' });
  }
};

exports.addDoctor = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Invalid doctor link request' });
    const { doctorId, email, orgEmail, fullName, specialization, licenseNo, personalEmail } = req.body;
    if ([doctorId, email, orgEmail, fullName, specialization, licenseNo, personalEmail].some(value => value !== undefined && (typeof value !== 'string' || value.length > 200))) return res.status(400).json({ error: 'Invalid doctor link fields' });
    const hospitalId = req.user.id;

    if (!doctorId && !email && !personalEmail) {
      return res.status(400).json({ error: 'Provide doctorId, email, or personalEmail' });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });

    let doctor = null;
    if (doctorId) {
      doctor = await Doctor.findOne({ doctorId });
    }
    const searchEmail = email || personalEmail;
    if (!doctor && searchEmail) {
      doctor = await Doctor.findOne({ $or: [{ email: searchEmail }, { personalEmail: searchEmail }] });
    }

    if (doctor && (doctor.isActive !== true || doctor.isVerified !== true)) return res.status(403).json({ error: 'Doctor must be active and administrator verified before linking' });
    if (!doctor && (typeof licenseNo !== 'string' || licenseNo.trim().length < 3 || licenseNo.trim().length > 80)) return res.status(400).json({ error: 'A supplied professional licence number is required; administrator verification remains mandatory' });
    const tempPassword = generateTempPassword();
    const hashedTemp = await hashPassword(tempPassword);

    if (!doctor) {
      // If doctor does not exist, provision a new Hospital Doctor account
      if (!fullName || !searchEmail) {
        return res.status(400).json({ error: 'To create a new hospital doctor, fullName and personalEmail are required.' });
      }

      const newDoctorId = "DR-" + require('uuid').v4().slice(0, 8).toUpperCase();
      const targetPersonalEmail = personalEmail || searchEmail;
      const assignedOrgEmail = orgEmail || searchEmail;

      doctor = new Doctor({
        doctorId: newDoctorId,
        fullName,
        email: assignedOrgEmail,
        personalEmail: targetPersonalEmail,
        password: hashedTemp,
        licenseNo: licenseNo.trim(),
        isVerified: false,
        specialization: specialization || 'General Practice',
        role: 'doctor',
        loginType: 'hospital',
        hospitals: [hospitalId],
        orgLogins: [{
          hospitalId,
          orgEmail: assignedOrgEmail,
          tempPassword: hashedTemp,
          mustChangePassword: true,
          isActive: true
        }]
      });

      await doctor.save();

      try {
        const clientUrl = process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';
        await emailService.sendTempPasswordEmail(targetPersonalEmail, doctor.fullName, tempPassword, `${clientUrl}/doctor/login?type=hospital`, hospital.name, require('../services/recipientLanguageService').languageOptionsForRecord('Doctor', doctor));
      } catch (emailErr) {
        console.error('Doctor invitation provider unavailable.');
      }

      return res.status(201).json({
        data: { doctorId: doctor._id, fullName: doctor.fullName, orgEmail: assignedOrgEmail, personalEmail: targetPersonalEmail, hospitalName: hospital.name },
        verificationStatus: 'pending',
        message: 'Doctor account created pending administrator verification. Invitation delivery is not confirmed.',
      });
    }

    // Existing doctor link
    const alreadyLinked = doctor.orgLogins && doctor.orgLogins.some(org => org.hospitalId.toString() === hospitalId);
    if (alreadyLinked) return res.status(400).json({ error: 'Doctor already linked to this hospital' });

    const assignedOrgEmail = orgEmail || doctor.email;
    const targetEmail = doctor.personalEmail || doctor.email || assignedOrgEmail;

    doctor.orgLogins.push({ hospitalId, orgEmail: assignedOrgEmail, tempPassword: hashedTemp, mustChangePassword: true, isActive: true });
    if (!doctor.hospitals.some(h => h.toString() === hospitalId)) doctor.hospitals.push(hospitalId);
    await doctor.save();

    try {
      const clientUrl = process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';
      await emailService.sendTempPasswordEmail(targetEmail, doctor.fullName, tempPassword, `${clientUrl}/doctor/login?type=hospital`, hospital.name, require('../services/recipientLanguageService').languageOptionsForRecord('Doctor', doctor));
    } catch (emailErr) {
      console.error('Doctor invitation provider unavailable.');
    }

    res.status(201).json({
      data: { doctorId: doctor._id, fullName: doctor.fullName, orgEmail: assignedOrgEmail, hospitalName: hospital.name },
      message: 'Doctor linked. Invitation delivery is not confirmed.',
    });
  } catch (error) {
    res.status(503).json({ error: 'Doctor linking unavailable' });
  }
};

exports.toggleDoctorStatus = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const hospitalId = req.user.id;
    if (typeof doctorId !== 'string' || !/^[a-f0-9]{24}$/i.test(doctorId)) return res.status(400).json({ error: 'Invalid doctor identifier' });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const orgIndex = doctor.orgLogins.findIndex(org => org.hospitalId.toString() === hospitalId);
    if (orgIndex === -1) return res.status(400).json({ error: 'Doctor not linked' });

    doctor.orgLogins[orgIndex].isActive = !doctor.orgLogins[orgIndex].isActive;
    await doctor.save();
    res.json({ data: { isActive: doctor.orgLogins[orgIndex].isActive }, message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating doctor status' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const { address, district, emergencyHotline, email, name } = req.body;

    const allowedUpdates = {};
    if (address) allowedUpdates.address = address;
    if (district) allowedUpdates.district = district;
    if (name) allowedUpdates.name = name;
    if (emergencyHotline !== undefined) allowedUpdates.emergencyHotline = emergencyHotline;

    if (email) {
      const existing = await Hospital.findOne({ email, _id: { $ne: hospitalId } });
      if (existing) return res.status(400).json({ error: 'Email already used.' });
      allowedUpdates.email = email;
    }

    const updated = await Hospital.findByIdAndUpdate(hospitalId, { $set: allowedUpdates }, { new: true, runValidators: true }).select('-password');
    if (!updated) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ data: updated, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating settings', details: 'Request could not be completed.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const hospital = await Hospital.findById(hospitalId).select('-password');
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ data: hospital, message: 'Profile fetched' });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching profile', details: 'Request could not be completed.' });
  }
};

exports.getPatients = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    // Find unique patient NICs from consultations at this hospital
    const uniquePatientNics = await Consultation.distinct('patientNic', { sessionHospitalId: hospitalId });
    const patients = await Patient.find({ nic: { $in: uniquePatientNics } }).select('-password');
    
    res.json({ data: patients });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patients', details: 'Request could not be completed.' });
  }
};

exports.updatePatientRecords = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const { patientNic, ...updates } = req.body;

    // Check if patient actually visited this hospital
    const visited = await Consultation.findOne({ sessionHospitalId: hospitalId, patientNic });
    if (!visited) return res.status(403).json({ error: 'Patient has never visited this hospital' });

    const patient = await Patient.findOne({ nic: patientNic });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Restrict updates
    if (updates.chronicConditions) patient.chronicConditions = updates.chronicConditions;
    if (updates.allergies) patient.allergies = updates.allergies;
    
    await patient.save();
    res.json({ message: 'Patient medical records updated', data: patient });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update patient', details: 'Request could not be completed.' });
  }
};

exports.getHospitalStaff = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    const Doctor = require('../models/Doctor');
    const doctors = await Doctor.find({
      'orgLogins.hospitalId': hospital._id
    }).select('-password -otpSecret');
    const staffWithStatus = doctors.map(doc => {
      const orgLogin = doc.orgLogins.find(
        ol => ol.hospitalId.toString() === hospital._id.toString()
      );
      return {
        _id: doc._id,
        doctorId: doc.doctorId,
        fullName: doc.fullName,
        specialization: doc.specialization,
        email: doc.email,
        lastLogin: doc.lastLogin,
        isActive: orgLogin ? orgLogin.isActive : false,
        mustChangePassword: orgLogin ? orgLogin.mustChangePassword : false,
        orgEmail: orgLogin ? orgLogin.orgEmail : null
      };
    });
    res.json({ data: staffWithStatus });
  } catch (error) {
    console.error('Hospital staff lookup unavailable.');
    res.status(500).json({ error: 'Failed to fetch hospital staff', details: 'Request could not be completed.' });
  }
};

exports.getHospitalPatientHistory = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const { nic } = req.params;
    const normalizedNic = (nic || '').trim().toUpperCase();

    // Verify patient has consultation history at this hospital
    const consultations = await Consultation.find({
      sessionHospitalId: hospitalId,
      patientNic: normalizedNic
    }).sort({ createdAt: -1 });

    if (!consultations || consultations.length === 0) {
      return res.status(404).json({ error: 'No patient history found for this hospital.' });
    }

    const consultationIds = consultations.map(c => c._id);
    const prescriptions = await Prescription.find({ consultationId: { $in: consultationIds } });

    // Decrypt prescriptions
    prescriptions.forEach(p => {
      if (typeof p.decryptFieldsSync === 'function') {
        try { p.decryptFieldsSync(); } catch (e) {}
      }
    });

    res.json({
      data: {
        nic: normalizedNic,
        consultations,
        prescriptions
      },
      message: 'Hospital patient history fetched successfully'
    });
  } catch (error) {
    console.error('Hospital patient history unavailable.');
    res.status(500).json({ error: 'Failed to fetch hospital patient history', details: 'Request could not be completed.' });
  }
};
