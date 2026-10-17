const Admin = require('../models/Admin');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const PharmacyStaff = require('../models/PharmacyStaff');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const AuditLog = require('../models/AuditLog');
const SessionToken = require('../models/SessionToken');
const BanRecord = require('../models/BanRecord');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { hashPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const { generateToken } = require('../utils/internalAuth');
const { parseDeviceModel } = require('../utils/deviceParser');
const crypto = require('crypto');

const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001';
const ML_TIMEOUT = 90000; // 90 seconds to accommodate Render free-tier cold starts

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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { role } = req.query;
    const rawSearch = (req.query.search || req.query.q || '').trim();

    let users = [];

    if (!role || role === 'doctor') {
      const docs = await Doctor.find({ role: { $in: ['doctor'] } })
        .select('fullName email doctorId specialization createdAt isActive role lastLoginAt lastSignOutAt').lean();
      users.push(...docs);
    }
    if (!role || role === 'patient') {
      const pats = await Patient.find()
        .select('fullName email nic district createdAt riskLevel isActive lastLoginAt lastSignOutAt __enc_fullName __enc_fullName_d keyVersion');
      users.push(
        ...pats.map(p => ({
          _id: p._id,
          fullName: p.fullName,
          email: p.email,
          nic: p.nic,
          district: p.district,
          createdAt: p.createdAt,
          riskLevel: p.riskLevel,
          isActive: p.isActive,
          lastLoginAt: p.lastLoginAt,
          lastSignOutAt: p.lastSignOutAt,
          role: 'patient'
        }))
      );
    }
    if (!role || role === 'pharmacist') {
      const pharms = await PharmacyStaff.find()
        .select('fullName email nic role createdAt isActive lastLoginAt lastSignOutAt').lean();
      users.push(...pharms.map(ph => ({ ...ph, role: ph.role || 'pharmacist' })));
    }
    if (!role || role === 'hospital_admin') {
      const hosps = await Hospital.find()
        .select('name email regNo district createdAt isActive lastLoginAt lastSignOutAt').lean();
      users.push(...hosps.map(h => ({ ...h, role: 'hospital_admin', fullName: h.name })));
    }
    if (!role || role === 'admin') {
      const [adminDocs, legacyDoctorAdmins] = await Promise.all([
        Admin.find()
          .select('fullName name email role isSuperAdmin isActive createdAt lastLoginAt lastSignOutAt')
          .lean(),
        Doctor.find({ role: { $in: ['admin', 'super_admin'] } })
          .select('fullName email doctorId createdAt isActive role isSuperAdmin lastLoginAt lastSignOutAt')
          .lean()
      ]);

      const seenAdminEmails = new Set();
      for (const a of adminDocs) {
        const emailKey = String(a.email || '').toLowerCase();
        if (emailKey) seenAdminEmails.add(emailKey);
        users.push({
          _id: a._id,
          fullName: a.fullName || a.name || 'Administrator',
          email: a.email,
          role: a.role || 'admin',
          isSuperAdmin: Boolean(a.isSuperAdmin || a.role === 'super_admin'),
          isActive: a.isActive !== false,
          createdAt: a.createdAt,
          lastLoginAt: a.lastLoginAt,
          lastSignOutAt: a.lastSignOutAt
        });
      }

      for (const d of legacyDoctorAdmins) {
        const emailKey = String(d.email || '').toLowerCase();
        if (emailKey && seenAdminEmails.has(emailKey)) continue;
        users.push({
          ...d,
          role: d.role || 'admin',
          isSuperAdmin: Boolean(d.isSuperAdmin || d.role === 'super_admin'),
          isActive: d.isActive !== false
        });
      }
    }

    if (rawSearch) {
      const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      users = users.filter(u =>
        searchRegex.test(u.fullName || '') ||
        searchRegex.test(u.email || '') ||
        searchRegex.test(u.nic || '') ||
        searchRegex.test(u.doctorId || '') ||
        searchRegex.test(u.regNo || '') ||
        searchRegex.test(u.district || '') ||
        searchRegex.test(u.specialization || '')
      );
    }

    const total = users.length;
    users = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);

    const SessionToken = require('../models/SessionToken');
    const userIds = users.map(u => u._id);
    const sessions = await SessionToken.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { lastUsed: -1 } },
      { $group: { _id: '$userId', lastSession: { $first: '$$ROOT' } } }
    ]);
    
    const sessionMap = {};
    sessions.forEach(s => sessionMap[s._id.toString()] = s.lastSession);
    
    users = users.map(u => {
      const s = sessionMap[u._id.toString()];
      if (s) {
        return { ...u, lastAccess: s.lastUsed, deviceModel: s.deviceModel, deviceInfo: s.deviceInfo, isValid: s.isValid };
      }
      return u;
    });

    res.json({ data: users, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
};

// ─── EXISTING: toggleUserStatus ──────────────────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (req.user && String(req.user.id) === String(userId)) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    let user;

    if (role === 'admin' || role === 'super_admin') {
      user = await Admin.findById(userId);
      if (!user) user = await Doctor.findById(userId);
    } else if (role === 'doctor') user = await Doctor.findById(userId);
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
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const { actorRole, actorId, startDate, endDate, search } = req.query;

    let matchQuery = { actorId: { $ne: null, $exists: true } };
    if (actorRole) matchQuery.actorRole = actorRole;
    if (actorId) matchQuery.actorId = actorId;
    if (startDate || endDate) {
      matchQuery.timestamp = {};
      if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      const [doctors, allPatients, pharmacies, hospitals, admins] = await Promise.all([
        Doctor.find({ $or: [{ nic: searchRegex }, { fullName: searchRegex }, { doctorId: searchRegex }, { email: searchRegex }] }),
        Patient.find().select('_id fullName nic email __enc_fullName __enc_fullName_d keyVersion'),
        PharmacyStaff.find({ $or: [{ nic: searchRegex }, { fullName: searchRegex }, { email: searchRegex }] }),
        Hospital.find({ $or: [{ regNo: searchRegex }, { name: searchRegex }, { email: searchRegex }] }),
        Admin.find({ $or: [{ email: searchRegex }, { fullName: searchRegex }, { name: searchRegex }] })
      ]);
      const matchedPatients = allPatients.filter(
        p => searchRegex.test(p.nic || '') || searchRegex.test(p.email || '') || searchRegex.test(p.fullName || '')
      );
      const matchedIds = [
        ...doctors.map(d => d._id.toString()),
        ...matchedPatients.map(p => p._id.toString()),
        ...pharmacies.map(p => p._id.toString()),
        ...hospitals.map(h => h._id.toString()),
        ...admins.map(a => a._id.toString())
      ];
      matchQuery.actorId = { $in: matchedIds };
    }

    // Aggregation pipeline to deduplicate to ONE row per unique actor (their latest action)
    const countPipeline = [
      { $match: matchQuery },
      { $group: { _id: '$actorId' } },
      { $count: 'total' }
    ];
    const countResult = await AuditLog.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    const pipeline = [
      { $match: matchQuery },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$actorId',
          latestLog: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latestLog' } },
      { $sort: { timestamp: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const logs = await AuditLog.aggregate(pipeline);
    const uniqueActorIds = logs.map(log => log.actorId).filter(Boolean);

    const [docs, pats, pharms, hosps, admins, activeSessions, endedSessions] = await Promise.all([
      Doctor.find({ _id: { $in: uniqueActorIds } }),
      Patient.find({ _id: { $in: uniqueActorIds } }),
      PharmacyStaff.find({ _id: { $in: uniqueActorIds } }),
      Hospital.find({ _id: { $in: uniqueActorIds } }),
      Admin.find({ _id: { $in: uniqueActorIds } }),
      SessionToken.find({ userId: { $in: uniqueActorIds }, isValid: true }).select('userId').lean(),
      SessionToken.find({ userId: { $in: uniqueActorIds }, isValid: false }).sort({ logoutAt: -1, expiredAt: -1, createdAt: -1 }).lean()
    ]);

    const activeUserSet = new Set(activeSessions.map(s => s.userId.toString()));

    // Real logout time mapping (only actual logoutAt or expiredAt or lastSignOutAt)
    const logoutMap = {};
    endedSessions.forEach(s => {
      const uid = s.userId.toString();
      if (!logoutMap[uid]) {
        if (s.logoutAt) logoutMap[uid] = s.logoutAt;
        else if (s.expiredAt) logoutMap[uid] = s.expiredAt;
      }
    });

    [...docs, ...pats, ...pharms, ...hosps, ...admins].forEach(u => {
      const uid = u._id.toString();
      if (!logoutMap[uid] && u.lastSignOutAt) {
        logoutMap[uid] = u.lastSignOutAt;
      }
    });

    const userMap = {};
    docs.forEach(u => { userMap[u._id.toString()] = { fullName: u.fullName, nic: u.nic || u.licenseNo || u.doctorId || u.email, role: 'doctor' }; });
    pats.forEach(u => { userMap[u._id.toString()] = { fullName: u.fullName, nic: u.nic || u.email, role: 'patient' }; });
    pharms.forEach(u => { userMap[u._id.toString()] = { fullName: u.fullName, nic: u.nic || u.email, role: u.role || 'pharmacist' }; });
    hosps.forEach(u => { userMap[u._id.toString()] = { fullName: u.name, nic: u.regNo || u.email, role: 'hospital_admin' }; });
    admins.forEach(u => { userMap[u._id.toString()] = { fullName: u.fullName || u.name || 'System Admin', nic: u.email, role: 'admin' }; });

    const enrichedLogs = logs.map(log => {
      const actorIdStr = (log.actorId || '').toString();
      const user = userMap[actorIdStr];
      const isOnline = activeUserSet.has(actorIdStr);
      const logoutTime = isOnline ? null : (logoutMap[actorIdStr] || null);

      return {
        _id: log._id,
        actorId: log.actorId,
        actorRole: user ? user.role : log.actorRole,
        actorName: user ? user.fullName : (log.actorRole === 'admin' ? 'MediSync System Admin' : 'Unknown User'),
        actorNic: user ? user.nic : '—',
        action: log.action,
        timestamp: log.timestamp,
        deviceModel: log.deviceModel || '—',
        isOnline,
        logoutTime
      };
    });

    res.json({ data: enrichedLogs, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
};

// ─── NEW: getUserAuditProfile ────────────────────────────────────────────────
exports.getUserAuditProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const TrustedDevice = require('../models/TrustedDevice');

    // Search across all models
    let user = null;

    let doc = await Admin.findById(userId);
    if (doc) {
      user = {
        _id: doc._id,
        fullName: doc.fullName || doc.name || 'System Admin',
        email: doc.email,
        role: doc.role || 'admin',
        identifier: doc.email,
        createdAt: doc.createdAt,
        lastLoginAt: doc.lastLoginAt,
        lastSignOutAt: doc.lastSignOutAt
      };
    }

    if (!user) {
      doc = await Patient.findById(userId);
      if (doc) {
        user = {
          _id: doc._id,
          fullName: doc.fullName,
          email: doc.email,
          nic: doc.nic,
          identifier: doc.nic,
          role: 'patient',
          gender: doc.gender,
          district: doc.district,
          bloodGroup: doc.bloodGroup,
          contactInfo: doc.contactInfo,
          riskLevel: doc.riskLevel,
          createdAt: doc.createdAt,
          lastLoginAt: doc.lastLoginAt,
          lastSignOutAt: doc.lastSignOutAt
        };
      }
    }

    if (!user) {
      doc = await Doctor.findById(userId);
      if (doc) {
        user = {
          _id: doc._id,
          fullName: doc.fullName,
          email: doc.email,
          doctorId: doc.doctorId,
          licenseNo: doc.licenseNo,
          identifier: doc.doctorId || doc.licenseNo,
          role: 'doctor',
          specialization: doc.specialization,
          clinicAddress: doc.clinicAddress,
          contactNumber: doc.contactNumber,
          createdAt: doc.createdAt,
          lastLoginAt: doc.lastLoginAt,
          lastSignOutAt: doc.lastSignOutAt
        };
      }
    }

    if (!user) {
      doc = await PharmacyStaff.findById(userId);
      if (doc) {
        user = {
          _id: doc._id,
          fullName: doc.fullName,
          email: doc.email,
          role: doc.role || 'pharmacist',
          identifier: doc.email,
          createdAt: doc.createdAt,
          lastLoginAt: doc.lastLoginAt,
          lastSignOutAt: doc.lastSignOutAt
        };
      }
    }

    if (!user) {
      doc = await Hospital.findById(userId);
      if (doc) {
        user = {
          _id: doc._id,
          fullName: doc.name,
          name: doc.name,
          email: doc.email,
          regNo: doc.regNo,
          identifier: doc.regNo || doc.email,
          role: 'hospital_admin',
          type: doc.type,
          district: doc.district,
          createdAt: doc.createdAt,
          lastLoginAt: doc.lastLoginAt,
          lastSignOutAt: doc.lastSignOutAt
        };
      }
    }

    // Online check
    const activeSession = await SessionToken.findOne({ userId, isValid: true }).lean();
    const isOnline = !!activeSession;

    // Fetch ALL audit history for this user
    const auditLogs = await AuditLog.find({ actorId: userId }).sort({ timestamp: -1 }).limit(200).lean();

    // Fetch registered/trusted devices
    const trustedDevices = await TrustedDevice.find({ userId }).sort({ lastSeenAt: -1 }).lean();
    const deviceMap = new Map();

    trustedDevices.forEach(d => {
      if (d.deviceFingerprint) {
        deviceMap.set(d.deviceFingerprint, {
          _id: d._id,
          deviceLabel: d.deviceLabel || d.deviceModel || 'Known Device',
          deviceModel: d.deviceModel || 'Unknown Device',
          deviceFingerprint: d.deviceFingerprint,
          isTrusted: !d.isRevoked && (d.isTrusted === true),
          isRevoked: d.isRevoked || false,
          createdAt: d.trustedAt || d.createdAt,
          lastSeenAt: d.lastSeenAt || d.updatedAt
        });
      }
    });

    // Fetch all sessions (active + past)
    const rawSessions = await SessionToken.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
    
    // Also include any devices seen in sessions that don't have an explicit TrustedDevice row
    rawSessions.forEach(s => {
      let resolvedModel = s.deviceModel;
      if (!resolvedModel || resolvedModel === 'Unknown' || resolvedModel === 'Android device' || resolvedModel === 'Test Device') {
        if (s.deviceInfo) resolvedModel = parseDeviceModel(s.deviceInfo);
      }

      if (s.deviceFingerprint && !deviceMap.has(s.deviceFingerprint)) {
        deviceMap.set(s.deviceFingerprint, {
          _id: s._id,
          deviceLabel: resolvedModel || 'Session Device',
          deviceModel: resolvedModel || 'Unknown Device',
          deviceFingerprint: s.deviceFingerprint,
          isTrusted: s.isTrusted || false,
          isRevoked: false,
          createdAt: s.createdAt,
          lastSeenAt: s.lastUsed || s.createdAt
        });
      }
    });

    const devices = Array.from(deviceMap.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));

    const sessions = rawSessions.map(s => {
      let resolvedModel = s.deviceModel;
      if (!resolvedModel || resolvedModel === 'Unknown' || resolvedModel === 'Android device' || resolvedModel === 'Test Device') {
        if (s.deviceInfo) resolvedModel = parseDeviceModel(s.deviceInfo);
      }
      return {
        _id: s._id,
        deviceModel: resolvedModel || 'Unknown Device',
        deviceFingerprint: s.deviceFingerprint || '—',
        isTrusted: s.isTrusted || false,
        isValid: s.isValid,
        loginTime: s.createdAt,
        lastUsed: s.lastUsed,
        logoutTime: s.isValid ? null : (s.logoutAt || s.expiredAt || null)
      };
    });

    res.json({
      data: {
        user: user ? { ...user, isOnline } : { _id: userId, fullName: 'Unknown User', role: 'unknown', isOnline },
        auditLogs,
        devices,
        sessions
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user audit profile', details: error.message });
  }
};

// ─── NEW: ML — triggerMLDetection ────────────────────────────────────────────
exports.triggerMLDetection = async (req, res) => {
  try {
    const service = require('../services/surveillanceService');
    const mode = (req.body?.mode || req.query?.mode) === 'simulation' ? 'simulation' : 'real';
    if (mode === 'simulation' && !await service.canReviewSimulation(req.user)) return res.status(403).json({error:'A synthetic reviewer account is required for simulation.'});
    res.json(await service.runAnalysis({mode}));
  } catch (_) { res.status(503).json({error:'Surveillance analysis unavailable; no alert was broadcast.'}); }
};

// ─── NEW: ML — getMLStatus ───────────────────────────────────────────────────
exports.getMLStatus = async (req, res) => {
  try {
    let resp;
    try {
      resp = await axios.get(`${ML_ENGINE_URL}/model-status`, { 
        timeout: ML_TIMEOUT,
        headers: { 'x-internal-key': generateToken() }
      });
    } catch (primaryErr) {
      if (primaryErr.code === 'ECONNABORTED' || primaryErr.code === 'ECONNREFUSED' || primaryErr.response?.status >= 500) {
        await new Promise(r => setTimeout(r, 2000));
        resp = await axios.get(`${ML_ENGINE_URL}/model-status`, { 
          timeout: ML_TIMEOUT,
          headers: { 'x-internal-key': generateToken() }
        });
      } else {
        throw primaryErr;
      }
    }
    const data = resp.data;
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
      return res.status(503).json({ status: 'offline', message: 'ML engine is spinning up, please retry shortly' });
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
    let isAuthorizedSuperAdmin = false;

    if (req.user?.id) {
      let caller = await Admin.findById(req.user.id).select('role isSuperAdmin isActive').lean();
      if (!caller) {
        caller = await Doctor.findById(req.user.id).select('role isSuperAdmin isActive').lean();
      }
      if (caller) {
        isAuthorizedSuperAdmin = Boolean(
          caller.isActive !== false && (caller.isSuperAdmin === true || caller.role === 'super_admin')
        );
      }
    }

    if (!isAuthorizedSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can add new admins' });
    }

    const { fullName, email, password } = req.body;
    const trimmedName = String(fullName || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'fullName, email, and password are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const strength = validatePasswordStrength(String(password));
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({
        error: 'Password is too weak. Must be at least 8 characters with uppercase, lowercase, and a number.'
      });
    }

    const [existingAdmin, existingDoctor] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }).lean(),
      Doctor.findOne({ email: normalizedEmail }).lean()
    ]);
    if (existingAdmin || existingDoctor) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);
    const adminId = 'ADMIN-' + uuid().slice(0, 8).toUpperCase();

    const newAdmin = new Admin({
      fullName: trimmedName,
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'admin',
      isSuperAdmin: false,
      isActive: true
    });

    await newAdmin.save();

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: 'admin',
      action: 'ADD_ADMIN',
      accessedNic: normalizedEmail,
      deviceModel: parseDeviceModel(req.headers['user-agent'] || ''),
      timestamp: new Date()
    }).catch(() => {});

    emailService.sendWelcomeEmail(normalizedEmail, trimmedName, 'admin').catch(() => {});

    return res.status(201).json({
      message: 'Admin created successfully',
      data: {
        _id: newAdmin._id,
        doctorId: adminId,
        fullName: newAdmin.fullName,
        email: newAdmin.email,
        role: 'admin',
        isSuperAdmin: false,
        isActive: true
      }
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
  // Legacy messages lack a verified audience/provenance contract. Keep them
  // stored for audit without distributing them through the live history feed.
  res.json({messages:[],total:0,page:1,pages:0,message:'Legacy broadcast delivery is gated pending provenance review.'});
};

// ─── NEW: APPROVE ALERT ───────────────────────────────────────────────────────
exports.approveAlert = async (req, res) => {
  try {
    const service = require('../services/surveillanceService');
    const OutbreakAlert = require('../models/OutbreakAlert');
    const alert = await OutbreakAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({error:'Alert not found'});
    if (alert.surveillancePolicy !== service.POLICY) return res.status(409).json({error:'Legacy alert requires provenance review.'});
    if (service.synthetic(alert) && !await service.canReviewSimulation(req.user)) return res.status(403).json({error:'Synthetic reviewer required.'});
    if (!['admin','super_admin','superadmin'].includes(req.user?.role)) return res.status(403).json({error:'Administrator review required.'});
    if (req.body?.emailScope && req.body.emailScope !== 'none') return res.status(409).json({error:'External outbreak delivery is disabled pending clinical governance approval.'});
    const updated = await OutbreakAlert.findOneAndUpdate({_id:alert._id,status:'Pending'},{$set:{status:'Active',approvedBy:req.user.id,approvedAt:new Date(),emailScope:'none'}},{new:true});
    if (!updated) return res.status(409).json({error:'Only pending alerts can be approved.'});
    res.json({message:'Review recorded. No external delivery performed.',data:updated});
  } catch (_) { res.status(503).json({error:'Unable to record alert review.'}); }
};

// ─── NEW: RESOLVE ALERT ───────────────────────────────────────────────────────
exports.resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {}; // 'resolve' or 'dismiss'
    const OutbreakAlert = require('../models/OutbreakAlert');

    const alert = await OutbreakAlert.findById(id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const service = require('../services/surveillanceService');
    if (alert.surveillancePolicy !== service.POLICY) return res.status(409).json({error:'Legacy provenance review required.'});
    if (service.synthetic(alert) && !await service.canReviewSimulation(req.user)) return res.status(403).json({error:'Synthetic reviewer required.'});

    alert.status = action === 'dismiss' ? 'Dismissed' : 'Resolved';
    await alert.save();

    res.json({ message: `Alert ${alert.status.toLowerCase()} successfully`, data: alert });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve alert', details: error.message });
  }
};

// ─── NEW: SEARCH USERS ────────────────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    
    const [doctors, allPatients, pharmacies, hospitals] = await Promise.all([
      Doctor.find({ $or: [{ nic: regex }, { doctorId: regex }, { fullName: regex }, { email: regex }] }).select('_id fullName nic doctorId role').lean(),
      Patient.find().select('_id fullName nic email __enc_fullName __enc_fullName_d keyVersion'),
      PharmacyStaff.find({ $or: [{ nic: regex }, { fullName: regex }, { email: regex }] }).select('_id fullName nic email role').lean(),
      Hospital.find({ $or: [{ regNo: regex }, { name: regex }, { email: regex }] }).select('_id name regNo').lean()
    ]);

    const matchingPatients = allPatients.filter(
      p => regex.test(p.nic || '') || regex.test(p.email || '') || regex.test(p.fullName || '')
    );
    
    const results = [
      ...doctors.map(d => ({ _id: d._id, fullName: d.fullName, nic: d.nic || d.doctorId, role: d.role })),
      ...matchingPatients.map(p => ({ _id: p._id, fullName: p.fullName, nic: p.nic, role: 'patient' })),
      ...pharmacies.map(ph => ({ _id: ph._id, fullName: ph.fullName, nic: ph.nic || ph.email, role: ph.role })),
      ...hospitals.map(h => ({ _id: h._id, fullName: h.name, nic: h.regNo, role: 'hospital_admin' }))
    ].slice(0, 50);
    
    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search users', details: err.message });
  }
};

// ─── NEW: USER DEVICES ────────────────────────────────────────────────────────
exports.getUserDevices = async (req, res) => {
  try {
    const TrustedDevice = require('../models/TrustedDevice');
    const devices = await TrustedDevice.find({ userId: req.params.id });
    res.json({ data: devices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices', details: err.message });
  }
};

exports.removeUserDevice = async (req, res) => {
  try {
    const TrustedDevice = require('../models/TrustedDevice');
    const device = await TrustedDevice.findOneAndDelete({ _id: req.params.deviceId, userId: req.params.id });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    let email = null;
    let modelName = device.userModel;
    if (modelName === 'Doctor') {
      const u = await Doctor.findById(req.params.id); if (u) email = u.email;
    } else if (modelName === 'Patient') {
      const u = await Patient.findById(req.params.id); if (u) email = u.contactInfo?.email;
    } else if (modelName === 'PharmacyStaff') {
      const u = await PharmacyStaff.findById(req.params.id); if (u) email = u.email;
    }
    
    if (email) {
      emailService.sendDeviceRemovedEmail(email, device.deviceModel || 'Unknown Device').catch(e => console.error(e));
    }
    
    res.json({ message: 'Device removed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove device', details: err.message });
  }
};

// ─── NEW: GET USER RECOVERY INFO ───────────────────────────────────────────
exports.getUserRecoveryInfo = async (req, res) => {
  try {
    const RecoveryToken = require('../models/RecoveryToken');
    const { id } = req.params;
    const roleQuery = req.query.role;

    let user = null;
    let modelName = null;

    if (roleQuery === 'doctor') { user = await Doctor.findById(id); modelName = 'Doctor'; }
    else if (roleQuery === 'patient') { user = await Patient.findById(id); modelName = 'Patient'; }
    else if (roleQuery === 'pharmacist') { user = await PharmacyStaff.findById(id); modelName = 'PharmacyStaff'; }
    else if (roleQuery === 'hospital_admin') { user = await Hospital.findById(id); modelName = 'Hospital'; }

    if (!user) {
      const pats = await Patient.findById(id); if (pats) { user = pats; modelName = 'Patient'; }
      if (!user) { const docs = await Doctor.findById(id); if (docs) { user = docs; modelName = 'Doctor'; } }
      if (!user) { const pharms = await PharmacyStaff.findById(id); if (pharms) { user = pharms; modelName = 'PharmacyStaff'; } }
      if (!user) { const hosps = await Hospital.findById(id); if (hosps) { user = hosps; modelName = 'Hospital'; } }
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const email = user.email || (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);

    const tokens = await RecoveryToken.find({ userId: id }).sort({ createdAt: -1 }).limit(10).lean();
    const activeToken = tokens.find(t => !t.used && new Date(t.expiresAt) > new Date());

    res.json({
      success: true,
      data: {
        userId: user._id,
        fullName: user.fullName || user.name || 'User',
        email,
        nic: user.nic || user.regNo || user.doctorId || '—',
        role: user.role || (modelName === 'Hospital' ? 'hospital_admin' : (modelName ? modelName.toLowerCase() : 'user')),
        hasActiveRecovery: !!activeToken,
        activeToken: activeToken ? {
          expiresAt: activeToken.expiresAt,
          purpose: activeToken.purpose,
          createdAt: activeToken.createdAt
        } : null,
        recentTokens: tokens.map(t => ({
          _id: t._id,
          purpose: t.purpose,
          used: t.used,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recovery info', details: err.message });
  }
};

// ─── NEW: GENERATE RECOVERY TOKEN ─────────────────────────────────────────────
exports.generateRecoveryToken = async (req, res) => {
  try {
    const RecoveryToken = require('../models/RecoveryToken');
    const { id } = req.params;
    const { purpose } = req.body || {};
    const roleQuery = req.query.role;
    
    let user = null;
    let modelName = null;

    if (roleQuery === 'doctor') { user = await Doctor.findById(id); modelName = 'Doctor'; }
    else if (roleQuery === 'patient') { user = await Patient.findById(id); modelName = 'Patient'; }
    else if (roleQuery === 'pharmacist') { user = await PharmacyStaff.findById(id); modelName = 'PharmacyStaff'; }
    else if (roleQuery === 'hospital_admin') { user = await Hospital.findById(id); modelName = 'Hospital'; }

    if (!user) {
      const pats = await Patient.findById(id); if (pats) { user = pats; modelName = 'Patient'; }
      if (!user) { const docs = await Doctor.findById(id); if (docs) { user = docs; modelName = 'Doctor'; } }
      if (!user) { const pharms = await PharmacyStaff.findById(id); if (pharms) { user = pharms; modelName = 'PharmacyStaff'; } }
      if (!user) { const hosps = await Hospital.findById(id); if (hosps) { user = hosps; modelName = 'Hospital'; } }
    }
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const tokenStr = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await RecoveryToken.create({
      userId: id,
      userModel: modelName,
      token: tokenStr,
      purpose: purpose || 'Account Recovery',
      expiresAt
    });
    
    const email = user.email || (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);
    const clientUrl = process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';
    const link = `${clientUrl}/reset-password?token=${tokenStr}`;
    
    if (email) {
      emailService.sendRecoveryEmail(email, link, purpose || 'Account Recovery').catch(e => console.error('[EMAIL RECOVERY ERROR]', e.message));
    }
    
    if (req.user) {
      await AuditLog.create({
        actorId: req.user.id || req.user._id,
        actorRole: req.user.role || 'admin',
        action: 'Generated Recovery Token',
        accessedNic: user.nic || user.regNo || user.doctorId || null,
        deviceModel: 'Admin Action'
      });
    }
    
    res.json({
      success: true,
      message: 'Recovery token generated and email sent',
      data: {
        userId: user._id,
        token: tokenStr,
        expiresAt,
        emailSentTo: email
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate recovery token', details: err.message });
  }
};
