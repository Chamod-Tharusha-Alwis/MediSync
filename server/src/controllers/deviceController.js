const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const TrustedDevice = require('../models/TrustedDevice');
const SessionToken = require('../models/SessionToken');
const OTPSession = require('../models/OTPSession');
const AuditLog = require('../models/AuditLog');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const PharmacyStaff = require('../models/PharmacyStaff');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');
const emailService = require('../utils/emailService');
const {
  getAttempts,
  incrementAttempts,
  clearAttempts,
  checkOtpRequestThrottle,
  recordOtpRequestSent,
} = require('../config/redis');
const { parseDeviceModel } = require('../utils/deviceParser');
const { ROLE_MODELS, assertAccountState } = require('../security/accountState');

const resolveUserEmail = (user) => {
  if (!user) return null;
  if (typeof user.email === 'string' && user.email.trim()) return user.email.trim();
  if (typeof user.personalEmail === 'string' && user.personalEmail.trim()) return user.personalEmail.trim();
  if (user.contactInfo && typeof user.contactInfo === 'object' && typeof user.contactInfo.email === 'string' && user.contactInfo.email.trim()) {
    return user.contactInfo.email.trim();
  }
  if (typeof user.contactInfo === 'string' && user.contactInfo.includes('@')) {
    return user.contactInfo.trim();
  }
  return null;
};

const deviceTrustIdentity = req => {
  const session = req.session, user = req.user;
  const modelName = user && Object.hasOwn(ROLE_MODELS, user.role) && ROLE_MODELS[user.role];
  const id = /^[a-f0-9]{24}$/i;
  if (!modelName || !id.test(String(user.id)) || !session || !id.test(String(session._id)) ||
      String(session.userId) !== String(user.id) || session.userModel !== modelName || session.isValid !== true || session.logoutAt ||
      (session.expiredAt && (!Number.isFinite(new Date(session.expiredAt).getTime()) || new Date(session.expiredAt) <= new Date()))) throw new Error('DEVICE_TRUST_IDENTITY_DENIED');
  return { modelName, sessionId: String(session._id) };
};
const deviceTrustAccount = async (req, device, identity) => {
  if (String(device.userId) !== String(req.user.id) || device.userModel !== identity.modelName ||
      typeof device.deviceFingerprint !== 'string' || !device.deviceFingerprint || !/^[a-f0-9]{24}$/i.test(String(device._id))) throw new Error('DEVICE_TRUST_IDENTITY_DENIED');
  // A missing account in the authenticated model must never select another role.
  const models = { Doctor, Patient, PharmacyStaff, Hospital, Admin };
  const user = await models[identity.modelName].findById(req.user.id);
  try { assertAccountState(req.user, user); } catch (_) { throw new Error('DEVICE_TRUST_IDENTITY_DENIED'); }
  return user;
};
const deviceTrustScope = (req, device, identity) => ({
  userId: req.user.id, userModel: identity.modelName, purpose: 'device-trust',
  'metadata.deviceId': String(device._id), 'metadata.deviceFingerprint': device.deviceFingerprint,
  'metadata.sessionId': identity.sessionId
});
const validDeviceOtp = (record, req, device, identity) => {
  const scope = deviceTrustScope(req, device, identity);
  return record && String(record.userId) === String(scope.userId) && record.userModel === scope.userModel && record.purpose === scope.purpose &&
    record.metadata?.deviceId === scope['metadata.deviceId'] && record.metadata?.deviceFingerprint === scope['metadata.deviceFingerprint'] &&
    record.metadata?.sessionId === scope['metadata.sessionId'] && record.used === false && Number.isInteger(record.failedAttempts) && record.failedAttempts >= 0 && Number.isFinite(new Date(record.expiresAt).getTime()) && new Date(record.expiresAt) > new Date();
};

// User: get my trusted devices
exports.getMyDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.find({ userId: req.user.id, isRevoked: false }).sort({ lastSeenAt: -1 });
    res.json({ data: devices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
};

// User: revoke one of my devices
exports.revokeMyDevice = async (req, res) => {
  try {
    const device = await TrustedDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (String(device.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this device' });
    }
    
    device.isTrusted = false;
    device.trustedAt = null;
    device.isRevoked = true;
    device.revokedAt = new Date();
    await device.save();

    // Also invalidate any sessions from this device fingerprint
    await SessionToken.updateMany(
      { userId: req.user.id, deviceFingerprint: device.deviceFingerprint, isValid: true },
      { $set: { isValid: false, isTrusted: false } }
    );

    res.json({ message: 'Device trust revoked', data: device });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke device' });
  }
};

// User: request a fresh step-up OTP to authorize or restore permanent trust for one of my devices
exports.requestDeviceTrustOTP = async (req, res) => {
  try {
    const identity = deviceTrustIdentity(req);

    const device = await TrustedDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    if (String(device.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this device' });
    }

    if (req.session.deviceFingerprint && req.session.deviceFingerprint !== device.deviceFingerprint) {
      const callerDevice = await TrustedDevice.findOne({
        userId: req.user.id, userModel: identity.modelName,
        deviceFingerprint: req.session.deviceFingerprint
      });
      if (callerDevice && callerDevice.isRevoked) {
        return res.status(403).json({ error: 'Revoked device session cannot authorize trust for another device' });
      }
    }

    const user = await deviceTrustAccount(req, device, identity);
    const { modelName } = identity;

    const destEmail = resolveUserEmail(user);
    if (!destEmail) {
      return res.status(400).json({ error: 'No registered email address found for step-up OTP verification' });
    }

    const otpKey = 'device-trust:' + String(user._id);
    const currentAttempts = await getAttempts(otpKey);
    if (currentAttempts >= 5) {
      return res.status(429).json({ error: 'Too many failed step-up OTP attempts. Please try again later.' });
    }

    const latestDeviceOtp = await OTPSession.findOne({
      userId: user._id, userModel: modelName,
      purpose: 'device-trust'
    }).sort({ createdAt: -1 });
    const persistedDeviceFailures = Number(latestDeviceOtp?._doc?.failedAttempts ?? latestDeviceOtp?.failedAttempts ?? 0);
    if (!Number.isInteger(persistedDeviceFailures) || persistedDeviceFailures < 0) throw new Error('DEVICE_TRUST_IDENTITY_DENIED');
    if (persistedDeviceFailures >= 5) {
      return res.status(429).json({ error: 'Too many failed step-up OTP attempts. Please try again later.' });
    }

    const throttle = await checkOtpRequestThrottle(otpKey, req.ip);
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        error: throttle.message,
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTPSession.updateMany(
      { userId: user._id, userModel: modelName, purpose: 'device-trust', used: false },
      { $set: { used: true } }
    );

    const otpDoc = await OTPSession.create({
      userId: user._id,
      userModel: modelName,
      otp: hashedOtp,
      expiresAt,
      purpose: 'device-trust',
      failedAttempts: persistedDeviceFailures,
      metadata: { deviceId: String(device._id), deviceFingerprint: device.deviceFingerprint, sessionId: identity.sessionId }
    });

    const resOtp = await emailService.sendOTPEmail(destEmail, user.fullName || user.name || 'User', otp, require('../services/recipientLanguageService').languageOptionsForRecord(modelName, user));
    if (!resOtp || !resOtp.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpDoc._id });
      return res.status(resOtp?.statusCode || 503).json({
        error: 'Unable to deliver device-trust OTP email right now. Please try again shortly.',
        message: 'Unable to deliver device-trust OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(resOtp?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: resOtp?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(otpKey, req.ip);

    res.status(200).json({
      message: 'Step-up verification OTP sent to your registered email',
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: resOtp.provider,
      fallbackUsed: Boolean(resOtp.fallbackUsed),
      data: {
        deviceId: device._id,
        expiresInMinutes: 10
      }
    });
  } catch (err) {
    if (err.message === 'DEVICE_TRUST_IDENTITY_DENIED') return res.status(403).json({ error: 'Device trust verification required' });
    res.status(500).json({ error: 'Failed to send device trust OTP' });
  }
};

// User: explicitly authorize or restore permanent trust for one of my devices
// Requires: (1) authenticated active session, (2) device ownership, (3) fresh step-up OTP (purpose: 'device-trust')
exports.trustMyDevice = async (req, res) => {
  try {
    const identity = deviceTrustIdentity(req);

    const device = await TrustedDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    if (String(device.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this device' });
    }
    await deviceTrustAccount(req, device, identity);

    // If caller session is operating from a different device that is currently revoked, block cross-device trust grant
    if (req.session.deviceFingerprint && req.session.deviceFingerprint !== device.deviceFingerprint) {
      const callerDevice = await TrustedDevice.findOne({
        userId: req.user.id, userModel: identity.modelName,
        deviceFingerprint: req.session.deviceFingerprint
      });
      if (callerDevice && callerDevice.isRevoked) {
        return res.status(403).json({ error: 'Revoked device session cannot authorize trust for another device' });
      }
    }

    const otp = req.body?.otp;
    if (!/^[0-9]{6}$/.test(String(otp ?? ''))) {
      return res.status(403).json({
        error: 'Fresh step-up OTP verification is required to authorize or restore permanent device trust'
      });
    }

    const otpKey = 'device-trust:' + String(req.user.id);
    const attempts = await getAttempts(otpKey);
    if (attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed step-up OTP attempts. Please try again later.' });
    }

    const otpRecord = await OTPSession.findOne({
      ...deviceTrustScope(req, device, identity),
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!validDeviceOtp(otpRecord, req, device, identity)) {
      await incrementAttempts(otpKey);
      return res.status(403).json({ error: 'Invalid or expired step-up OTP for device trust' });
    }

    const persistedFailures = Number(otpRecord._doc?.failedAttempts || otpRecord.failedAttempts || 0);
    if (persistedFailures >= 5) {
      await OTPSession.updateOne({ _id: otpRecord._id, ...deviceTrustScope(req, device, identity), used: false }, { $set: { used: true } });
      return res.status(429).json({ error: 'Too many failed step-up OTP attempts. Please try again later.' });
    }

    const isMatch = await bcrypt.compare(otp.toString().trim(), otpRecord.otp);
    if (!isMatch) {
      const newAttempts = await incrementAttempts(otpKey);
      const nextDocFailures = persistedFailures + 1;
      await OTPSession.collection.updateOne(
        { _id: otpRecord._id, ...deviceTrustScope(req, device, identity), used: false, expiresAt: { $gt: new Date() }, failedAttempts: { $lt: 5 } },
        {
          $inc: { failedAttempts: 1 },
          ...(newAttempts >= 5 || nextDocFailures >= 5 ? { $set: { used: true } } : {}),
        }
      );
      return res.status(403).json({ error: 'Incorrect step-up OTP' });
    }

    const claimedOtp = await OTPSession.findOneAndUpdate(
      { _id: otpRecord._id, ...deviceTrustScope(req, device, identity), used: false, expiresAt: { $gt: new Date() }, failedAttempts: { $lt: 5 } },
      { $set: { used: true } },
      { returnDocument: 'after' }
    );
    if (!claimedOtp) {
      return res.status(403).json({ error: 'Step-up OTP has already been used' });
    }

    await clearAttempts(otpKey);
    await deviceTrustAccount(req, device, identity);

    const wasRevoked = Boolean(device.isRevoked);
    device.isTrusted = true;
    device.trustedAt = new Date();
    device.isRevoked = false;
    device.revokedAt = null;
    await device.save();

    await SessionToken.updateMany(
      { userId: req.user.id, userModel: identity.modelName, deviceFingerprint: device.deviceFingerprint, isValid: true },
      { $set: { isTrusted: true } }
    );

    await AuditLog.create({
      actorId: req.user.id,
      actorRole: req.user.role || 'unknown',
      action: wasRevoked ? 'Device Trust Restored' : 'Device Trust Authorized',
      deviceModel: device.deviceModel || parseDeviceModel(req.headers['user-agent'])
    });

    res.json({
      message: wasRevoked ? 'Device trust restored' : 'Device trust authorized',
      data: device
    });
  } catch (err) {
    if (err.message === 'DEVICE_TRUST_IDENTITY_DENIED') return res.status(403).json({ error: 'Device trust verification required' });
    res.status(500).json({ error: 'Failed to authorize device trust' });
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
    res.status(500).json({ error: 'Failed to update device label' });
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

    // Check trusted status (must be explicitly trusted and not revoked)
    const fingerprints = sessions.filter(s => s.deviceFingerprint).map(s => ({ userId: s.userId, fp: s.deviceFingerprint }));
    const trustedDevices = fingerprints.length > 0
      ? await TrustedDevice.find({
          isRevoked: false,
          isTrusted: true,
          $or: fingerprints.map(f => ({ userId: f.userId, deviceFingerprint: f.fp }))
        }).lean()
      : [];
    const trustedSet = new Set(trustedDevices.map(d => `${d.userId}_${d.deviceFingerprint}`));

    const enriched = sessions.map(s => {
      const user = userMap[s.userId?.toString()] || { fullName: 'Unknown', role: 'unknown', identifier: '—' };
      const isTrusted = Boolean(s.deviceFingerprint && s.isTrusted && trustedSet.has(`${s.userId}_${s.deviceFingerprint}`));
      
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
    res.status(500).json({ error: 'Failed to fetch sessions' });
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
      if (typeof io.emitToVerifiedUser === 'function') {
        await io.emitToVerifiedUser(session.userId, 'force_logout', {
          message: 'Your session was terminated by an administrator.'
        });
      }
    }

    res.json({ message: 'Session terminated', data: { sessionId: session._id } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to force logout' });
  }
};

// Admin: revoke device trust for any user
exports.revokeDeviceTrust = async (req, res) => {
  try {
    const device = await TrustedDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    device.isTrusted = false;
    device.trustedAt = null;
    device.isRevoked = true;
    device.revokedAt = new Date();
    await device.save();

    await SessionToken.updateMany(
      { userId: device.userId, deviceFingerprint: device.deviceFingerprint, isValid: true },
      { $set: { isValid: false, isTrusted: false } }
    );

    res.json({ message: 'Device trust revoked and sessions terminated', data: device });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke device trust' });
  }
};
