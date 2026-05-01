const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { hashPassword, generateTempPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const { generateReceiptNumber } = require('../utils/generateReceiptNumber');

exports.registerPharmacy = async (req, res) => {
  try {
    const { pharmacyName, district, address, regNo, phone, adminName, adminEmail, adminPassword } = req.body;

    const existingPharmacy = await Pharmacy.findOne({ regNo });
    if (existingPharmacy) return res.status(400).json({ error: 'Pharmacy registration number already exists' });

    const existingStaff = await PharmacyStaff.findOne({ email: adminEmail });
    if (existingStaff) return res.status(400).json({ error: 'Admin email already registered' });

    const pharmacy = new Pharmacy({ name: pharmacyName, district, address, regNo, phone });
    await pharmacy.save();

    const hashedPassword = await hashPassword(adminPassword);
    const staff = new PharmacyStaff({
      fullName: adminName,
      email: adminEmail,
      password: hashedPassword,
      pharmacyId: pharmacy._id,
      role: 'pharmacy_admin',
      mustChangePassword: false
    });
    await staff.save();

    res.status(201).json({ message: 'Pharmacy registered successfully', data: { pharmacyId: pharmacy._id } });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

exports.loginPharmacy = async (req, res) => {
  try {
    const { email, password } = req.body;
    const staff = await PharmacyStaff.findOne({ email }).populate('pharmacyId');
    if (!staff || !staff.isActive) return res.status(401).json({ error: 'Invalid credentials or inactive account' });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (staff.mustChangePassword) {
      return res.json({ 
        message: 'Password change required', 
        data: { mustChangePassword: true, staffId: staff._id }
      });
    }

    const accessToken = jwt.sign({ id: staff._id, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.json({ message: 'Login successful', data: { accessToken, role: staff.role, pharmacyName: staff.pharmacyId.name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

exports.changeFirstPassword = async (req, res) => {
  try {
    const { staffId, newPassword } = req.body;
    const staff = await PharmacyStaff.findById(staffId);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 2) return res.status(400).json({ error: 'Password too weak' });

    staff.password = await hashPassword(newPassword);
    staff.mustChangePassword = false;
    await staff.save();

    res.json({ message: 'Password changed successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed', details: error.message });
  }
};

exports.addStaff = async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const admin = await PharmacyStaff.findById(req.user.id).populate('pharmacyId');
    if (admin.role !== 'pharmacy_admin') return res.status(403).json({ error: 'Only admins can add staff' });

    const existing = await PharmacyStaff.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);

    const staff = new PharmacyStaff({
      fullName: name,
      email,
      password: hashedPassword,
      pharmacyId: admin.pharmacyId._id,
      role: role || 'pharmacist',
      mustChangePassword: true
    });
    await staff.save();

    await emailService.sendTempPasswordEmail(email, name, tempPassword, `${process.env.CLIENT_URL}/pharmacy/login`, admin.pharmacyId.name);

    res.status(201).json({ message: 'Staff added and email sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add staff', details: error.message });
  }
};

exports.getStaff = async (req, res) => {
  try {
    const admin = await PharmacyStaff.findById(req.user.id);
    const staff = await PharmacyStaff.find({ pharmacyId: admin.pharmacyId }).select('-password');
    res.json({ data: staff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get staff', details: error.message });
  }
};

exports.toggleStaffStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const staff = await PharmacyStaff.findById(id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    if (staff._id.toString() === req.user.id) return res.status(400).json({ error: 'Cannot toggle own status' });

    staff.isActive = !staff.isActive;
    await staff.save();
    res.json({ message: 'Status toggled', data: staff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle status', details: error.message });
  }
};

exports.getPendingPrescriptions = async (req, res) => {
  try {
    const { nic } = req.params;
    const prescriptions = await Prescription.find({ 
      patientNic: nic, 
      status: 'issued',
      expiresAt: { $gt: new Date() }
    }).populate('doctorId', 'fullName').populate('hospitalId', 'name');
    res.json({ data: prescriptions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prescriptions', details: error.message });
  }
};

exports.dispense = async (req, res) => {
  try {
    const { prescriptionId, patientNic, items, notes } = req.body;
    const staff = await PharmacyStaff.findById(req.user.id);
    
    const prescription = await Prescription.findOne({ prescriptionId });
    if (!prescription) return res.status(404).json({ error: 'Prescription not found' });
    if (prescription.status === 'dispensed') return res.status(400).json({ error: 'Already dispensed' });
    if (prescription.expiresAt < new Date()) return res.status(400).json({ error: 'Prescription expired' });

    const dispensing = new Dispensing({
      dispensingId: generateReceiptNumber(),
      prescriptionId: prescription._id,
      pharmacyId: staff.pharmacyId,
      pharmacistId: staff._id,
      patientNic,
      dispensedItems: items || prescription.medications.map(m => ({ drugName: m.name, quantity: m.durationDays })),
      notes
    });
    await dispensing.save();

    prescription.status = 'dispensed';
    prescription.dispensedAt = new Date();
    prescription.dispensedBy = staff.pharmacyId;
    await prescription.save();

    res.status(201).json({ message: 'Dispensed successfully', data: { receiptNumber: dispensing.dispensingId } });
  } catch (error) {
    res.status(500).json({ error: 'Dispensing failed', details: error.message });
  }
};

exports.getDispensingHistory = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const query = { pharmacyId: staff.pharmacyId };
    if (req.query.nic) query.patientNic = req.query.nic;

    const history = await Dispensing.find(query)
      .populate('pharmacistId', 'fullName')
      .populate({ path: 'prescriptionId', populate: { path: 'doctorId', select: 'fullName' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
      
    const total = await Dispensing.countDocuments(query);
    res.json({ data: history, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get history', details: error.message });
  }
};

exports.getReceipt = async (req, res) => {
  try {
    const { receiptNo } = req.params;
    const dispensing = await Dispensing.findOne({ dispensingId: receiptNo })
      .populate('pharmacyId', 'name address phone')
      .populate('pharmacistId', 'fullName')
      .populate({ path: 'prescriptionId', populate: { path: 'doctorId', select: 'fullName' } });
      
    if (!dispensing) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ data: dispensing });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch receipt', details: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

    const todayDispensed = await Dispensing.countDocuments({ pharmacyId: staff.pharmacyId, createdAt: { $gte: startOfDay } });
    const monthDispensed = await Dispensing.countDocuments({ pharmacyId: staff.pharmacyId, createdAt: { $gte: monthStart } });

    res.json({ data: { todayDispensed, monthDispensed } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
};
