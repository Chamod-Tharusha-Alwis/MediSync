const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const { generateTempPassword, hashPassword } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerHospital = async (req, res) => {
  try {
    const { name, regNo, email, password, district, address, contactNo } = req.body;
    
    const existing = await Hospital.findOne({ $or: [{ email }, { regNo }] });
    if (existing) return res.status(400).json({ error: 'Hospital email or Registration Number already exists' });

    const hashedPassword = await hashPassword(password);
    const hospital = new Hospital({
      name, regNo, email, password: hashedPassword, district, address, phone: contactNo
    });

    await hospital.save();
    res.status(201).json({ message: 'Hospital registered successfully', data: { hospitalId: hospital._id } });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

exports.loginHospital = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const hospital = await Hospital.findOne({ email });
    if (!hospital) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, hospital.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = jwt.sign({ id: hospital._id, role: 'hospital_admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    res.json({ message: 'Login successful', data: { accessToken, role: 'hospital_admin', hospitalName: hospital.name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
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
    res.status(500).json({ error: 'Error fetching hospital stats', details: error.message });
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
    res.status(500).json({ error: 'Error fetching doctor roster', details: error.message });
  }
};

exports.addDoctor = async (req, res) => {
  try {
    const { licenseNo, email, orgEmail } = req.body;
    const hospitalId = req.user.id;

    if (!licenseNo && !email) return res.status(400).json({ error: 'Provide licenseNo or email' });

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });

    let doctor = null;
    if (licenseNo) {
      const allDoctors = await Doctor.find({});
      doctor = allDoctors.find(d => d.licenseNo === licenseNo);
    }
    if (!doctor && email) doctor = await Doctor.findOne({ email });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found in system.' });

    const alreadyLinked = doctor.orgLogins && doctor.orgLogins.some(org => org.hospitalId.toString() === hospitalId);
    if (alreadyLinked) return res.status(400).json({ error: 'Doctor already linked' });

    const tempPassword = generateTempPassword();
    const hashedTemp = await hashPassword(tempPassword);
    const assignedOrgEmail = orgEmail || doctor.email;

    doctor.orgLogins.push({ hospitalId, orgEmail: assignedOrgEmail, tempPassword: hashedTemp, mustChangePassword: true, isActive: true });
    if (!doctor.hospitals.some(h => h.toString() === hospitalId)) doctor.hospitals.push(hospitalId);
    await doctor.save();

    try {
      await emailService.sendTempPasswordEmail(assignedOrgEmail, doctor.fullName, tempPassword, `${process.env.CLIENT_URL}/doctor/login`, hospital.name);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    res.status(201).json({
      data: { doctorId: doctor._id, fullName: doctor.fullName, orgEmail: assignedOrgEmail, hospitalName: hospital.name },
      message: 'Doctor linked and email sent',
    });
  } catch (error) {
    res.status(500).json({ error: 'Error linking doctor', details: error.message });
  }
};

exports.toggleDoctorStatus = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const hospitalId = req.user.id;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const orgIndex = doctor.orgLogins.findIndex(org => org.hospitalId.toString() === hospitalId);
    if (orgIndex === -1) return res.status(400).json({ error: 'Doctor not linked' });

    doctor.orgLogins[orgIndex].isActive = !doctor.orgLogins[orgIndex].isActive;
    await doctor.save();
    res.json({ data: { isActive: doctor.orgLogins[orgIndex].isActive }, message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Error updating doctor status', details: error.message });
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
    res.status(500).json({ error: 'Error updating settings', details: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const hospital = await Hospital.findById(hospitalId).select('-password');
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ data: hospital, message: 'Profile fetched' });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching profile', details: error.message });
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
    res.status(500).json({ error: 'Failed to fetch patients', details: error.message });
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
    res.status(500).json({ error: 'Failed to update patient', details: error.message });
  }
};

exports.getHospitalStaff = async (req, res) => {
  try {
    const hospitalId = req.user.id;
    const staff = await Doctor.find({ 'workplaces.hospitalId': hospitalId }).select('-password');
    // Also support linkedHospital array if used instead
    const staffLinked = await Doctor.find({ linkedHospitals: hospitalId }).select('-password');
    
    // Combine and deduplicate
    const allStaff = [...staff, ...staffLinked];
    const uniqueStaff = Array.from(new Set(allStaff.map(s => s._id.toString())))
      .map(id => allStaff.find(s => s._id.toString() === id));
      
    res.json({ data: uniqueStaff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hospital staff', details: error.message });
  }
};
