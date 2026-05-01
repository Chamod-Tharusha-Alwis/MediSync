const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const PharmacyStaff = require('../models/PharmacyStaff');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const AuditLog = require('../models/AuditLog');

exports.getSystemStats = async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments();
    const totalPatients = await Patient.countDocuments();
    const totalHospitals = await Hospital.countDocuments();
    const totalPharmacies = await PharmacyStaff.countDocuments({ role: 'pharmacy_admin' });
    const totalConsultations = await Consultation.countDocuments();
    const totalPrescriptions = await Prescription.countDocuments();

    const recentAuditLogs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      data: {
        totals: {
          totalDoctors,
          totalPatients,
          totalHospitals,
          totalPharmacies,
          totalConsultations,
          totalPrescriptions
        },
        recentAuditLogs
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system stats', details: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { role } = req.query;
    
    let users = [];
    let total = 0;

    if (!role || role === 'doctor') {
      const docs = await Doctor.find().select('fullName email doctorId specialization createdAt isActive role').lean();
      users.push(...docs);
    }
    if (!role || role === 'patient') {
      const pats = await Patient.find().select('fullName email nic district createdAt riskLevel role').lean();
      users.push(...pats);
    }
    if (!role || role === 'hospital_admin') {
      const hosps = await Hospital.find().select('name email regNo district createdAt role').lean();
      // add role field manually as hospital may not have one
      users.push(...hosps.map(h => ({ ...h, role: 'hospital_admin', fullName: h.name })));
    }

    total = users.length;
    // apply manual pagination after grouping
    users = users.sort((a, b) => b.createdAt - a.createdAt).slice((page - 1) * limit, page * limit);

    res.json({
      data: users,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId, role } = req.body;
    let user;

    if (role === 'doctor') {
      user = await Doctor.findById(userId);
    } else if (role === 'patient') {
      // For patients, we don't have an isActive field explicitly modeled yet, we can add it or ignore
      // But typically we can just block access by changing an isActive flag if we add one.
      // Let's assume we have or can just add it:
      user = await Patient.findById(userId);
    } else if (role === 'hospital_admin') {
      user = await Hospital.findById(userId);
    } else if (role === 'pharmacy_admin' || role === 'pharmacist') {
      user = await PharmacyStaff.findById(userId);
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Toggle isActive field (assuming we dynamically add it if not strictly enforced by schema, or schema supports it)
    user.isActive = user.isActive === false ? true : false;
    await user.save();

    res.json({ message: `User status toggled to ${user.isActive ? 'Active' : 'Inactive'}`, data: { isActive: user.isActive } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle status', details: error.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const { actorRole, startDate, endDate } = req.query;
    let query = {};

    if (actorRole) query.actorRole = actorRole;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(query);

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
};