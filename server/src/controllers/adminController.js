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
const uuid = () => crypto.randomUUID();
const { hashPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const { generateToken } = require('../utils/internalAuth');
const { parseDeviceModel } = require('../utils/deviceParser');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { checkMlHealth } = require('../services/mlPredictionService');
const { isUsingPersistentRedis } = require('../config/redis');

const ML_ENGINE_URL = process.env.ML_ENGINE_URL;

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
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
};

// ─── Real System Health Checks (U16) ──────────────────────────────────────────
exports.getSystemHealth = async (req, res) => {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    const apiStatus = {
      status: 'operational',
      uptime: uptimeSeconds,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };

    const mongoState = mongoose.connection.readyState;
    const mongoStatus = {
      status: mongoState === 1 ? 'operational' : 'degraded',
      readyState: mongoState,
      details: mongoState === 1 ? 'Connected to MongoDB Atlas replica set' : 'Database disconnected or degraded'
    };

    let mlStatus = { status: 'unknown' };
    try {
      const mlHealth = await checkMlHealth({ timeoutMs: 3000 });
      mlStatus = {
        status: mlHealth.availability === 'available' ? 'operational' : (mlHealth.availability === 'waking_up' ? 'waking_up' : 'unavailable'),
        availability: mlHealth.availability,
        error: mlHealth.error || null
      };
    } catch (err) {
      mlStatus = {
        status: 'unavailable',
        availability: 'unavailable',
        error: err.message || 'ML probe unreachable'
      };
    }

    let redisPersistent = false;
    try {
      redisPersistent = typeof isUsingPersistentRedis === 'function' ? isUsingPersistentRedis() : false;
    } catch (_) {}
    const redisStatus = {
      status: redisPersistent ? 'operational' : 'in_memory_fallback',
      persistent: redisPersistent,
      details: redisPersistent ? 'Persistent Redis session store operational' : 'In-memory ephemeral session fallback active'
    };

    const hasResend = Boolean((process.env.RESEND_API_KEY || process.env.RESEND_SMTP_PASS || '').trim());
    const hasBrevo = Boolean((process.env.BREVO_API_KEY || '').trim());
    const emailConfigured = hasResend || hasBrevo || process.env.NODE_ENV === 'test';
    const emailStatus = {
      status: emailConfigured ? 'operational' : 'unconfigured',
      configured: emailConfigured,
      provider: hasResend ? 'Resend API' : (hasBrevo ? 'Brevo SMTP' : (process.env.NODE_ENV === 'test' ? 'Test Mock' : 'None'))
    };

    return res.json({
      success: true,
      data: {
        api: { ...apiStatus, status: 'ok', operationalStatus: 'operational' },
        mongodb: mongoStatus,
        database: { ...mongoStatus, status: mongoState === 1 ? 'connected' : 'disconnected' },
        mlEngine: mlStatus,
        redis: redisStatus,
        email: emailStatus
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[getSystemHealth]', error);
    res.status(500).json({ error: 'Failed to retrieve system health' });
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
    if (!role || role === 'pharmacist' || role === 'pharmacy_admin') {
      const query = role ? { role } : {};
      const pharms = await PharmacyStaff.find(query)
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

    const statusQuery = String(req.query.status || '').trim().toLowerCase();
    if (statusQuery === 'active') {
      users = users.filter(u => u.isActive !== false);
    } else if (statusQuery === 'blocked' || statusQuery === 'inactive') {
      users = users.filter(u => u.isActive === false);
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
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ─── EXISTING: toggleUserStatus ──────────────────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    const data = await require('../services/accountStatusService').toggleAccountStatus({actor:req.user,body:req.body});
    return res.json({message:'User status updated',data});
  } catch(error) {
    const {ClinicalCommandError}=require('../services/clinicalErrors');
    return res.status(error instanceof ClinicalCommandError?error.status:503).json({error:error instanceof ClinicalCommandError?error.code:'Account status update unavailable'});
  }
};

// ─── EXISTING: getAuditLogs ──────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;
    const { actorRole, actorId, startDate, endDate, search, email, action } = req.query;

    let matchQuery = { actorId: { $ne: null, $exists: true } };
    if (actorRole) matchQuery.actorRole = actorRole;
    if (actorId) matchQuery.actorId = actorId;
    if (action && action !== 'all') {
      matchQuery.action = new RegExp(String(action).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (startDate || endDate) {
      matchQuery.timestamp = {};
      if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
    }

    if (email) {
      const escapedEmail = String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emailRegex = new RegExp(escapedEmail, 'i');
      const [doctors, allPatients, pharmacies, hospitals, admins] = await Promise.all([
        Doctor.find({ email: emailRegex }).select('_id'),
        Patient.find({ email: emailRegex }).select('_id'),
        PharmacyStaff.find({ email: emailRegex }).select('_id'),
        Hospital.find({ email: emailRegex }).select('_id'),
        Admin.find({ email: emailRegex }).select('_id')
      ]);
      const emailIds = [
        ...doctors.map(d => d._id.toString()),
        ...allPatients.map(p => p._id.toString()),
        ...pharmacies.map(p => p._id.toString()),
        ...hospitals.map(h => h._id.toString()),
        ...admins.map(a => a._id.toString())
      ];
      matchQuery.actorId = { $in: emailIds };
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
      if (matchQuery.actorId && Array.isArray(matchQuery.actorId.$in)) {
        matchQuery.actorId.$in = matchQuery.actorId.$in.filter(id => matchedIds.includes(id));
      } else {
        matchQuery.actorId = { $in: matchedIds };
      }
    }

    const countPipeline = [
      { $match: matchQuery },
      { $count: 'total' }
    ];
    const countResult = await AuditLog.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    const pipeline = [
      { $match: matchQuery },
      { $sort: { timestamp: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const logs = await AuditLog.aggregate(pipeline);
    const uniqueActorIds = [...new Set(logs.map(log => String(log.actorId || ''))
      .filter(id => /^[a-f0-9]{24}$/i.test(id)))];

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
        actorName: user?.fullName ? String(user.fullName).slice(0, 1) + '***' : (actorIdStr === 'anonymous' ? 'Anonymous' : 'Unavailable'),
        actorNic: user ? require('../utils/loginAlertIdentifier').maskLoginAlertIdentifier(user.nic) : '—',
        action: log.action,
        timestamp: log.timestamp,
        deviceModel: log.deviceModel || '—',
        isOnline,
        logoutTime
      };
    });

    res.json({ data: enrichedLogs, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
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
        user: user ? { ...user, isOnline } : { _id: userId, fullName: 'Unavailable', role: 'unknown', isOnline },
        auditLogs,
        devices,
        sessions
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user audit profile' });
  }
};

// ─── NEW: ML — triggerMLDetection ────────────────────────────────────────────
exports.triggerMLDetection = async (req, res) => {
  try {
    const service = require('../services/surveillanceService');
    const mode = (req.body?.mode || req.query?.mode) === 'simulation' ? 'simulation' : 'real';
    if (mode === 'simulation' && !await service.canReviewSimulation(req.user)) return res.status(403).json({error:'A synthetic reviewer account is required for simulation.'});
    res.json(await service.runAnalysis({mode, io: req.app?.get('io')}));
  } catch (_) { res.status(503).json({error:'Surveillance analysis unavailable; no alert was broadcast.'}); }
};

// ─── Outbreak 72h Growth Telemetry ───────────────────────────────────────────
exports.getOutbreakGrowth = async (req, res) => {
  try {
    const service = require('../services/surveillanceService');
    const rawWindow = String(req.query?.window || '72h').toLowerCase();
    const match = rawWindow.match(/^(\d+)h?$/);
    const windowHours = match ? Math.max(1, Math.min(168, Number(match[1]))) : 72;
    const mode = (req.query?.mode === 'simulation') ? 'simulation' : 'real';
    if (mode === 'simulation' && !await service.canReviewSimulation(req.user)) {
      return res.status(403).json({ error: 'A synthetic reviewer account is required for simulation.' });
    }
    const data = await service.calculateGrowthMetrics({ windowHours, mode });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute outbreak growth metrics' });
  }
};

// ─── Outbreak Last Scan Telemetry ─────────────────────────────────────────────
exports.getLastScan = async (req, res) => {
  try {
    const service = require('../services/surveillanceService');
    const mode = (req.query?.mode === 'simulation') ? 'simulation' : 'real';
    const lastScan = await service.getLastScan(mode);
    res.json({ success: true, lastScan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve last scan record' });
  }
};

// ─── NEW: ML — getMLStatus ───────────────────────────────────────────────────
exports.getMLStatus = async (req, res) => {
  const { probeAdminMlStatusWithRetry, createStatusGet } = require('../services/adminMlStatusService');
  // Local authentication/RBAC remains enforced by adminRoutes. A failed upstream
  // is explicitly unavailable, not a browser resource error or fabricated telemetry.
  return res.json(await probeAdminMlStatusWithRetry({
    get: createStatusGet(axios),
    token: generateToken,
    baseUrl: ML_ENGINE_URL,
    allowLoopbackHttp: process.env.NODE_ENV !== 'production',
    useCache: true,
    ping: (url) => axios.get(url, { timeout: 3000 }).catch(() => {})
  }));
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
      emailService.sendSecurityIncidentEmail(targetUser.email, targetUser.fullName || targetUser.name || 'User',
        'Your account access has been suspended. Contact MediSync support for review.',
        require('../services/recipientLanguageService').languageOptionsForRecord(targetModel, targetUser))
        .catch(e => console.error('Ban email failed:'));
    }

    return res.status(201).json({ message: 'User banned successfully', data: banRecord });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to ban user' });
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
    return res.status(500).json({ error: 'Failed to lift ban' });
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
    console.error('getActiveBans:');
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
    return res.status(500).json({ error: 'Failed to fetch bans' });
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

    emailService.sendWelcomeEmail(normalizedEmail, trimmedName, 'admin', require('../services/recipientLanguageService').languageOptionsForRecord('Admin', newAdmin)).catch(() => {});

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
    return res.status(500).json({ error: 'Failed to create admin' });
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
    return res.status(500).json({ error: 'Failed to fetch reports' });
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
    return res.status(500).json({ error: 'Failed to update report' });
  }
};

// ─── NEW: GET BROADCASTS ──────────────────────────────────────────────────────
exports.getBroadcasts = async (req, res) => {
  // Legacy messages lack a verified audience/provenance contract. Keep them
  // stored for audit without distributing them through the live history feed.
  res.json({messages:[],total:0,page:1,pages:0,message:'Legacy broadcast delivery is gated pending provenance review.'});
};

// ─── OUTBREAK RECIPIENT PREVIEW ──────────────────────────────────────────────
exports.previewOutbreakRecipients = async (req, res) => {
  try {
    const OutbreakAlert = require('../models/OutbreakAlert');
    const alert = await OutbreakAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    const scope = String(req.query?.scope || 'district').toLowerCase();
    const maxCap = Number(process.env.OUTBREAK_MAX_EMAIL_RECIPIENTS) || 100;
    const delivery = require('../services/outbreakNotificationDelivery');
    const isDemo = await delivery.isDemoOutbreakAlert(alert);
    const info = await delivery.resolveOutbreakRecipients(alert, scope, maxCap, { adminEmail: req.user?.email, ...(isDemo ? { isDemo: true } : {}) });
    const isDemonstration = Boolean(isDemo || info.isDemonstration);
    res.json({
      scope,
      district: info.district,
      recipientCount: info.recipients.length,
      totalEligible: info.totalFound,
      capped: info.capped,
      maxCap: info.maxCap,
      isDemonstration,
      deliveryEnabled: delivery.isOutbreakDeliveryEnabled(isDemonstration)
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to preview recipients.' });
  }
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
    if (!['admin','super_admin','superadmin','health_officer'].includes(req.user?.role)) return res.status(403).json({error:'Administrator review required.'});

    const emailScope = req.body?.emailScope || 'none';
    if (!['none', 'district', 'national'].includes(emailScope)) {
      return res.status(400).json({ error: 'Invalid email scope.' });
    }

    // Nationwide explicit confirmation check: require typing the disease name
    if (emailScope === 'national') {
      const confirmDisease = String(req.body?.confirmationDisease || req.body?.confirmDisease || '').trim().toLowerCase();
      const expectedDisease = String(alert.disease || '').trim().toLowerCase();
      if (!confirmDisease || confirmDisease !== expectedDisease) {
        return res.status(400).json({
          error: 'NATIONWIDE_CONFIRMATION_REQUIRED',
          message: `Nationwide broadcast requires typing the disease name ("${alert.disease}") to confirm.`
        });
      }
    }

    // Delivery policy (outbreakNotificationDelivery.isOutbreakDeliveryEnabled):
    // demonstration alerts reach only the allowlist and are on unless the flag is 'false';
    // real broadcasts fail closed and need OUTBREAK_EMAIL_DELIVERY_ENABLED === 'true'.
    const delivery = require('../services/outbreakNotificationDelivery');
    const isDemoAlert = await delivery.isDemoOutbreakAlert(alert);
    const isDeliveryEnabled = delivery.isOutbreakDeliveryEnabled(isDemoAlert);
    const isEmailRequested = emailScope !== 'none';
    const effectiveScope = (!isDeliveryEnabled && isEmailRequested) ? 'none' : emailScope;

    const updated = await OutbreakAlert.findOneAndUpdate(
      {_id:alert._id,status:'Pending'},
      {$set:{status:'Active',approvedBy:req.user.id,approvedAt:new Date(),emailScope:effectiveScope}},
      {new:true}
    );
    if (!updated) return res.status(409).json({error:'Only pending alerts can be approved.'});

    try {
      const { notifyOutbreakAlert } = require('../services/notificationService');
      await notifyOutbreakAlert(updated, { io: req.app?.get('io') });
    } catch (_) {}

    const emailDelivery = {
      attempted: false,
      skipped: false,
      reason: null,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0
    };

    if (isEmailRequested) {
      if (!isDeliveryEnabled) {
        emailDelivery.skipped = true;
        emailDelivery.reason = 'OUTBREAK_EMAIL_DELIVERY_DISABLED';
      } else {
        emailDelivery.attempted = true;
        try {
          const maxCap = Number(process.env.OUTBREAK_MAX_EMAIL_RECIPIENTS) || 100;
          const audience = await delivery.resolveOutbreakRecipients(alert, emailScope, maxCap, { adminEmail: req.user?.email, ...(isDemoAlert ? { isDemo: true } : {}) });
          emailDelivery.recipientCount = audience.recipients.length;
          emailDelivery.isDemonstration = Boolean(isDemoAlert || audience.isDemonstration);

          if (audience.recipients.length > 0) {
            const deliveryResult = await delivery.sendOutbreakAdvisoryEmail(audience.recipients, updated, {
              isDemo: emailDelivery.isDemonstration,
              adminEmail: req.user?.email,
              approverRole: req.user?.role === 'health_officer' ? 'Regional Epidemiologist / Health Officer' : 'Ministry of Health Authorized Administrator'
            });
            emailDelivery.sentCount = deliveryResult.sentCount || 0;
            emailDelivery.failedCount = deliveryResult.failedCount || 0;
          }
        } catch (mailErr) {
          console.error('[Outbreak Delivery] Error dispatching emails (non-fatal):', mailErr.message);
          emailDelivery.failedCount = emailDelivery.recipientCount;
          emailDelivery.error = mailErr.message;
        }
      }
    }

    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        actorId: String(req.user?.id || req.user?._id || 'unknown'),
        actorRole: req.user?.role || 'admin',
        action: 'ALERT_APPROVED',
        accessedNic: String(updated._id),
        deviceModel: `status:Pending->Active|scope:${emailScope}`,
        details: {
          alertId: String(updated._id),
          disease: updated.disease,
          district: updated.location || updated.district,
          emailScope,
          effectiveScope,
          recipientCount: emailDelivery.recipientCount,
          sentCount: emailDelivery.sentCount,
          failedCount: emailDelivery.failedCount,
          emailSkipped: emailDelivery.skipped,
          deliveryEnabled: isDeliveryEnabled,
          isDemonstration: isDemoAlert
        },
        timestamp: new Date()
      });
    } catch (_) {}

    let message = 'Review recorded. In-app notifications dispatched to clinicians and hospitals.';
    if (emailDelivery.skipped) {
      message += ' External email delivery is disabled; alert activated as dashboard-only.';
    } else if (emailDelivery.attempted) {
      message += ` Dispatched ${emailDelivery.sentCount} email advisories (${emailDelivery.failedCount} failed).`;
    }

    res.json({
      message,
      data: updated,
      emailDelivery
    });
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
    if (!['admin','super_admin','superadmin','health_officer'].includes(req.user?.role)) return res.status(403).json({error:'Administrator review required.'});

    if (['Resolved', 'Dismissed'].includes(alert.status)) {
      return res.status(409).json({ error: 'Alert is already in a terminal state.' });
    }
    if (action && !['resolve', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid resolution action.' });
    }

    const oldStatus = alert.status;
    alert.status = action === 'dismiss' ? 'Dismissed' : 'Resolved';
    await alert.save();

    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        actorId: String(req.user?.id || req.user?._id || 'unknown'),
        actorRole: req.user?.role || 'admin',
        action: action === 'dismiss' ? 'ALERT_DISMISSED' : 'ALERT_RESOLVED',
        accessedNic: String(alert._id),
        deviceModel: `status:${oldStatus}->${alert.status}|feedback:${alert.feedbackStatus}`,
        timestamp: new Date()
      });
    } catch (_) {}

    res.json({ message: `Alert ${alert.status.toLowerCase()} successfully`, data: alert });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

// ─── TEST OUTBREAK ADVISORY EMAIL ─────────────────────────────────────────────
exports.sendTestOutbreakEmail = async (req, res) => {
  try {
    if (!['admin','super_admin','superadmin','health_officer'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Administrator review required.' });
    }
    const OutbreakAlert = require('../models/OutbreakAlert');
    const alert = await OutbreakAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const adminEmail = (req.user?.email || 'admin@medisync.lk').trim().toLowerCase();
    const { sendOutbreakAdvisoryEmail } = require('../services/outbreakNotificationDelivery');

    const result = await sendOutbreakAdvisoryEmail(
      [{ email: adminEmail, role: 'admin_test', district: alert.location || alert.district || 'National' }],
      alert,
      {
        isTest: true,
        adminEmail,
        approverRole: req.user?.role === 'health_officer' ? 'Regional Epidemiologist / Health Officer' : 'Ministry of Health Authorized Administrator'
      }
    );

    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        actorId: String(req.user?.id || req.user?._id || 'unknown'),
        actorRole: req.user?.role || 'admin',
        action: 'TEST_EMAIL_SENT',
        accessedNic: String(alert._id),
        deviceModel: `test_email|${alert.disease}|${alert.location || alert.district}`,
        details: {
          alertId: String(alert._id),
          disease: alert.disease,
          district: alert.location || alert.district,
          sentCount: result.sentCount,
          failedCount: result.failedCount
        },
        timestamp: new Date()
      });
    } catch (_) {}

    return res.json({
      success: result.sentCount > 0,
      recipient: adminEmail,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      subject: result.subject,
      message: result.sentCount > 0 ? `Test email sent successfully to ${adminEmail}` : 'Test email failed to send.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send test email.' });
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
    res.status(500).json({ error: 'Failed to search users' });
  }
};

// ─── NEW: USER DEVICES ────────────────────────────────────────────────────────
exports.getUserDevices = async (req, res) => {
  try {
    const TrustedDevice = require('../models/TrustedDevice');
    const devices = await TrustedDevice.find({ userId: req.params.id });
    res.json({ data: devices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices' });
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
      emailService.sendDeviceRemovedEmail(email, device.deviceModel || 'Unknown Device').catch(e => console.error('Operation failed; sensitive details suppressed.'));
    }
    
    res.json({ message: 'Device removed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove device' });
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
    res.status(500).json({ error: 'Failed to fetch recovery info' });
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
      tokenHash: crypto.createHash('sha256').update(tokenStr).digest('hex'),
      purpose: 'password-reset',
      expiresAt
    });
    
    const email = user.email || (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);
    const clientUrl = process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';
    const link = `${clientUrl}/reset-password?token=${tokenStr}`;
    
    if (email) {
      emailService.sendRecoveryEmail(email, link, purpose || 'Account Recovery', require('../services/recipientLanguageService').languageOptionsForRecord(modelName, user)).catch(e => console.error('[EMAIL RECOVERY ERROR]'));
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
    res.status(500).json({ error: 'Failed to generate recovery token' });
  }
};

// ─── NEW: REVEAL IDENTIFIER (AUDIT LOGGED) ──────────────────────────────────
exports.revealIdentifier = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Admin authorization required' });
    }
    let identifier = null;
    let userRole = null;
    let doc = await Doctor.findById(userId).select('nic licenseNo doctorId email role');
    if (doc) { identifier = doc.nic || doc.licenseNo || doc.doctorId || doc.email; userRole = doc.role || 'doctor'; }
    if (!identifier) {
      doc = await Patient.findById(userId).select('nic email');
      if (doc) { identifier = doc.nic || doc.email; userRole = 'patient'; }
    }
    if (!identifier) {
      doc = await PharmacyStaff.findById(userId).select('nic email role');
      if (doc) { identifier = doc.nic || doc.email; userRole = doc.role || 'pharmacist'; }
    }
    if (!identifier) {
      doc = await Hospital.findById(userId).select('regNo email');
      if (doc) { identifier = doc.regNo || doc.email; userRole = 'hospital_admin'; }
    }
    if (!identifier) {
      doc = await Admin.findById(userId).select('email role');
      if (doc) { identifier = doc.email; userRole = doc.role || 'admin'; }
    }
    if (!identifier) {
      return res.status(404).json({ error: 'User identifier not found' });
    }
    await AuditLog.create({
      actorId: req.user.id,
      actorRole: req.user.role || 'admin',
      action: 'ADMIN_REVEAL_PII',
      accessedNic: identifier,
      deviceModel: parseDeviceModel(req.headers['user-agent'] || ''),
      timestamp: new Date()
    });
    return res.json({ success: true, identifier, role: userRole });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reveal identifier' });
  }
};

// ─── SURVEILLANCE CLINICAL REVIEW (F6) ──────────────────────────────────────────
exports.getPendingSurveillanceConsultations = async (req, res) => {
  try {
    const Consultation = require('../models/Consultation');
    const { SYNTHETIC_FLAGS, SYNTHETIC_MARKERS } = require('../services/publicHealthStats');
    const { district, disease, startDate, endDate, limit = 50, page = 1 } = req.query || {};

    const query = {
      $or: [
        { surveillanceVerification: { $exists: false } },
        { 'surveillanceVerification.status': { $in: ['pending', 'unverified'] } }
      ]
    };
    for (const field of SYNTHETIC_FLAGS) query[field] = { $in: [false, null] };
    for (const field of SYNTHETIC_MARKERS) query[field] = { $exists: false };

    if (district && district !== 'all') {
      query.district = String(district).trim();
    }
    if (disease && disease !== 'all') {
      const term = RegExp.escape(String(disease).trim().slice(0, 80));
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { icdCode: { $regex: term, $options: 'i' } },
          { icdDescription: { $regex: term, $options: 'i' } }
        ]
      });
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

    let queryChain = Consultation.find(query)
      .select('_id district icdDescription icdCode icdVersion createdAt surveillanceVerification')
      .sort({ createdAt: -1 });

    if (queryChain && typeof queryChain.limit === 'function') {
      queryChain = queryChain.limit(safeLimit);
    }

    const consultations = await queryChain;
    return res.json({ data: consultations });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pending surveillance consultations' });
  }
};

exports.reviewSurveillanceConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, diagnosisStatus, caseDefinitionReference, ids } = req.body || {};
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be verified or rejected' });
    }
    const Consultation = require('../models/Consultation');

    // Handle bulk review if id === 'bulk' or ids array is passed
    if (id === 'bulk' || (Array.isArray(ids) && ids.length > 0)) {
      const targetIds = Array.isArray(ids) ? ids : [];
      if (targetIds.length === 0 || targetIds.length > 100) {
        return res.status(400).json({ error: 'Provide between 1 and 100 consultation IDs' });
      }
      const validIds = targetIds.filter(i => typeof i === 'string' && /^[a-f0-9]{24}$/i.test(i));
      if (validIds.length === 0) return res.status(400).json({ error: 'No valid consultation IDs provided' });

      const consultations = await Consultation.find({ _id: { $in: validIds } });
      const now = new Date();
      const updatedIds = [];

      for (const c of consultations) {
        const episodeId = c.surveillanceVerification?.episodeId || `EP-${c.district || 'SL'}-${c.createdAt ? c.createdAt.toISOString().slice(0, 10) : now.toISOString().slice(0, 10)}-${String(c._id).slice(-4)}`;
        c.surveillanceVerification = {
          status,
          diagnosisStatus: status === 'verified' ? (diagnosisStatus || 'confirmed') : 'rejected',
          source: 'clinical_review',
          verifiedBy: req.user?.id || 'admin',
          verifiedAt: now,
          episodeId,
          caseDefinitionReference: caseDefinitionReference || 'SL-EPID-CASE-DEF-V1'
        };
        if (typeof c.set === 'function') {
          c.set('surveillanceVerification', c.surveillanceVerification, { strict: false });
        }
        await c.save();
        if (mongoose.connection?.readyState === 1 && Consultation.collection?.updateOne) {
          await Consultation.collection.updateOne(
            { _id: c._id },
            { $set: { surveillanceVerification: c.surveillanceVerification } }
          ).catch(() => {});
        }
        updatedIds.push(String(c._id));
      }

      try {
        if (mongoose.connection?.readyState === 1 && AuditLog) {
          await AuditLog.create({
            actorId: String(req.user?.id || 'admin'),
            actorRole: req.user?.role || 'admin',
            action: status === 'verified' ? 'SURVEILLANCE_REVIEW_VERIFY' : 'SURVEILLANCE_REVIEW_REJECT',
            accessedNic: 'N/A',
            deviceModel: 'Web Console',
            details: {
              bulkCount: updatedIds.length,
              status,
              diagnosisStatus: status === 'verified' ? (diagnosisStatus || 'confirmed') : 'rejected'
            }
          });
        }
      } catch (_) {}

      return res.json({
        message: `Successfully updated ${updatedIds.length} consultation(s) to ${status}`,
        updatedCount: updatedIds.length
      });
    }

    const consultation = await Consultation.findById(id);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    const episodeId = consultation.surveillanceVerification?.episodeId || `EP-${consultation.district || 'SL'}-${consultation.createdAt ? consultation.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}-${String(consultation._id).slice(-4)}`;
    const update = {
      status,
      diagnosisStatus: status === 'verified' ? (diagnosisStatus || 'confirmed') : 'rejected',
      source: 'clinical_review',
      verifiedBy: req.user?.id || 'admin',
      verifiedAt: new Date(),
      episodeId,
      caseDefinitionReference: caseDefinitionReference || 'SL-EPID-CASE-DEF-V1'
    };

    consultation.surveillanceVerification = update;
    if (typeof consultation.set === 'function') {
      consultation.set('surveillanceVerification', update, { strict: false });
    }
    await consultation.save();
    if (mongoose.connection?.readyState === 1 && Consultation.collection?.updateOne) {
      await Consultation.collection.updateOne(
        { _id: consultation._id },
        { $set: { surveillanceVerification: update } }
      ).catch(() => {});
    }

    // Audit log (zero PII, ids and status only)
    try {
      if (mongoose.connection?.readyState === 1 && AuditLog) {
        await AuditLog.create({
          actorId: String(req.user?.id || 'admin'),
          actorRole: req.user?.role || 'admin',
          action: status === 'verified' ? 'SURVEILLANCE_REVIEW_VERIFY' : 'SURVEILLANCE_REVIEW_REJECT',
          accessedNic: 'N/A',
          deviceModel: 'Web Console',
          details: {
            consultationId: String(consultation._id),
            district: consultation.district,
            status,
            diagnosisStatus: update.diagnosisStatus
          }
        });
      }
    } catch (_) {}

    return res.json({ message: `Consultation surveillance status updated to ${status}`, data: consultation.surveillanceVerification });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to review surveillance consultation' });
  }
};
