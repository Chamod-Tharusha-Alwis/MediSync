const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const speakeasy = require('speakeasy');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const PharmacyStaff = require('../models/PharmacyStaff');
const Hospital = require('../models/Hospital');
const SessionToken = require('../models/SessionToken');
const OTPSession = require('../models/OTPSession');
const Admin = require('../models/Admin');
const emailService = require('../utils/emailService');
const { validatePasswordStrength, hashPassword } = require('../utils/passwordUtils');
const { incrementAttempts, getAttempts } = require('../config/redis');
const { parseDeviceModel } = require('../utils/deviceParser');
const { resolveLocation } = require('../utils/ipLookup');
const TrustedDevice = require('../models/TrustedDevice');
const AuditLog = require('../models/AuditLog');
const axios = require('axios');

// Helper: createSession
const createSession = async (userId, userModel, token, req, opts = {}) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ua = req.headers['user-agent'] || 'Unknown Device';
  const fingerprint = req.headers['x-device-fingerprint'] || null;
  
  // Check if this device is trusted
  let isTrusted = false;
  if (fingerprint) {
    const trusted = await TrustedDevice.findOne({ userId, deviceFingerprint: fingerprint, isRevoked: false });
    if (trusted) {
      isTrusted = true;
      trusted.lastSeenAt = new Date();
      await trusted.save();
    }
  }

  await SessionToken.create({
    userId,
    userModel,
    tokenHash,
    deviceInfo: ua,
    deviceFingerprint: fingerprint,
    deviceModel: parseDeviceModel(ua),
    isTrusted: opts.isTrusted || isTrusted,
    isValid: true,
    lastUsed: new Date()
  });
};

// Helper: invalidateAllSessions
const invalidateAllSessions = async (userId) => {
  await SessionToken.updateMany({ userId }, { $set: { isValid: false } });
};

exports.registerDoctor = async (req, res) => {
  try {
    const { fullName, email, password, licenseNo, specialization } = req.body;
    
    if (!fullName || !email || !password || !licenseNo || !specialization) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'Password is too weak. Must be at least 8 chars with upper, lower, and number.' });
    }

    const existing = await Doctor.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);
    const doctorId = "DR-" + uuid().slice(0, 8).toUpperCase();

    const doctor = new Doctor({
      doctorId, fullName, email, password: hashedPassword, licenseNo, specialization, role: 'doctor'
    });
    
    await doctor.save();
    
    try {
      await emailService.sendWelcomeEmail(email, fullName, 'doctor');
    } catch (e) {
      console.error('Welcome email failed:', e.message);
    }

    return res.status(201).json({ message: "Registered", data: { doctorId } });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
      return res.status(400).json({ error: "Email or License already exists" });
    }
    return res.status(500).json({ error: "Registration failed", details: err.message });
  }
};

exports.registerPatient = async (req, res) => {
  try {
    const { fullName, email, password, nic, dateOfBirth, gender, contactInfo } = req.body;
    
    if (!fullName || !email || !password || !nic) {
      return res.status(400).json({ error: 'Required fields: fullName, email, password, nic' });
    }

    const existing = await Patient.findOne({ $or: [{ email }, { nic }] });
    if (existing) return res.status(400).json({ error: 'Email or NIC already registered' });

    const hashedPassword = await hashPassword(password);
    const patientNic_bi = crypto.createHash('sha256').update(nic.trim()).digest('hex');

    const patient = new Patient({
      fullName, email, password: hashedPassword, nic, patientNic_bi, dateOfBirth, gender, contactInfo, riskLevel: 'low', riskScore: 0
    });
    
    await patient.save();

    return res.status(201).json({ message: "Patient registered", data: { id: patient._id } });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
      return res.status(400).json({ error: "Email or NIC already exists" });
    }
    console.error("REGISTRATION ERROR:", err);
    return res.status(500).json({ error: "Registration failed", details: err.message });
  }
};

exports.registerPharmacyStaff = async (req, res) => {
  try {
    const { fullName, email, password, pharmacyId, role } = req.body;
    
    if (!fullName || !email || !password || !pharmacyId) {
      return res.status(400).json({ error: 'Required fields: fullName, email, password, pharmacyId' });
    }

    const existing = await PharmacyStaff.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await hashPassword(password);

    const staff = new PharmacyStaff({
      fullName, email, password: hashedPassword, pharmacyId, role: role || 'pharmacist', mustChangePassword: false
    });
    
    await staff.save();

    return res.status(201).json({ message: "Pharmacy staff registered", data: { id: staff._id } });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
      return res.status(400).json({ error: "Email already registered" });
    }
    return res.status(500).json({ error: "Registration failed", details: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    let user;
    let modelName;

    if (role === 'doctor') {
      user = await Doctor.findOne({ email });
      modelName = 'Doctor';
    } else if (role === 'patient') {
      user = await Patient.findOne({ email });
      modelName = 'Patient';
    } else if (role === 'pharmacist' || role === 'pharmacy_admin') {
      user = await PharmacyStaff.findOne({ email });
      modelName = 'PharmacyStaff';
    } else if (role === 'hospital_admin' || role === 'admin') {
      user = await Hospital.findOne({ email });
      modelName = 'Hospital';
      if (!user) {
        user = await Admin.findOne({ email, role: { $in: ['admin', 'super_admin'] } });
        modelName = 'Admin';
      }
    } else {
      // Fallback: try all
      user = await Doctor.findOne({ email }); modelName = 'Doctor';
      if (!user) { user = await Patient.findOne({ email }); modelName = 'Patient'; }
      if (!user) { user = await PharmacyStaff.findOne({ email }); modelName = 'PharmacyStaff'; }
      if (!user) { user = await Hospital.findOne({ email }); modelName = 'Hospital'; }
      if (!user) { user = await Admin.findOne({ email }); modelName = 'Admin'; }
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      const otp = crypto.randomInt(100000, 1000000).toString();
      const hashedOtp = await bcrypt.hash(otp, 10);
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await OTPSession.create({
        userId: user._id,
        userModel: modelName,
        otp: hashedOtp,
        expiresAt,
        purpose: 'login'
      });

      try {
        await emailService.sendOTPEmail(user.email, user.fullName || user.name || 'User', otp);
      } catch (e) {
        console.error('OTP email failed:', e.message);
      }

      return res.status(200).json({ data: { requiresOTP: true, userId: user._id }, message: "OTP sent to your email" });
    }

    const actualRole = user.role || role;
    const subId = user.doctorId || user.nic || user._id;
    const name = user.fullName || user.name || 'User';

    const accessToken = jwt.sign({ id: user._id, role: actualRole, sub: subId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id, role: actualRole, sub: subId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    await createSession(user._id, modelName, accessToken, req);
    // Track last login
    user.lastLoginAt = new Date();
    await user.save();

    // -- LOGIN NOTIFICATION EMAIL --
    try {
      const emailToSend = modelName === 'Patient' ? user.contactInfo?.email || user.email : user.email;
      const idField = user.doctorId || user.nic || user.regNo || user.email;
      const deviceModel = req.headers['x-hardware-model'] || parseDeviceModel(req.headers['user-agent']);
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const networkInfo = await resolveLocation(ip);
      await emailService.sendLoginNotificationEmail(emailToSend, name, idField, actualRole, deviceModel, networkInfo, 'Individual Login', null);
    } catch(e) {
      console.error('Failed to send login notification:', e.message);
    }


    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ 
      data: { accessToken, role: actualRole, subId, name },
      message: "Login successful"
    });

  } catch (err) {
    return res.status(500).json({ error: "Login failed", details: err.message });
  }
};

exports.verifyLoginOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    const attempts = await getAttempts('auth:' + userId);
    if (attempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const otpRecord = await OTPSession.findOne({
      userId,
      purpose: 'login',
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp);
    if (!isMatch) {
      await incrementAttempts('auth:' + userId);
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    otpRecord.used = true;
    await otpRecord.save();

    let user;
    let modelName = otpRecord.userModel;

    if (modelName === 'Doctor') user = await Doctor.findById(userId);
    else if (modelName === 'Patient') user = await Patient.findById(userId);
    else if (modelName === 'PharmacyStaff') user = await PharmacyStaff.findById(userId);
    else if (modelName === 'Hospital') user = await Hospital.findById(userId);
    else if (modelName === 'Admin') user = await Admin.findById(userId);

    if (!user) {
      user = await Doctor.findById(userId); if (user) modelName = 'Doctor';
      if (!user) { user = await Patient.findById(userId); if (user) modelName = 'Patient'; }
      if (!user) { user = await PharmacyStaff.findById(userId); if (user) modelName = 'PharmacyStaff'; }
      if (!user) { user = await Hospital.findById(userId); if (user) modelName = 'Hospital'; }
      if (!user) { user = await Admin.findById(userId); if (user) modelName = 'Admin'; }
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const actualRole = user.role || (modelName === 'Hospital' ? 'hospital_admin' : 'user');
    const subId = user.doctorId || user.nic || user._id;
    const name = user.fullName || user.name || 'User';

    const accessToken = jwt.sign({ id: user._id, role: actualRole, sub: subId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id, role: actualRole, sub: subId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    await createSession(user._id, modelName, accessToken, req);

    // Mark device as trusted after OTP verification
    const fp = req.headers['x-device-fingerprint'];
    if (fp) {
      const existingTrusted = await TrustedDevice.findOne({ userId: user._id, deviceFingerprint: fp });
      if (!existingTrusted) {
        // Log Anomaly
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
          const networkInfo = await resolveLocation(ip);
        
        const deviceModel = parseDeviceModel(req.headers['user-agent']);
        
        await AuditLog.create({
          actorId: user._id,
          actorRole: actualRole,
          action: 'Untrusted Login Attempt',
          deviceModel: deviceModel
        });
        
        try {
          const emailToSend = modelName === 'Patient' ? user.contactInfo.email : user.email;
          const locStr = networkInfo ? `${networkInfo.city}, ${networkInfo.region}, ${networkInfo.country}` : 'Unknown Location';
            await emailService.sendAnomalyEmail(emailToSend, deviceModel, locStr);
        } catch(e) {
          console.error("Failed to send anomaly email", e);
        }
      }

      await TrustedDevice.findOneAndUpdate(
        { userId: user._id, deviceFingerprint: fp },
        {
          userId: user._id,
          userModel: modelName,
          deviceFingerprint: fp,
          deviceModel: parseDeviceModel(req.headers['user-agent']),
          deviceInfo: req.headers['user-agent'] || 'Unknown Device',
          trustedAt: new Date(),
          lastSeenAt: new Date(),
          isRevoked: false
        },
        { upsert: true, new: true }
      );
    }
    // Track last login
    user.lastLoginAt = new Date();
    await user.save();

    // -- LOGIN NOTIFICATION EMAIL --
    try {
      const emailToSend = modelName === 'Patient' ? user.contactInfo?.email || user.email : user.email;
      const idField = user.doctorId || user.nic || user.regNo || user.email;
      const deviceModel = req.headers['x-hardware-model'] || parseDeviceModel(req.headers['user-agent']);
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const networkInfo = await resolveLocation(ip);
      await emailService.sendLoginNotificationEmail(emailToSend, name, idField, actualRole, deviceModel, networkInfo, 'Individual Login', null);
    } catch(e) {
      console.error('Failed to send login notification:', e.message);
    }


    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ 
      data: { accessToken, role: actualRole, subId, name },
      message: "Login successful"
    });

  } catch (err) {
    return res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    
    let user = await Doctor.findOne({ email });
    let model = 'Doctor';
    if (!user) {
      user = await Patient.findOne({ 'contactInfo.email': email });
      model = 'Patient';
    }
    if (!user) {
      user = await PharmacyStaff.findOne({ email });
      model = 'PharmacyStaff';
    }
    if (!user) {
      user = await Hospital.findOne({ email });
      model = 'Hospital';
    }
    if (!user) {
      user = await Admin.findOne({ email });
      model = 'Admin';
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await OTPSession.create({
      userId: user._id,
      userModel: model,
      otp: hashedOtp,
      expiresAt,
      purpose: purpose || 'verification'
    });

    try {
      const emailToSend = model === 'Patient' ? user.contactInfo.email : user.email;
      await emailService.sendOTPEmail(emailToSend, user.fullName || 'User', otp);
    } catch (e) {
      console.error('Email failed:', e.message);
    }

    return res.status(200).json({ message: "OTP sent" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
};

exports.setLoginType = async (req, res) => {
  try {
    const { loginType, hospitalId } = req.body;
    
    if (loginType === 'hospital') {
      if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required for hospital login' });
      
      const doctor = await Doctor.findById(req.user.id);
      const orgLogin = doctor.orgLogins.find(org => org.hospitalId.toString() === hospitalId);
      if (!orgLogin || !orgLogin.isActive) {
        return res.status(403).json({ error: 'You are not active at this hospital' });
      }
      
      const hospital = await Hospital.findById(hospitalId);

      // -- HOSPITAL WORKSPACE NOTIFICATION EMAIL --
      try {
        if (orgLogin.orgEmail) {
          const deviceModel = req.headers['x-hardware-model'] || parseDeviceModel(req.headers['user-agent']);
          const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
      const networkInfo = await resolveLocation(ip);
          await emailService.sendLoginNotificationEmail(orgLogin.orgEmail, doctor.fullName, doctor.doctorId, 'doctor', deviceModel, networkInfo, 'Hospital Login', hospital ? hospital.name : 'Unknown Hospital');
        }
      } catch(e) {
        console.error('Failed to send hospital login notification:', e.message);
      }

      return res.status(200).json({ data: { loginType, hospitalId, hospitalName: hospital ? hospital.name : 'Hospital' }, message: "Workspace set" });
    }
    
    return res.status(200).json({ data: { loginType: 'personal' }, message: "Workspace set to Personal" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to set login type", details: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Find user by role mapping (simple logic, assuming standard collections)
    let user, model;
    if (req.user.role === 'doctor' || req.user.role === 'admin') { user = await Doctor.findById(req.user.id); model = Doctor; }
    else if (req.user.role === 'patient') { user = await Patient.findById(req.user.id); model = Patient; }
    else if (req.user.role === 'pharmacist' || req.user.role === 'pharmacy_admin') { user = await PharmacyStaff.findById(req.user.id); model = PharmacyStaff; }
    else if (req.user.role === 'hospital_admin') { user = await Hospital.findById(req.user.id); model = Hospital; }
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'New password is too weak.' });
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    if (user.passwordChangedAt !== undefined) user.passwordChangedAt = new Date();
    await user.save();

    await invalidateAllSessions(user._id);
    res.clearCookie('refreshToken');

    return res.status(200).json({ message: "Password changed. Please log in again." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to change password", details: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    let user = await Doctor.findOne({ email });
    let model = 'Doctor';
    if (!user) { user = await Patient.findOne({ 'contactInfo.email': email }); model = 'Patient'; }
    if (!user) { user = await PharmacyStaff.findOne({ email }); model = 'PharmacyStaff'; }
    if (!user) { user = await Hospital.findOne({ email }); model = 'Hospital'; }

    // Always return success to prevent email enumeration
    if (!user) return res.status(200).json({ message: "If that email exists, an OTP was sent" });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await OTPSession.create({
      userId: user._id,
      userModel: model,
      otp: hashedOtp,
      expiresAt,
      purpose: 'password-reset'
    });

    try {
      const emailToSend = model === 'Patient' ? user.contactInfo.email : user.email;
      await emailService.sendOTPEmail(emailToSend, user.fullName || user.name || 'User', otp);
    } catch (e) {
      console.error('Email failed:', e.message);
    }

    return res.status(200).json({ message: "If that email exists, an OTP was sent" });
  } catch (err) {
    return res.status(500).json({ error: "Request failed", details: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    let user = await Doctor.findOne({ email });
    if (!user) user = await Patient.findOne({ 'contactInfo.email': email });
    if (!user) user = await PharmacyStaff.findOne({ email });
    if (!user) user = await Hospital.findOne({ email });
    if (!user) user = await Admin.findOne({ email });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const attempts = await getAttempts('reset:' + user._id);
    if (attempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const otpRecord = await OTPSession.findOne({
      userId: user._id,
      purpose: 'password-reset',
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp);
    if (!isMatch) {
      await incrementAttempts('reset:' + user._id);
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'New password is too weak.' });
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    if (user.passwordChangedAt !== undefined) user.passwordChangedAt = new Date();
    await user.save();

    otpRecord.used = true;
    await otpRecord.save();

    await invalidateAllSessions(user._id);

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed", details: err.message });
  }
};

exports.resetPasswordRecovery = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const RecoveryToken = require('../models/RecoveryToken');
    const recoveryToken = await RecoveryToken.findOne({
      token,
      expiresAt: { $gt: new Date() }
    });

    if (!recoveryToken) {
      return res.status(400).json({ error: 'Invalid or expired recovery token' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'New password is too weak.' });
    }

    let user;
    if (recoveryToken.userModel === 'Doctor') user = await Doctor.findById(recoveryToken.userId);
    else if (recoveryToken.userModel === 'Patient') user = await Patient.findById(recoveryToken.userId);
    else if (recoveryToken.userModel === 'PharmacyStaff') user = await PharmacyStaff.findById(recoveryToken.userId);
    else if (recoveryToken.userModel === 'Hospital') user = await Hospital.findById(recoveryToken.userId);
    else if (recoveryToken.userModel === 'Admin') user = await Admin.findById(recoveryToken.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    if (user.passwordChangedAt !== undefined) user.passwordChangedAt = new Date();
    await user.save();

    await RecoveryToken.deleteOne({ _id: recoveryToken._id });
    await invalidateAllSessions(user._id);

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed", details: err.message });
  }
};

exports.enable2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: 'MediSync', issuer: 'MediSync' });
    const qrCodeUrl = `otpauth://totp/MediSync?secret=${secret.base32}&issuer=MediSync`;
    const qrcode = require('qrcode');
    const dataURL = await qrcode.toDataURL(qrCodeUrl);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const hashedSecret = await bcrypt.hash(secret.base32, 10);

    await OTPSession.create({
      userId: req.user.id,
      userModel: 'Doctor',
      otp: hashedSecret, // Hashed for security
      expiresAt,
      purpose: '2fa-setup'
    });

    return res.status(200).json({ data: { qrCode: dataURL, secret: secret.base32 }, message: "Scan this QR code" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate 2FA", details: err.message });
  }
};

exports.verify2FASetup = async (req, res) => {
  try {
    const { token, secret } = req.body;
    
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA token' });
    }

    const doctor = await Doctor.findById(req.user.id);
    doctor.otpSecret = secret;
    doctor.twoFactorEnabled = true;
    await doctor.save();

    return res.status(200).json({ message: "2FA enabled successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Verification failed", details: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await SessionToken.updateOne({ tokenHash }, { $set: { isValid: false, logoutAt: new Date() } });

      // Track last sign-out on user model
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.id) {
          const models = [Doctor, Patient, PharmacyStaff, Hospital, Admin];
          for (const Model of models) {
            const u = await Model.findById(decoded.id);
            if (u) {
              u.lastSignOutAt = new Date();
              await u.save();
              break;
            }
          }
        }
      } catch (e) {
        // Token might be expired, still clear session
      }
    }
    res.clearCookie('refreshToken');
    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    return res.status(500).json({ error: "Logout failed", details: err.message });
  }
};

exports.heartbeat = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await SessionToken.updateOne({ tokenHash, isValid: true }, { $set: { lastUsed: new Date() } });
    }
    return res.status(200).json({ message: "Heartbeat received" });
  } catch (err) {
    return res.status(500).json({ error: "Heartbeat failed", details: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const accessToken = jwt.sign({ id: decoded.id, role: decoded.role, sub: decoded.sub }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const pharmacyRoles = ['pharmacist', 'pharmacy_admin', 'assistant'];
    const userModel = pharmacyRoles.includes(decoded.role) ? 'PharmacyStaff' : 'User';
    await createSession(decoded.id, userModel, accessToken, req);

    return res.status(200).json({ data: { accessToken }, message: "Token refreshed" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to refresh token", details: err.message });
  }
};