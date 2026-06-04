const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const PharmacyStaff = require('../models/PharmacyStaff');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const AuditLog = require('../models/AuditLog');
const BanRecord = require('../models/BanRecord');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { hashPassword } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const { generateToken } = require('../utils/internalAuth');

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001';
const ML_TIMEOUT = 30000; // 30 seconds

// ─── EXISTING: getSystemStats ─────────────────────────────────────────────────
exports.getSystemStats = async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments({ role: 'doctor' });
    const totalPatients = await Patient.countDocuments();
    const totalHospitals = await Hospital.countDocuments();
    const totalPharmacies = await PharmacyStaff.countDocuments({ role: 'pharmacy_admin' });
    const totalConsultations = await Consultation.countDocuments();
    const totalPrescriptions = await Prescription.countDocuments();

    const recentAuditLogs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(10);

    res.json({
      data: {
        totalDoctors,
        totalPatients,
        totalHospitals,
        totalPharmacies,
        totalConsultations,
        totalPrescriptions,
        recentAuditLogs
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system stats', details: error.message });
  }
};

// ─── EXISTING: getAllUsers ────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { role } = req.query;

    let users = [];

    if (!role || role === 'doctor') {
      const docs = await Doctor.find({ role: { $in: ['doctor'] } })
        .select('fullName email doctorId specialization createdAt isActive role').lean();
      users.push(...docs);
    }
    if (!role || role === 'patient') {
      const pats = await Patient.find()
        .select('fullName email nic district createdAt riskLevel isActive').lean();
      users.push(...pats.map(p => ({ ...p, role: 'patient' })));
    }
    if (!role || role === 'hospital_admin') {
      const hosps = await Hospital.find()
        .select('name email regNo district createdAt isActive').lean();
      users.push(...hosps.map(h => ({ ...h, role: 'hospital_admin', fullName: h.name })));
    }
    if (!role || role === 'admin') {
      const admins = await Doctor.find({ role: { $in: ['admin', 'super_admin'] } })
        .select('fullName email doctorId createdAt isActive role isSuperAdmin').lean();
      users.push(...admins);
    }

    const total = users.length;
    users = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);

    res.json({ data: users, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
};

// ─── EXISTING: toggleUserStatus ──────────────────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId, role } = req.body;
    let user;

    if (role === 'doctor' || role === 'admin') user = await Doctor.findById(userId);
    else if (role === 'patient') user = await Patient.findById(userId);
    else if (role === 'hospital_admin') user = await Hospital.findById(userId);
    else if (role === 'pharmacy_admin' || role === 'pharmacist') user = await PharmacyStaff.findById(userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isActive = user.isActive === false ? true : false;
    await user.save();

    res.json({ message: `User status set to ${user.isActive ? 'Active' : 'Inactive'}`, data: { isActive: user.isActive } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle status', details: error.message });
  }
};

// ─── EXISTING: getAuditLogs ──────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { actorRole, startDate, endDate } = req.query;

    let query = {};
    if (actorRole) query.actorRole = actorRole;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit);
    const total = await AuditLog.countDocuments(query);

    res.json({ data: logs, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
};

// ─── NEW: ML — triggerMLDetection ────────────────────────────────────────────
exports.triggerMLDetection = async (req, res) => {
  try {
    const now = new Date();

    // Time windows
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Fetch last 30 days — NO .lean() so mongoose-field-encryption decrypts 'diagnosis' automatically
    const recentConsultations = await Consultation.find({ createdAt: { $gte: thirtyDaysAgo } });

    if (recentConsultations.length === 0) {
      // No real data — fall back to Prophet prediction for demo
      const { data } = await axios.post(
        `${process.env.ML_ENGINE_URL || 'http://localhost:5001'}/api/ml/predict-outbreak`,
        { district: req.body?.district || 'Colombo' },
        { 
          timeout: ML_TIMEOUT,
          headers: { 'x-internal-key': generateToken() }
        }
      );
      return res.json({
        disease:          data.disease        || 'Dengue',
        district:         data.district       || 'Colombo',
        z_score:          data.z_score        ?? 0,
        anomaly:          data.anomaly        || false,
        severity:         data.severity       || 'low',
        historical_mean:  data.historical_mean|| 0,
        historical_std:   data.historical_std || 0,
        data_points:      data.data_points    || 0,
        forecast:         data.forecast       || [],
        status:           data.status         || 'normal',
        model:            data.model          || 'Prophet',
        source:           'prophet_fallback'
      });
    }

    const aggregatedData = {};
    recentConsultations.forEach(c => {
      const disease = c.diagnosis || c.icdDescription || 'Unknown';
      const district = c.district || 'Colombo';
      const key = `${district}_${disease}`;

      if (!aggregatedData[key]) {
        aggregatedData[key] = { district, disease, last_7_days_count: 0, previous_baseline_avg: 0 };
      }

      // Bucket into recent (7 days) or baseline (older 23 days)
      if (c.createdAt >= sevenDaysAgo) {
        aggregatedData[key].last_7_days_count += 1;
      } else {
        aggregatedData[key].previous_baseline_avg += 1;
      }
    });

    // Convert the 23-day baseline count into a weekly average
    const payload = Object.values(aggregatedData).map(item => {
      item.previous_baseline_avg = Math.round(item.previous_baseline_avg / 3.29); 
      return item;
    });

    // Send as direct array payload to new route
    const { data } = await axios.post(
      `${process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001'}/api/admin/outbreak/trigger`, 
      payload, 
      { 
        timeout: 30000,
        headers: { 'x-internal-key': generateToken() }
      }
    );

    // 5. If anomaly detected, save an OutbreakAlert record and emit Socket event
    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results) {
        if (result.anomaly) {
          // --- DB SAVE (own try/catch so email still fires if this fails) ---
          try {
            const OutbreakAlert = require('../models/OutbreakAlert');
            // Map severity to valid schema enum: ['Low', 'Moderate', 'High', 'Critical']
            const severityMap = { 'low': 'Low', 'medium': 'Moderate', 'high': 'High' };
            const mappedSeverity = severityMap[result.severity] || 'High';

            const alert = await OutbreakAlert.create({
              disease:        result.disease || 'Unknown',
              location:       result.district || 'Nationwide',
              affectedCount:  result.latest_actual || 0,
              severity:       mappedSeverity,
              status:         'Active',
              message:        `Real-time outbreak detected: ${result.disease} in ${result.district}.`
            });
            const io = require('../app').get?.('io');
            if (io) io.emit('outbreak_alert', alert);
          } catch (dbErr) {
            console.error('[Admin] Alert DB save failed:', dbErr.message);
          }

          // --- MASS EMAIL TRIGGER (own try/catch — independent of DB save) ---
          if (result.severity === 'medium' || result.severity === 'high') {
            try {
              const Patient = require('../models/Patient');
              const Doctor = require('../models/Doctor');
              const PharmacyStaff = require('../models/PharmacyStaff');
              const Hospital = require('../models/Hospital');
              const emailService = require('../utils/emailService');

              // Collect all emails
              const [patients, doctors, pharmacists, hospitals] = await Promise.all([
                Patient.find({}).select('email contactInfo'),
                Doctor.find({}).select('email'),
                PharmacyStaff.find({}).select('email'),
                Hospital.find({}).select('email')
              ]);

              const allEmails = [
                ...patients.map(p => p.email || p.contactInfo?.email),
                ...doctors.map(d => d.email),
                ...pharmacists.map(p => p.email),
                ...hospitals.map(h => h.email)
              ].filter(e => e);

              const emailResult = await emailService.sendMassOutbreakAlert(
                allEmails,
                result.disease,
                result.district,
                result.severity,
                Math.round(((result.latest_actual - result.baseline) / (result.baseline || 1)) * 100)
              );
            } catch (emailErr) {
              console.error('[Admin] Mass email trigger failed:', emailErr.message);
            }

            // --- BROADCAST RECORD (own try/catch) ---
            try {
              const BroadcastMessage = require('../models/BroadcastMessage');
              const broadcast = new BroadcastMessage({
                title: `CRITICAL OUTBREAK ALERT`,
                message: `A ${result.severity} risk outbreak of ${result.disease} has been detected in ${result.district}. Please take immediate precautions.`,
                targetRole: 'all',
                targetDistrict: result.district,
                sentBy: req.user ? req.user.id : null,
                sentAt: new Date()
              });
              await broadcast.save();
            } catch (broadcastErr) {
              console.error('[Admin] Broadcast save failed:', broadcastErr.message);
            }
          }
        }
      }
    }

    // 6. Return enriched response to the frontend
    res.json({
      results: data.results || [],
      consultations_analysed: recentConsultations.length,
      model: 'Real-time DB Aggregation + Threshold Analysis',
      source: 'live_data',
      data_points: recentConsultations.length
    });

  } catch (err) {
    console.error('[Admin] ML trigger error:', err.message);
    console.error('[FATAL] ML Engine API Failed:', err.response ? err.response.data : err.message);
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'ML Engine is offline' });
    }
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'ML Engine timed out' });
    }
    return res.status(500).json({ error: err.response ? err.response.data.error || 'ML Engine Error' : err.message });
  }
};

// ─── NEW: ML — getMLStatus ───────────────────────────────────────────────────
exports.getMLStatus = async (req, res) => {
  try {
    const { data } = await axios.get(`${ML_ENGINE_URL}/model-status`, { 
      timeout: ML_TIMEOUT,
      headers: { 'x-internal-key': generateToken() }
    });
    return res.json({
      status: data.status || 'active',
      lastTrained: data.lastTrained || data.last_trained || null,
      dataPoints: data.dataPoints || data.data_points || 0,
      nextRun: data.nextScheduledRun || 'Every 6 hours',
      totalAlerts: data.totalAlertsTriggered || 0,
      modelType: data.modelType || (data.models?.diseasePrediction) || 'TF-IDF + Cosine Similarity'
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
      return res.status(503).json({ status: 'offline', message: 'ML engine is not reachable' });
    }
    return res.status(503).json({ status: 'offline', error: err.message });
  }
};

// ─── NEW: BAN USER ────────────────────────────────────────────────────────────
exports.banUser = async (req, res) => {
  try {
    const { targetId, targetModel, banType, reason, expiresAt } = req.body;

    if (!targetId || !targetModel || !banType || !reason) {
      return res.status(400).json({ error: 'targetId, targetModel, banType, and reason are required' });
    }

    // Find the target user
    let targetUser;
    if (targetModel === 'Doctor') targetUser = await Doctor.findById(targetId);
    else if (targetModel === 'Patient') targetUser = await Patient.findById(targetId);
    else if (targetModel === 'PharmacyStaff') targetUser = await PharmacyStaff.findById(targetId);
    else if (targetModel === 'Hospital') targetUser = await Hospital.findById(targetId);

    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const banRecord = new BanRecord({
      targetId,
      targetModel,
      targetName: targetUser.fullName || targetUser.name,
      targetEmail: targetUser.email,
      banType,
      reason,
      bannedBy: req.user.id,
      bannedAt: new Date(),
      expiresAt: banType === 'temporary' ? (expiresAt ? new Date(expiresAt) : null) : null,
      isActive: true,
    });

    await banRecord.save();

    // Mark user as inactive
    targetUser.isActive = false;
    await targetUser.save();

    // Notify user via email
    if (targetUser.email) {
      const expMsg = banType === 'temporary' && expiresAt
        ? `until ${new Date(expiresAt).toLocaleDateString()}`
        : 'permanently';
      emailService.sendWelcomeEmail(targetUser.email, targetUser.fullName || 'User', 'banned')
        .catch(e => console.error('Ban email failed:', e.message));
    }

    return res.status(201).json({ message: 'User banned successfully', data: banRecord });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to ban user', details: error.message });
  }
};

// ─── NEW: LIFT BAN ────────────────────────────────────────────────────────────
exports.liftBan = async (req, res) => {
  try {
    const { id } = req.params;
    const { liftReason } = req.body;

    const banRecord = await BanRecord.findById(id);
    if (!banRecord) return res.status(404).json({ error: 'Ban record not found' });

    banRecord.isActive = false;
    banRecord.liftedAt = new Date();
    banRecord.liftedBy = req.user.id;
    banRecord.liftReason = liftReason || '';
    await banRecord.save();

    // Reactivate user
    let user;
    if (banRecord.targetModel === 'Doctor') user = await Doctor.findById(banRecord.targetId);
    else if (banRecord.targetModel === 'Patient') user = await Patient.findById(banRecord.targetId);
    else if (banRecord.targetModel === 'PharmacyStaff') user = await PharmacyStaff.findById(banRecord.targetId);
    else if (banRecord.targetModel === 'Hospital') user = await Hospital.findById(banRecord.targetId);

    if (user) {
      user.isActive = true;
      await user.save();
    }

    return res.json({ message: 'Ban lifted successfully', data: banRecord });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to lift ban', details: error.message });
  }
};

// ─── NEW: GET ACTIVE BANS ────────────────────────────────────────────────────────
exports.getActiveBans = async (req, res) => {
  try {
    const bans = await BanRecord.find({
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })
      .populate('bannedBy', 'fullName email')
      .populate('liftedBy', 'fullName')
      .sort({ bannedAt: -1 });
    res.json({ data: bans });
  } catch (err) {
    console.error('getActiveBans:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── NEW: GET ALL BANS ────────────────────────────────────────────────────────
exports.getBans = async (req, res) => {
  try {
    const { isActive, banType, targetModel } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (banType) query.banType = banType;
    if (targetModel) query.targetModel = targetModel;

    const bans = await BanRecord.find(query)
      .populate('bannedBy', 'fullName email')
      .populate('liftedBy', 'fullName')
      .sort({ bannedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BanRecord.countDocuments(query);
    return res.json({ data: bans, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch bans', details: error.message });
  }
};

// ─── NEW: ADD ADMIN ───────────────────────────────────────────────────────────
exports.addAdmin = async (req, res) => {
  try {
    if (!req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can add new admins' });
    }

    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'fullName, email, and password are required' });
    }

    const existing = await Doctor.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await hashPassword(password);
    const adminId = 'ADMIN-' + uuid().slice(0, 8).toUpperCase();

    const newAdmin = new Doctor({
      doctorId: adminId,
      fullName,
      email,
      password: hashedPassword,
      licenseNo: `ADMIN-${adminId}`,
      specialization: 'System Administration',
      role: 'admin',
      isSuperAdmin: false,
      isActive: true,
    });

    await newAdmin.save();

    emailService.sendWelcomeEmail(email, fullName, 'admin').catch(() => {});

    return res.status(201).json({
      message: 'Admin created successfully',
      data: { doctorId: adminId, fullName, email, role: 'admin' }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create admin', details: error.message });
  }
};

// ─── NEW: GET PATIENT REPORTS ─────────────────────────────────────────────────
exports.getPatientReports = async (req, res) => {
  try {
    const { status } = req.query;

    const pipeline = [
      { $unwind: '$reportedDoctors' },
      ...(status ? [{ $match: { 'reportedDoctors.status': status } }] : []),
      {
        $lookup: {
          from: 'doctors',
          localField: 'reportedDoctors.doctorId',
          foreignField: '_id',
          as: 'doctorInfo'
        }
      },
      {
        $project: {
          patientNic: { $substr: ['$nic', 0, 4] }, // masked
          fullReport: '$reportedDoctors',
          doctorName: { $arrayElemAt: ['$doctorInfo.fullName', 0] },
          reportId: '$reportedDoctors._id'
        }
      },
      { $sort: { 'fullReport.reportedAt': -1 } }
    ];

    const reports = await Patient.aggregate(pipeline);
    return res.json({ data: reports });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
  }
};

// ─── NEW: REVIEW PATIENT REPORT ───────────────────────────────────────────────
exports.reviewReport = async (req, res) => {
  try {
    const { id } = req.params; // report ID (reportedDoctors._id)
    const { status } = req.body;

    if (!['reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "reviewed" or "dismissed"' });
    }

    const patient = await Patient.findOne({ 'reportedDoctors._id': id });
    if (!patient) return res.status(404).json({ error: 'Report not found' });

    const report = patient.reportedDoctors.id(id);
    report.status = status;
    await patient.save();

    return res.json({ message: 'Report updated', data: report });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update report', details: error.message });
  }
};

// ─── NEW: GET BROADCASTS ──────────────────────────────────────────────────────
exports.getBroadcasts = async (req, res) => {
  try {
    const BroadcastMessage = require('../models/BroadcastMessage');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const total = await BroadcastMessage.countDocuments();
    const messages = await BroadcastMessage.find()
      .sort({ sentAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getBroadcasts:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// End of adminController.js