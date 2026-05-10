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
const emailService = require('../utils/emailService');
const { validatePasswordStrength, hashPassword } = require('../utils/passwordUtils');

// Helper: createSession
const createSession = async (userId, userModel, token, req) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await SessionToken.create({
    userId,
    userModel,
    tokenHash,
    deviceInfo: req.headers['user-agent'] || 'Unknown Device',
    ipAddress: req.ip || req.connection.remoteAddress,
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

    const patient = new Patient({
      fullName, email, password: hashedPassword, nic, dateOfBirth, gender, contactInfo, riskLevel: 'low', riskScore: 0
    });
    
    await patient.save();

    return res.status(201).json({ message: "Patient registered", data: { id: patient._id } });
  } catch (err) {
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
      fullName, email, password: hashedPassword, pharmacyId, role: role || 'pharmacist'
    });
    
    await staff.save();

    return res.status(201).json({ message: "Pharmacy staff registered", data: { id: staff._id } });
  } catch (err) {
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
        user = await Doctor.findOne({ email, role: { $in: ['admin', 'super_admin'] } });
        modelName = 'Doctor';
      }
    } else {
      // Fallback: try all
      user = await Doctor.findOne({ email }); modelName = 'Doctor';
      if (!user) { user = await Patient.findOne({ email }); modelName = 'Patient'; }
      if (!user) { user = await PharmacyStaff.findOne({ email }); modelName = 'PharmacyStaff'; }
      if (!user) { user = await Hospital.findOne({ email }); modelName = 'Hospital'; }
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
    
    const otpRecord = await OTPSession.findOne({
      userId,
      purpose: 'login',
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect OTP' });

    otpRecord.used = true;
    await otpRecord.save();

    const doctor = await Doctor.findById(userId);
    if (!doctor) return res.status(404).json({ error: 'User not found' });

    const accessToken = jwt.sign({ id: doctor._id, role: doctor.role, sub: doctor.doctorId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: doctor._id, role: doctor.role, sub: doctor.doctorId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    await createSession(doctor._id, 'Doctor', accessToken, req);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ 
      data: { accessToken, role: doctor.role, doctorId: doctor.doctorId, name: doctor.fullName },
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

    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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

    if (!user) return res.status(404).json({ error: 'User not found' });

    const otpRecord = await OTPSession.findOne({
      userId: user._id,
      purpose: 'password-reset',
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect OTP' });

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

exports.enable2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: 'MediSync', issuer: 'MediSync' });
    const qrCodeUrl = `otpauth://totp/MediSync?secret=${secret.base32}&issuer=MediSync`;
    const qrcode = require('qrcode');
    const dataURL = await qrcode.toDataURL(qrCodeUrl);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await OTPSession.create({
      userId: req.user.id,
      userModel: 'Doctor',
      otp: secret.base32, // Storing temporarily for verification
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
      await SessionToken.updateOne({ tokenHash }, { $set: { isValid: false } });
    }
    res.clearCookie('refreshToken');
    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    return res.status(500).json({ error: "Logout failed", details: err.message });
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
    await createSession(decoded.id, 'User', accessToken, req);

    return res.status(200).json({ data: { accessToken }, message: "Token refreshed" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to refresh token", details: err.message });
  }
};