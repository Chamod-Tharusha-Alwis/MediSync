const TrustedDevice = require('../models/TrustedDevice');
const SessionToken = require('../models/SessionToken');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const PharmacyStaff = require('../models/PharmacyStaff');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');
const { parseDeviceModel } = require('../utils/deviceParser');

// User: get my trusted devices
exports.getMyDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.find({ userId: req.user.id, isRevoked: false }).sort({ lastSeenAt: -1 });
    res.json({ data: devices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices', details: err.message });
  }
};

// User: revoke one of my devices
exports.revokeMyDevice = async (req, res) => {
  try {
    const device = await TrustedDevice.findOne({ _id: req.params.id, userId: req.user.id });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    device.isRevoked = true;
    device.revokedAt = new Date();
    await device.save();

    // Also invalidate any sessions from this device fingerprint
    await SessionToken.updateMany(
      { userId: req.user.id, deviceFingerprint: device.deviceFingerprint, isValid: true },
      { $set: { isValid: false } }
    );

    res.json({ message: 'Device trust revoked', data: device });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke device', details: err.message });
  }
};

// User: update my device label
exports.updateMyDeviceLabel = async (req, res) => {
  try {
    const { deviceLabel } = req.body;
    const device = await TrustedDevice.findOne({ _id: req.params.id, userId: req.user.id });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    
    device.deviceLabel = deviceLabel;
    await device.save();

    res.json({ message: 'Device label updated', data: device });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update device label', details: err.message });
  }
};

// Admin: get all active sessions
exports.getActiveSessions = async (req, res) => {
  try {
    const sessions = await SessionToken.find({ isValid: true })
      .sort({ lastUsed: -1 })
      .limit(200)
      .lean();

    // Collect user IDs by model
    const userIds = { Doctor: [], Patient: [], PharmacyStaff: [], Hospital: [], Admin: [] };
    sessions.forEach(s => {
      if (userIds[s.userModel]) userIds[s.userModel].push(s.userId);
    });

    const [doctors, patients, pharmacists, hospitals, admins] = await Promise.all([
      Doctor.find({ _id: { $in: userIds.Doctor } }),
      Patient.find({ _id: { $in: userIds.Patient } }),
      PharmacyStaff.find({ _id: { $in: userIds.PharmacyStaff } }),
      Hospital.find({ _id: { $in: userIds.Hospital } }),
      Admin.find({ _id: { $in: userIds.Admin } })
    ]);

    const userMap = {};
    doctors.forEach(u => userMap[u._id.toString()] = { fullName: u.fullName, role: u.role || 'doctor', identifier: u.licenseNo || u.doctorId || '—' });
    patients.forEach(u => userMap[u._id.toString()] = { fullName: u.fullName, role: 'patient', identifier: u.nic || '—' });
    pharmacists.forEach(u => userMap[u._id.toString()] = { fullName: u.fullName, role: u.role || 'pharmacist', identifier: u.email || '—' });
    hospitals.forEach(u => userMap[u._id.toString()] = { fullName: u.name, role: 'hospital_admin', identifier: u.regNo || u.email || '—' });
    admins.forEach(u => userMap[u._id.toString()] = { fullName: u.fullName || u.name || 'Admin', role: u.role || 'admin', identifier: u.email || '—' });

    // Check trusted status
    const fingerprints = sessions.filter(s => s.deviceFingerprint).map(s => ({ userId: s.userId, fp: s.deviceFingerprint }));
    const trustedDevices = await TrustedDevice.find({
      isRevoked: false,
      $or: fingerprints.map(f => ({ userId: f.userId, deviceFingerprint: f.fp }))
    }).lean();
    const trustedSet = new Set(trustedDevices.map(d => `${d.userId}_${d.deviceFingerprint}`));

    const enriched = sessions.map(s => {
      const user = userMap[s.userId?.toString()] || { fullName: 'Unknown', role: 'unknown', identifier: '—' };
      const isTrusted = trustedSet.has(`${s.userId}_${s.deviceFingerprint}`);
      
      // Dynamic device model resolution: if deviceModel is generic/empty, re-parse from stored deviceInfo (raw UA)
      let resolvedModel = s.deviceModel;
      if (!resolvedModel || resolvedModel === 'Unknown' || resolvedModel === 'Android device' || resolvedModel === 'Test Device') {
        if (s.deviceInfo) {
          resolvedModel = parseDeviceModel(s.deviceInfo);
        }
      }

      return {
        _id: s._id,
        userId: s.userId,
        fullName: user.fullName,
        role: user.role,
        identifier: user.identifier,
        deviceModel: resolvedModel || 'Unknown',
        deviceFingerprint: s.deviceFingerprint,
        loginTime: s.createdAt,
        lastUsed: s.lastUsed,
        isTrusted
      };
    });

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions', details: err.message });
  }
};

// Admin: force logout a specific session
exports.forceLogout = async (req, res) => {
  try {
    const session = await SessionToken.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.isValid = false;
    await session.save();

    // Emit real-time notification to the target user's browser
    const io = req.app.get('io');
    if (io && session.userId) {
      const targetSocketId = io.userSocketMap?.get(session.userId.toString());
      if (targetSocketId) {
        io.to(targetSocketId).emit('force_logout', {
          message: 'Your session was terminated by an administrator.'
        });
      }
    }

    res.json({ message: 'Session terminated', data: { sessionId: session._id } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to force logout', details: err.message });
  }
};

// Admin: revoke device trust for any user
exports.revokeDeviceTrust = async (req, res) => {
  try {
    const device = await TrustedDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    device.isRevoked = true;
    device.revokedAt = new Date();
    await device.save();

    await SessionToken.updateMany(
      { userId: device.userId, deviceFingerprint: device.deviceFingerprint, isValid: true },
      { $set: { isValid: false } }
    );

    res.json({ message: 'Device trust revoked and sessions terminated', data: device });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke device trust', details: err.message });
  }
};
