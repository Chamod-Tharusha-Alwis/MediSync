const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const speakeasy = require('speakeasy');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const PharmacyStaff = require('../models/PharmacyStaff');
const Pharmacy = require('../models/Pharmacy');
const Hospital = require('../models/Hospital');
const SessionToken = require('../models/SessionToken');
const OTPSession = require('../models/OTPSession');
const Admin = require('../models/Admin');
const emailService = require('../utils/emailService');
const { validatePasswordStrength, hashPassword } = require('../utils/passwordUtils');
const {
  incrementAttempts,
  getAttempts,
  clearAttempts,
  checkOtpRequestThrottle,
  recordOtpRequestSent,
} = require('../config/redis');
const { parseDeviceModel } = require('../utils/deviceParser');
const { resolveLocation } = require('../utils/ipLookup');
const TrustedDevice = require('../models/TrustedDevice');
const AuditLog = require('../models/AuditLog');
const axios = require('axios');

// Helper: createSession
const createSession = async (userId, userModel, token, req, opts = {}) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const refreshTokenHash = opts.refreshToken
    ? crypto.createHash('sha256').update(opts.refreshToken).digest('hex')
    : null;
  const ua = req.headers['user-agent'] || 'Unknown Device';
  const fingerprint = req.headers['x-device-fingerprint'] || null;
  
  const clientHw = req.headers['x-hardware-model'] || req.headers['sec-ch-ua-model'] || req.body?.clientDeviceModel;
  const parsedModel = parseDeviceModel(ua, clientHw);

  // Check and register/update device in TrustedDevice collection
  let isTrusted = false;
  let isNewDevice = false;
  let isRevokedDevice = false;
  let wasTrusted = false;

  if (fingerprint) {
    const existing = await TrustedDevice.findOne({ userId, deviceFingerprint: fingerprint });

    if (existing) {
      isRevokedDevice = Boolean(existing.isRevoked);
      wasTrusted = !existing.isRevoked && (existing.isTrusted === true);
      // A revoked device can NEVER be silently re-trusted during session creation
      isTrusted = isRevokedDevice ? false : (opts.explicitTrust === true ? true : wasTrusted);
      existing.lastSeenAt = new Date();
      existing.deviceModel = parsedModel;
      if (!isRevokedDevice && opts.explicitTrust === true) {
        existing.isTrusted = true;
        existing.trustedAt = existing.trustedAt || new Date();
      }
      await existing.save();
    } else {
      // Security invariant: newly seen devices always start as UNTRUSTED (false) unless explicitly trusted via verified step-up
      isNewDevice = true;
      isTrusted = opts.explicitTrust === true;
      try {
        await TrustedDevice.create({
          userId,
          userModel,
          deviceFingerprint: fingerprint,
          deviceModel: parsedModel,
          deviceLabel: parsedModel,
          deviceInfo: ua,
          isTrusted: isTrusted,
          trustedAt: isTrusted ? new Date() : null,
          lastSeenAt: new Date(),
          isRevoked: false
        });
      } catch (e) {
        // Ignore duplicate key collision on race condition
      }
    }
  }

  const finalIsTrusted = isRevokedDevice ? false : (opts.isTrusted !== undefined ? opts.isTrusted : isTrusted);

  const existingSession = fingerprint
    ? await SessionToken.findOne({ userId, userModel, isValid: true, deviceFingerprint: fingerprint })
    : null;

  if (existingSession) {
    existingSession.tokenHash = tokenHash;
    existingSession.refreshTokenHash = refreshTokenHash;
    existingSession.deviceInfo = ua;
    existingSession.deviceModel = parsedModel;
    existingSession.isTrusted = finalIsTrusted;
    existingSession.lastUsed = new Date();
    await existingSession.save();
  } else {
    await SessionToken.create({
      userId,
      userModel,
      tokenHash,
      refreshTokenHash,
      deviceInfo: ua,
      deviceFingerprint: fingerprint,
      deviceModel: parsedModel,
      isTrusted: finalIsTrusted,
      isValid: true,
      lastUsed: new Date()
    });
  }

  return { isTrusted: finalIsTrusted, parsedModel, isNewDevice, isRevokedDevice, wasTrusted };
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
      return res.status(400).json({ error: 'Password does not meet the 12-character strength and 72-byte maximum policy.' });
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
      await emailService.sendWelcomeEmail(email, fullName, 'doctor', require('../services/recipientLanguageService').languageOptionsForRecord('Doctor', doctor));
    } catch (e) {
      console.error('Welcome email failed:');
    }

    return res.status(201).json({ message: "Registered", data: { doctorId } });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
      return res.status(400).json({ error: "Email or License already exists" });
    }
    return res.status(500).json({ error: "Registration failed" });
  }
};

exports.registerPatient = async (req, res) => {
  try {
    const { fullName, email, password, nic, dateOfBirth, gender, contactInfo } = req.body;
    
    if (!fullName || !email || !password || !nic) {
      return res.status(400).json({ error: 'Required fields: fullName, email, password, nic' });
    }

    const normalizedNic = require('../security/nicBlindIndex').normalizeNic(nic);
    const existing = await Patient.findOne({ $or: [{ email }, nicFilter(normalizedNic, { plainFields: ['nic'] })] });
    if (existing) return res.status(400).json({ error: 'Email or NIC already registered' });

    const hashedPassword = await hashPassword(password);

    const patient = new Patient({
      fullName, email, password: hashedPassword, nic: normalizedNic, ...writeNicFields(normalizedNic), dateOfBirth, gender, contactInfo, riskLevel: 'low', riskScore: 0
    });
    
    await patient.save();

    return res.status(201).json({ message: "Patient registered", data: { id: patient._id } });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('11000'))) {
      return res.status(400).json({ error: "Email or NIC already exists" });
    }
    console.error("REGISTRATION ERROR:");
    return res.status(500).json({ error: "Registration failed" });
  }
};

exports.registerPharmacyStaff = async (_req, res) => {
  return res.status(403).json({ error: 'PHARMACY_ADMIN_PROVISIONING_REQUIRED', message: 'Staff accounts must be provisioned by the authorized pharmacy administrator.' });
};

exports.login = async (req, res) => {
  let failureStep = 'login_lookup';
  try {
    const { email, identifier, nic, regNo, doctorId, password, role, loginType } = req.body;
    let cleanId, emailPattern;
    try {
      const policy = require('../security/loginIdentifier');
      cleanId = policy.normalizeLoginIdentifier(email || identifier || nic || regNo || doctorId || '');
      emailPattern = policy.literalIdentifierPattern(cleanId);
    } catch (_) { return res.status(400).json({ error: 'A valid login identifier is required' }); }
    if (!cleanId || !password) {
      return res.status(400).json({ error: 'Email/identifier and password are required' });
    }

    let user;
    let modelName;
    let matchingOrgLogin = null;

    if (role === 'doctor') {
      user = await Doctor.findOne({
        $or: [
          { email: emailPattern },
          { doctorId: cleanId.toUpperCase() },
          { 'orgLogins.orgEmail': emailPattern }
        ]
      });
      modelName = 'Doctor';
      if (user && user.orgLogins) {
        matchingOrgLogin = user.orgLogins.find(
          org => org.orgEmail && org.orgEmail.toLowerCase() === cleanId.toLowerCase()
        );
      }
    } else if (role === 'patient') {
      user = await Patient.findOne({
        $or: [
          { email: emailPattern },
          ...(/^(?:[0-9]{12}|[0-9]{9}[vVxX])$/.test(cleanId) ? [nicFilter(cleanId, { plainFields: ['nic'] })] : [])
        ]
      });
      modelName = 'Patient';
    } else if (role === 'pharmacist' || role === 'pharmacy_admin') {
      user = await PharmacyStaff.findOne({
        email: emailPattern
      }).populate('pharmacyId');
      modelName = 'PharmacyStaff';
    } else if (role === 'hospital_admin' || role === 'hospital') {
      user = await Hospital.findOne({
        $or: [
          { email: emailPattern },
          { regNo: cleanId.toUpperCase() }
        ]
      });
      modelName = 'Hospital';
    } else if (role === 'admin' || role === 'super_admin') {
      user = await Admin.findOne({
        email: emailPattern
      });
      modelName = 'Admin';
    } else {
      // Universal fallback across all models
      user = await Doctor.findOne({
        $or: [
          { email: emailPattern },
          { doctorId: cleanId.toUpperCase() },
          { 'orgLogins.orgEmail': emailPattern }
        ]
      });
      if (user) {
        modelName = 'Doctor';
        matchingOrgLogin = user.orgLogins?.find(
          org => org.orgEmail && org.orgEmail.toLowerCase() === cleanId.toLowerCase()
        );
      }
      if (!user) {
        user = await Patient.findOne({
          $or: [
            { email: emailPattern },
            ...(/^(?:[0-9]{12}|[0-9]{9}[vVxX])$/.test(cleanId) ? [nicFilter(cleanId, { plainFields: ['nic'] })] : [])
          ]
        });
        if (user) modelName = 'Patient';
      }
      if (!user) {
        user = await PharmacyStaff.findOne({ email: emailPattern }).populate('pharmacyId');
        if (user) modelName = 'PharmacyStaff';
      }
      if (!user) {
        user = await Hospital.findOne({
          $or: [
            { email: emailPattern },
            { regNo: cleanId.toUpperCase() }
          ]
        });
        if (user) modelName = 'Hospital';
      }
      if (!user) {
        user = await Admin.findOne({ email: emailPattern });
        if (user) modelName = 'Admin';
      }
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    try { require('../security/accountState').assertLoginAccount(user, modelName); }
    catch (_) { return res.status(403).json({ error: 'Account verification required' }); }

    // Password validation (support orgLogin tempPassword / hospital password)
    failureStep = 'password_compare';
    let isMatch = false;
    if (matchingOrgLogin) {
      if (matchingOrgLogin.tempPassword) {
        isMatch = await bcrypt.compare(password, matchingOrgLogin.tempPassword);
      }
      if (!isMatch && matchingOrgLogin.password) {
        isMatch = await bcrypt.compare(password, matchingOrgLogin.password);
      }
      if (!isMatch) {
        isMatch = await bcrypt.compare(password, user.password);
      }
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if the incoming device fingerprint belongs to a revoked device
    failureStep = 'device_lookup';
    const loginFingerprint = req.headers['x-device-fingerprint'] || null;
    let existingDeviceRecord = null;
    if (loginFingerprint) {
      existingDeviceRecord = await TrustedDevice.findOne({
        userId: user._id,
        deviceFingerprint: loginFingerprint
      });
    }
    const isRevokedDeviceLogin = Boolean(existingDeviceRecord && existingDeviceRecord.isRevoked);
    const hasTwoFactor = Boolean(
      user.twoFactorEnabled ||
      user._doc?.twoFactorEnabled ||
      (typeof user.get === 'function' && user.get('twoFactorEnabled'))
    );

    if (hasTwoFactor || isRevokedDeviceLogin) {
      failureStep = 'otp';
      const authOtpKey = 'auth:' + String(user._id);
      const verifyLockoutCount = await getAttempts(authOtpKey);
      if (verifyLockoutCount >= 5) {
        return res.status(429).json({
          error: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
          message: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
        });
      }

      const latestLoginOtp = await OTPSession.findOne({
        userId: user._id,
        purpose: 'login',
      }).sort({ createdAt: -1 });
      const priorFailedAttempts = Number(latestLoginOtp?._doc?.failedAttempts || latestLoginOtp?.failedAttempts || 0);
      if (priorFailedAttempts >= 5) {
        return res.status(429).json({
          error: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
          message: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
        });
      }

      const throttle = await checkOtpRequestThrottle(authOtpKey, req.ip, { cooldownSeconds: 0 });
      if (!throttle.allowed) {
        return res.status(throttle.statusCode).json({
          error: throttle.message,
          message: throttle.message,
          retryAfterSeconds: throttle.retryAfterSeconds,
          errorCode: throttle.reason,
        });
      }

      const destEmail =
        user.email ||
        user.personalEmail ||
        user.contactInfo?.email ||
        (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);

      if (!destEmail) {
        return res.status(400).json({
          error: 'No valid email address is registered for this account.',
          message: 'No valid email address is registered for this account.',
          providerAccepted: false,
          deliveryQueued: false,
          deliveryConfirmed: false,
        });
      }

      const otp = crypto.randomInt(100000, 1000000).toString();
      const hashedOtp = await bcrypt.hash(otp, 10);
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // Invalidate any previous unused login OTPs before issuing a new one
      await OTPSession.updateMany(
        { userId: user._id, purpose: 'login', used: false },
        { $set: { used: true } }
      );

      const otpDoc = await OTPSession.create({
        userId: user._id,
        userModel: modelName,
        otp: hashedOtp,
        expiresAt,
        purpose: 'login',
        failedAttempts: priorFailedAttempts,
      });

      const emailResult = await emailService.sendOTPEmail(destEmail, user.fullName || user.name || 'User', otp, require('../services/recipientLanguageService').languageOptionsForRecord(modelName, user));
      if (!emailResult || !emailResult.providerAccepted) {
        await OTPSession.deleteOne({ _id: otpDoc._id });
        return res.status(emailResult?.statusCode || 503).json({
          error: emailResult?.errorCode === 'invalid_recipient'
            ? 'Invalid recipient email address.'
            : 'Unable to deliver verification OTP email right now. Please try again shortly.',
          message: emailResult?.errorCode === 'invalid_recipient'
            ? 'Invalid recipient email address.'
            : 'Unable to deliver verification OTP email right now. Please try again shortly.',
          providerAccepted: false,
          deliveryQueued: Boolean(emailResult?.deliveryQueued),
          deliveryConfirmed: false,
          errorCode: emailResult?.errorCode || 'email_delivery_failed',
        });
      }

      await recordOtpRequestSent(authOtpKey, req.ip);

      const maskedEmail = destEmail.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));

      return res.status(200).json({
        data: {
          requiresOTP: true,
          userId: user._id,
          emailHint: maskedEmail,
          role: user.role || role || (modelName === 'Hospital' ? 'hospital_admin' : (modelName === 'Admin' ? 'admin' : 'patient')),
          reason: isRevokedDeviceLogin && !hasTwoFactor ? 'revoked_device' : '2fa',
          providerAccepted: true,
          deliveryQueued: false,
          deliveryConfirmed: false,
          provider: emailResult.provider,
          fallbackUsed: Boolean(emailResult.fallbackUsed),
        },
        message: isRevokedDeviceLogin && !hasTwoFactor
          ? "This device was previously revoked. Please verify the OTP sent to your email to continue."
          : "OTP sent to your email"
      });
    }

    const actualRole = user.role || role || (modelName === 'Hospital' ? 'hospital_admin' : (modelName === 'Admin' ? 'admin' : (modelName === 'PharmacyStaff' ? user.role : 'patient')));
    const subId = user.doctorId || user.nic || user.regNo || user._id;
    const name = user.fullName || user.name || 'User';

    const tokenPayload = { id: user._id, role: actualRole, sub: subId };
    if (modelName === 'Patient' && user.nic) {
      tokenPayload.nic = user.nic;
    }
    failureStep = 'token_access';
    const accessToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_SECRET, { expiresIn: '15m' });
    failureStep = 'token_refresh';
    const refreshToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    failureStep = 'session_persistence';
    const sessionResult = await createSession(user._id, modelName, accessToken, req, { refreshToken });

    // Record security audit event for untrusted or newly seen device logins (never log raw tokens/OTPs)
    if (sessionResult.isNewDevice || sessionResult.isRevokedDevice || !sessionResult.isTrusted) {
      try {
        await AuditLog.create({
          actorId: user._id,
          actorRole: actualRole,
          action: 'Untrusted Login Attempt',
          deviceModel: sessionResult.parsedModel
        });
      } catch (_) {}
    }

    // Track last login
    failureStep = 'account_last_login';
    user.lastLoginAt = new Date();
    await user.save();

    // Check if hospital doctor first-login password change required
    const isFirstLogin = matchingOrgLogin ? matchingOrgLogin.mustChangePassword : false;

    // -- LOGIN NOTIFICATION EMAIL --
    if (process.env.SKIP_LOGIN_NOTIFICATION !== 'true') {
      try {
        const emailToSend = user.email || (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);
        const idField = user.doctorId || user.nic || user.regNo || user.email;
        const deviceModel = req.headers['x-hardware-model'] || sessionResult.parsedModel || parseDeviceModel(req.headers['user-agent']);
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        const networkInfo = await resolveLocation(ip);
        const isTrusted = sessionResult.isTrusted;
        console.log(`[AUTH LOGIN NOTIFICATION] Role: ${actualRole} | Device: ${deviceModel} | isTrusted: ${isTrusted}`);
        const resNotification = await emailService.sendLoginNotificationEmail(emailToSend, name, idField, actualRole, deviceModel, networkInfo, 'Individual Login', null, isTrusted, require('../services/recipientLanguageService').languageOptionsForRecord(modelName, user));
        console.log(`[AUTH LOGIN NOTIFICATION RESULT]`, {
          provider: resNotification?.provider || null,
          providerAccepted: Boolean(resNotification?.providerAccepted),
          deliveryQueued: Boolean(resNotification?.deliveryQueued),
          fallbackUsed: Boolean(resNotification?.fallbackUsed),
          deliveryConfirmed: false,
        });
      } catch(e) {
        console.error('[AUTH LOGIN NOTIFICATION ERROR] Failed to send login notification:');
      }
    }


    failureStep = 'response';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ 
      data: {
        accessToken,
        refreshToken,
        role: actualRole,
        subId,
        nic: user.nic || undefined,
        name,
        staffName: user.fullName || name,
        pharmacyName: user.pharmacyId?.name || undefined,
        hospitalName: modelName === 'Hospital' ? user.name : undefined,
        isFirstLogin: isFirstLogin || false,
        orgLogins: require('../security/organizationLoginDto').organizationLoginDto(user.orgLogins),
        isTrusted: sessionResult.isTrusted
      },
      message: "Login successful"
    });

  } catch (err) {
    // Exceptions may contain credentials or patient fields. The diagnostic
    // formatter emits only fixed categories/messages and the failing stage.
    try { require('../security/safeFailureDiagnostic').reportFailure(err, failureStep); }
    catch (_) { console.error('[Failure] Login diagnostic unavailable.'); }
    return res.status(500).json({ error: "Login failed" });
  }
};

exports.verifyLoginOTP = async (req, res) => {
  try {
    const { userId, otp, trustDevice } = req.body;
    if (typeof userId !== 'string' || !/^[a-f0-9]{24}$/i.test(userId) || typeof otp !== 'string' || !/^[0-9]{6}$/.test(otp.trim())) {
      return res.status(400).json({ error: 'User ID and OTP are required', message: 'User ID and OTP are required' });
    }

    const authOtpKey = 'auth:' + String(userId);
    const attempts = await getAttempts(authOtpKey);
    if (attempts >= 5) {
      return res.status(429).json({
        error: 'Too many failed OTP attempts. Please request a new OTP or try again in 15 minutes.',
        message: 'Too many failed OTP attempts. Please request a new OTP or try again in 15 minutes.'
      });
    }

    // Look up the latest login OTP record to give accurate feedback for expired / already-used codes
    const latestOtpRecord = await OTPSession.findOne({
      userId,
      purpose: 'login'
    }).sort({ createdAt: -1 });

    if (!latestOtpRecord) {
      await incrementAttempts(authOtpKey);
      return res.status(400).json({ error: 'Invalid or expired OTP', message: 'Invalid or expired OTP' });
    }

    let user;
    let modelName = latestOtpRecord.userModel;

    if (modelName === 'Doctor') user = await Doctor.findById(userId);
    else if (modelName === 'Patient') user = await Patient.findById(userId);
    else if (modelName === 'PharmacyStaff') user = await PharmacyStaff.findById(userId).populate('pharmacyId');
    else if (modelName === 'Hospital') user = await Hospital.findById(userId);
    else if (modelName === 'Admin') user = await Admin.findById(userId);

    // A challenge is bound to its stored account model. A missing account must
    // never cause a search of another role's collection for the same ObjectId.
    if (!user) return res.status(404).json({ error: 'User not found' });

    const actualRole = user.role || (modelName === 'Doctor' ? 'doctor' : (modelName === 'Hospital' ? 'hospital_admin' : (modelName === 'Admin' ? 'admin' : 'patient')));
    try { require('../security/accountState').assertLoginAccount(user, modelName); }
    catch (_) { return res.status(403).json({ error: 'Account verification required' }); }

    // Prevent client-supplied role or email from selecting or asserting another user's role/account
    if (req.body.role && !doesClientRoleMatchServer(req.body.role, actualRole, modelName)) {
      return res.status(403).json({
        error: 'Role mismatch for OTP verification session.',
        message: 'Role mismatch for OTP verification session.'
      });
    }
    if (req.body.email) {
      const suppliedEmail = String(req.body.email).trim().toLowerCase();
      const userEmails = [user.email, user.personalEmail, user.contactInfo?.email]
        .filter(Boolean)
        .map(e => String(e).trim().toLowerCase());
      if (userEmails.length > 0 && !userEmails.includes(suppliedEmail)) {
        return res.status(403).json({
          error: 'Account mismatch for OTP verification session.',
          message: 'Account mismatch for OTP verification session.'
        });
      }
    }

    const persistedFailures = latestOtpRecord.failedAttempts === undefined ? 0 : latestOtpRecord.failedAttempts;
    if (!Number.isSafeInteger(persistedFailures) || persistedFailures < 0) throw new Error('MFA_COUNTER_INVALID');
    if (persistedFailures >= 5) {
      if (!latestOtpRecord.used) {
        await OTPSession.updateOne({ _id: latestOtpRecord._id }, { $set: { used: true } });
      }
      return res.status(429).json({
        error: 'Too many failed OTP attempts. Please request a new OTP or try again in 15 minutes.',
        message: 'Too many failed OTP attempts. Please request a new OTP or try again in 15 minutes.'
      });
    }

    if (latestOtpRecord.used) {
      await incrementAttempts(authOtpKey);
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new code.',
        message: 'This OTP has already been used. Please request a new code.'
      });
    }

    if (!Number.isFinite(new Date(latestOtpRecord.expiresAt).getTime()) || new Date(latestOtpRecord.expiresAt) <= new Date()) {
      await incrementAttempts(authOtpKey);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new code.',
        message: 'OTP has expired. Please request a new code.'
      });
    }

    const otpRecord = latestOtpRecord;
    const isMatch = await bcrypt.compare(String(otp).trim(), otpRecord.otp);
    if (!isMatch) {
      const newAttempts = await incrementAttempts(authOtpKey);
      const nextDocFailures = persistedFailures + 1;
      const effectiveFailures = Math.max(newAttempts, nextDocFailures);
      await OTPSession.collection.updateOne(
        { _id: otpRecord._id },
        {
          $inc: { failedAttempts: 1 },
          ...(effectiveFailures >= 5 ? { $set: { used: true } } : {}),
        }
      );
      return res.status(400).json({
        error: `Incorrect OTP. ${Math.max(0, 5 - effectiveFailures)} attempt(s) remaining.`,
        message: `Incorrect OTP. ${Math.max(0, 5 - effectiveFailures)} attempt(s) remaining.`
      });
    }

    // Atomically mark OTP as used (single-use under concurrent requests) and reset failedAttempts on success
    const claimedOtp = await OTPSession.findOneAndUpdate(
      { _id: otpRecord._id, userId: user._id, userModel: modelName, purpose: 'login', otp: otpRecord.otp,
        used: false, expiresAt: { $gt: new Date() }, failedAttempts: { $gte: 0, $lt: 5 } },
      { $set: { used: true, failedAttempts: 0 } },
      { returnDocument: 'after' }
    );
    if (!claimedOtp) {
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new code.',
        message: 'This OTP has already been used. Please request a new code.'
      });
    }

    await clearAttempts(authOtpKey);
    await clearAttempts('otp-resend:' + String(userId));

    const subId = user.doctorId || user.nic || user.regNo || user._id;
    const name = user.fullName || user.name || 'User';

    const tokenPayload = { id: user._id, role: actualRole, sub: subId };
    if (modelName === 'Patient' && user.nic) {
      tokenPayload.nic = user.nic;
    }
    const accessToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Completing login OTP authenticates the session; it does NOT automatically un-revoke a revoked device
    // unless the user explicitly requested device trust (or trusts it later from Trusted Devices settings).
    const sessionResult = await createSession(user._id, modelName, accessToken, req, {
      fromOTP: true,
      explicitTrust: trustDevice === true,
      refreshToken
    });

    const fp = req.headers['x-device-fingerprint'];
    if (fp) {
      const deviceModel = req.headers['x-hardware-model'] || sessionResult.parsedModel || parseDeviceModel(req.headers['user-agent']);
      if (!sessionResult.isTrusted) {
        await AuditLog.create({
          actorId: user._id,
          actorRole: actualRole,
          action: 'Untrusted Login Attempt',
          deviceModel: deviceModel
        });
      }

      const existingDevice = await TrustedDevice.findOne({ userId: user._id, deviceFingerprint: fp });
      if (existingDevice) {
        existingDevice.lastSeenAt = new Date();
        existingDevice.deviceModel = deviceModel;
        // Never silently clear isRevoked during login; explicit device trust is handled via /api/devices/my/:id/trust
        if (!existingDevice.isRevoked && trustDevice === true) {
          existingDevice.isTrusted = true;
          existingDevice.trustedAt = existingDevice.trustedAt || new Date();
        }
        await existingDevice.save();
      }
    }
    // Track last login
    user.lastLoginAt = new Date();
    await user.save();

    // -- LOGIN NOTIFICATION EMAIL --
    if (process.env.SKIP_LOGIN_NOTIFICATION !== 'true') {
      try {
        const emailToSend = user.email || (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);
        const idField = user.doctorId || user.nic || user.regNo || user.email;
        const deviceModel = req.headers['x-hardware-model'] || sessionResult.parsedModel || parseDeviceModel(req.headers['user-agent']);
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        const networkInfo = await resolveLocation(ip);
        const isTrusted = sessionResult.isTrusted;
        console.log(`[AUTH LOGIN OTP NOTIFICATION] Role: ${actualRole} | Device: ${deviceModel} | isTrusted: ${isTrusted}`);
        const resNotification = await emailService.sendLoginNotificationEmail(emailToSend, name, idField, actualRole, deviceModel, networkInfo, 'Individual Login', null, isTrusted, require('../services/recipientLanguageService').languageOptionsForRecord(modelName, user));
        console.log(`[AUTH LOGIN OTP NOTIFICATION RESULT]`, {
          provider: resNotification?.provider || null,
          providerAccepted: Boolean(resNotification?.providerAccepted),
          deliveryQueued: Boolean(resNotification?.deliveryQueued),
          fallbackUsed: Boolean(resNotification?.fallbackUsed),
          deliveryConfirmed: false,
        });
      } catch(e) {
        console.error('[AUTH LOGIN OTP NOTIFICATION ERROR] Failed to send login notification:');
      }
    }


    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ 
      data: {
        accessToken,
        refreshToken,
        role: actualRole,
        subId,
        nic: user.nic || undefined,
        name,
        staffName: user.fullName || name,
        pharmacyName: user.pharmacyId?.name || undefined,
        hospitalName: modelName === 'Hospital' ? user.name : undefined,
        orgLogins: require('../security/organizationLoginDto').organizationLoginDto(user.orgLogins),
        isTrusted: sessionResult.isTrusted
      },
      message: "Login successful"
    });

  } catch (err) {
    return res.status(500).json({ error: "OTP verification failed" });
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { email, userId, purpose, role } = req.body;
    const otpPurpose = purpose || 'login';
    if (!['login', 'password-reset'].includes(otpPurpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose', message: 'Invalid OTP purpose' });
    }
    const rateKey = 'otp-resend:' + String(userId || email || req.ip);
    const resendAttempts = await getAttempts(rateKey);
    if (resendAttempts >= 5) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please wait a few minutes before requesting another code.',
        message: 'Too many OTP requests. Please wait a few minutes before requesting another code.'
      });
    }

    let user = null;
    let model = 'Doctor';

    if (userId) {
      user = await Doctor.findById(userId); if (user) model = 'Doctor';
      if (!user) { user = await Patient.findById(userId); if (user) model = 'Patient'; }
      if (!user) { user = await PharmacyStaff.findById(userId); if (user) model = 'PharmacyStaff'; }
      if (!user) { user = await Hospital.findById(userId); if (user) model = 'Hospital'; }
      if (!user) { user = await Admin.findById(userId); if (user) model = 'Admin'; }
    } else if (email) {
      user = await Doctor.findOne({ $or: [{ email }, { personalEmail: email }] });
      model = 'Doctor';
      if (!user) {
        user = await Patient.findOne({ $or: [{ email }, { 'contactInfo.email': email }] });
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
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const actualRole = user.role || (model === 'Doctor' ? 'doctor' : (model === 'Hospital' ? 'hospital_admin' : (model === 'Admin' ? 'admin' : 'patient')));
    if (role && !doesClientRoleMatchServer(role, actualRole, model)) {
      return res.status(403).json({ error: 'Role mismatch for OTP request.' });
    }
    if (userId && email) {
      const suppliedEmail = String(email).trim().toLowerCase();
      const userEmails = [user.email, user.personalEmail, user.contactInfo?.email]
        .filter(Boolean)
        .map(e => String(e).trim().toLowerCase());
      if (userEmails.length > 0 && !userEmails.includes(suppliedEmail)) {
        return res.status(403).json({ error: 'Account mismatch for OTP request.' });
      }
    }

    const attemptNamespace = otpPurpose === 'login' ? 'auth:' : otpPurpose === 'password-reset' ? 'reset:' : 'verify:';
    const userRateKey = attemptNamespace + String(user._id);
    const userResendKey = 'otp-resend:' + String(user._id);

    const userResendAttempts = await getAttempts(userResendKey);
    if (userResendAttempts >= 5) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please wait before requesting another code.',
        message: 'Too many OTP requests. Please wait before requesting another code.'
      });
    }

    // Check if the user is locked out due to 5 failed verification attempts
    const verifyLockoutCount = await getAttempts(userRateKey);
    if (verifyLockoutCount >= 5) {
      return res.status(429).json({
        error: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
        message: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.'
      });
    }

    // Also check persisted failedAttempts in MongoDB on the latest OTP session for this purpose
    const latestSession = await OTPSession.findOne({ userId: user._id, purpose: otpPurpose }).sort({ createdAt: -1 });
    const persistedSessionFailures = Number(latestSession?._doc?.failedAttempts || latestSession?.failedAttempts || 0);
    if (persistedSessionFailures >= 5) {
      return res.status(429).json({
        error: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
        message: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.'
      });
    }

    const throttle = await checkOtpRequestThrottle(userRateKey, req.ip);
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        error: throttle.message,
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    const emailToSend =
      user.email ||
      user.personalEmail ||
      user.contactInfo?.email ||
      (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);

    if (!emailToSend) {
      return res.status(400).json({
        error: 'No valid email address registered for this user.',
        message: 'No valid email address registered for this user.',
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Invalidate all previous unused OTPs for this user and purpose so old codes cannot be used
    await OTPSession.updateMany(
      { userId: user._id, purpose: otpPurpose, used: false },
      { $set: { used: true } }
    );

    const otpDoc = await OTPSession.create({
      userId: user._id,
      userModel: model,
      otp: hashedOtp,
      expiresAt,
      purpose: otpPurpose,
      failedAttempts: persistedSessionFailures,
    });

    const emailResult = await emailService.sendOTPEmail(emailToSend, user.fullName || user.name || 'User', otp, require('../services/recipientLanguageService').languageOptionsForRecord(model, user));
    if (!emailResult || !emailResult.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpDoc._id });
      return res.status(emailResult?.statusCode || 503).json({
        error: emailResult?.errorCode === 'invalid_recipient'
          ? 'Invalid recipient email address.'
          : 'Unable to deliver OTP email right now. Please try again shortly.',
        message: emailResult?.errorCode === 'invalid_recipient'
          ? 'Invalid recipient email address.'
          : 'Unable to deliver OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await incrementAttempts(rateKey);
    if (userResendKey !== rateKey) {
      await incrementAttempts(userResendKey);
    }
    await recordOtpRequestSent(userRateKey, req.ip);

    return res.status(200).json({
      message: "OTP sent",
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send OTP" });
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
          await emailService.sendLoginNotificationEmail(orgLogin.orgEmail, doctor.fullName, doctor.doctorId, 'doctor', deviceModel, networkInfo, 'Hospital Login', hospital ? hospital.name : 'Unknown Hospital', true, require('../services/recipientLanguageService').languageOptionsForRecord('Doctor', doctor));
        }
      } catch(e) {
        console.error('Failed to send hospital login notification:');
      }

      return res.status(200).json({ data: { loginType, hospitalId, hospitalName: hospital ? hospital.name : 'Hospital' }, message: "Workspace set" });
    }
    
    return res.status(200).json({ data: { loginType: 'personal' }, message: "Workspace set to Personal" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to set login type" });
  }
};

function doesClientRoleMatchServer(clientRole, actualRole, modelName) {
  if (!clientRole) return true;
  const r = String(clientRole).toLowerCase().trim();
  if (modelName === 'Doctor') return r === 'doctor';
  if (modelName === 'Patient') return r === 'patient';
  if (modelName === 'PharmacyStaff') return ['pharmacist', 'pharmacy_admin', 'assistant', 'pharmacy'].includes(r);
  if (modelName === 'Hospital') return ['hospital_admin', 'hospital'].includes(r);
  if (modelName === 'Admin') return ['admin', 'super_admin'].includes(r);
  return r === String(actualRole || '').toLowerCase();
}

function normalizeRoleToModel(role) {
  if (!role || typeof role !== 'string') return null;
  const r = role.toLowerCase().trim();
  if (r === 'admin' || r === 'super_admin') return 'Admin';
  if (r === 'doctor') return 'Doctor';
  if (r === 'patient') return 'Patient';
  if (r === 'pharmacist' || r === 'pharmacy_admin' || r === 'assistant' || r === 'pharmacy') return 'PharmacyStaff';
  if (r === 'hospital_admin' || r === 'hospital') return 'Hospital';
  return null;
}

function verifyAuthenticated2FAOwner(req, user, modelName) {
  if (!req.user || !req.user.id || !user || String(user._id) !== String(req.user.id)) {
    return { ok: false, status: 403, error: 'Only the authenticated account owner can change their 2FA settings.' };
  }
  const suppliedUserId = req.body?.userId || req.query?.userId || req.params?.userId;
  if (suppliedUserId && String(suppliedUserId) !== String(req.user.id)) {
    return { ok: false, status: 403, error: 'Only the authenticated account owner can change their 2FA settings.' };
  }
  const suppliedRole = req.body?.role || req.query?.role;
  if (suppliedRole && !doesClientRoleMatchServer(suppliedRole, req.user.role, modelName)) {
    return { ok: false, status: 403, error: 'Only the authenticated account owner can change their 2FA settings.' };
  }
  const suppliedEmail = req.body?.email || req.query?.email;
  if (suppliedEmail) {
    const cleanEmail = String(suppliedEmail).trim().toLowerCase();
    const userEmails = [user.email, user.personalEmail, user.contactInfo?.email]
      .filter(Boolean)
      .map(e => String(e).trim().toLowerCase());
    if (userEmails.length > 0 && !userEmails.includes(cleanEmail)) {
      return { ok: false, status: 403, error: 'Only the authenticated account owner can change their 2FA settings.' };
    }
  }
  return { ok: true };
}

async function resolveAuthenticatedUserAndModel(authUser) {
  if (!authUser || !authUser.id) return { user: null, modelName: null };
  const role = authUser.role;
  if (role === 'doctor') {
    const user = await Doctor.findById(authUser.id);
    if (user) return { user, modelName: 'Doctor' };
  } else if (role === 'patient') {
    const user = await Patient.findById(authUser.id);
    if (user) return { user, modelName: 'Patient' };
  } else if (role === 'pharmacist' || role === 'pharmacy_admin' || role === 'assistant') {
    const user = await PharmacyStaff.findById(authUser.id);
    if (user) return { user, modelName: 'PharmacyStaff' };
  } else if (role === 'hospital_admin' || role === 'hospital') {
    const user = await Hospital.findById(authUser.id);
    if (user) return { user, modelName: 'Hospital' };
  } else if (role === 'admin' || role === 'super_admin') {
    const user = await Admin.findById(authUser.id);
    if (user) return { user, modelName: 'Admin' };
  }
  return { user: null, modelName: null };
}

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { user, modelName } = await resolveAuthenticatedUserAndModel(req.user);
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'New password is too weak.' });
    }

    await require('../services/passwordChangeService').changePasswordAtomic({ user, UserModel: user.constructor, userModel: modelName, newHash: await hashPassword(newPassword) });
    res.clearCookie('refreshToken');

    return res.status(200).json({ message: "Password changed. Please log in again." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to change password" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !emailService.isValidEmailAddress(email)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.',
        message: 'Please provide a valid email address.',
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
      });
    }

    const normalizedEmail = String(email).trim();
    const requestedModel = normalizeRoleToModel(role);

    let user = null;
    let model = requestedModel || 'Doctor';

    if (requestedModel === 'Admin') {
      user = await Admin.findOne({ email: normalizedEmail });
    } else if (requestedModel === 'Doctor') {
      user = await Doctor.findOne({ $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }] });
    } else if (requestedModel === 'Patient') {
      user = await Patient.findOne({ $or: [{ email: normalizedEmail }, { 'contactInfo.email': normalizedEmail }] });
    } else if (requestedModel === 'PharmacyStaff') {
      user = await PharmacyStaff.findOne({ email: normalizedEmail });
    } else if (requestedModel === 'Hospital') {
      user = await Hospital.findOne({ email: normalizedEmail });
    } else {
      user = await Doctor.findOne({ $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }] });
      model = 'Doctor';
      if (!user) { user = await Patient.findOne({ $or: [{ email: normalizedEmail }, { 'contactInfo.email': normalizedEmail }] }); model = 'Patient'; }
      if (!user) { user = await PharmacyStaff.findOne({ email: normalizedEmail }); model = 'PharmacyStaff'; }
      if (!user) { user = await Hospital.findOne({ email: normalizedEmail }); model = 'Hospital'; }
      if (!user) { user = await Admin.findOne({ email: normalizedEmail }); model = 'Admin'; }
    }

    // Always return success to prevent email enumeration when user does not exist
    if (!user) return res.status(200).json({ message: "If that email exists, an OTP was sent" });

    const resetKey = 'reset:' + String(user._id);
    const throttle = await checkOtpRequestThrottle(resetKey, req.ip);
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
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await OTPSession.updateMany(
      { userId: user._id, purpose: 'password-reset', used: false },
      { $set: { used: true } }
    );

    const otpDoc = await OTPSession.create({
      userId: user._id,
      userModel: model,
      otp: hashedOtp,
      expiresAt,
      purpose: 'password-reset'
    });

    const emailToSend =
      (user.personalEmail && user.personalEmail.toLowerCase() === normalizedEmail.toLowerCase()
        ? user.personalEmail
        : null) ||
      user.email ||
      user.personalEmail ||
      user.contactInfo?.email ||
      (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : normalizedEmail);

    const emailResult = await emailService.sendOTPEmail(emailToSend, user.fullName || user.name || 'User', otp, require('../services/recipientLanguageService').languageOptionsForRecord(model, user));
    if (!emailResult || !emailResult.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpDoc._id });
      return res.status(emailResult?.statusCode || 503).json({
        error: 'Unable to deliver password recovery OTP email right now. Please try again shortly.',
        message: 'Unable to deliver password recovery OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(resetKey, req.ip);

    return res.status(200).json({
      message: "If that email exists, an OTP was sent",
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
    });
  } catch (err) {
    return res.status(500).json({ error: "Request failed" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, role } = req.body;
    const normalizedEmail = String(email || '').trim();
    const requestedModel = normalizeRoleToModel(role);
    if (!requestedModel) return res.status(400).json({ error: 'Explicit account role required' });

    let user = null;
    if (requestedModel === 'Admin') user = await Admin.findOne({ email: normalizedEmail });
    else if (requestedModel === 'Doctor') user = await Doctor.findOne({ $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }] });
    else if (requestedModel === 'Patient') user = await Patient.findOne({ $or: [{ email: normalizedEmail }, { 'contactInfo.email': normalizedEmail }] });
    else if (requestedModel === 'PharmacyStaff') user = await PharmacyStaff.findOne({ email: normalizedEmail });
    else if (requestedModel === 'Hospital') user = await Hospital.findOne({ email: normalizedEmail });
    else {
      user = await Doctor.findOne({ $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }] });
      if (!user) user = await Patient.findOne({ $or: [{ email: normalizedEmail }, { 'contactInfo.email': normalizedEmail }] });
      if (!user) user = await PharmacyStaff.findOne({ email: normalizedEmail });
      if (!user) user = await Hospital.findOne({ email: normalizedEmail });
      if (!user) user = await Admin.findOne({ email: normalizedEmail });
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const resetKey = 'reset:' + String(user._id);
    const attempts = await getAttempts(resetKey);
    if (attempts >= 5) {
      return res.status(429).json({
        error: 'Too many failed OTP attempts. Please try again later.',
        message: 'Too many failed OTP attempts. Please try again later.'
      });
    }

    const otpRecord = await OTPSession.findOne({
      userId: user._id,
      userModel: requestedModel,
      purpose: 'password-reset',
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      await incrementAttempts(resetKey);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const persistedFailures = Number(otpRecord._doc?.failedAttempts || otpRecord.failedAttempts || 0);
    if (persistedFailures >= 5) {
      await OTPSession.updateOne({ _id: otpRecord._id }, { $set: { used: true } });
      return res.status(429).json({
        error: 'Too many failed OTP attempts. Please try again later.',
        message: 'Too many failed OTP attempts. Please try again later.'
      });
    }

    const isMatch = await bcrypt.compare(String(otp || '').trim(), otpRecord.otp);
    if (!isMatch) {
      const newAttempts = await incrementAttempts(resetKey);
      const nextDocFailures = persistedFailures + 1;
      await OTPSession.collection.updateOne(
        { _id: otpRecord._id },
        {
          $inc: { failedAttempts: 1 },
          ...(newAttempts >= 5 || nextDocFailures >= 5 ? { $set: { used: true } } : {}),
        }
      );
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid || strength.score < 3) {
      return res.status(400).json({ error: 'New password is too weak.' });
    }

    await require('../services/passwordChangeService').changePasswordAtomic({ user, UserModel: user.constructor, userModel: otpRecord.userModel, newHash: await hashPassword(newPassword), proof: {
      model: OTPSession, filter: { _id: otpRecord._id, userId: user._id, userModel: otpRecord.userModel, purpose: 'password-reset', used: false, expiresAt: { $gt: new Date() }, failedAttempts: { $lt: 5 } }, consumption: { used: true }
    } });
    await clearAttempts(resetKey);

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed" });
  }
};

exports.resetPasswordRecovery = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const RecoveryToken = require('../models/RecoveryToken');
    const recoveryToken = await RecoveryToken.findOne({
      tokenHash: crypto.createHash('sha256').update(String(token)).digest('hex'), consumedAt: null, purpose: 'password-reset',
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

    await require('../services/passwordChangeService').changePasswordAtomic({ user, UserModel: user.constructor, userModel: recoveryToken.userModel, newHash: await hashPassword(newPassword), proof: {
      model: RecoveryToken, filter: { _id: recoveryToken._id, userId: user._id, tokenHash: recoveryToken.tokenHash, consumedAt: null, expiresAt: { $gt: new Date() } }, consumption: { consumedAt: new Date() }
    } });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ error: "Reset failed" });
  }
};

exports.get2FAStatus = async (req, res) => {
  try {
    const { user, modelName } = await resolveAuthenticatedUserAndModel(req.user);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerCheck = verifyAuthenticated2FAOwner(req, user, modelName);
    if (!ownerCheck.ok) {
      return res.status(ownerCheck.status).json({ error: ownerCheck.error, message: ownerCheck.error });
    }

    const enabled = Boolean(
      user.twoFactorEnabled ||
      user._doc?.twoFactorEnabled ||
      (typeof user.get === 'function' && user.get('twoFactorEnabled'))
    );

    return res.status(200).json({
      data: {
        userId: user._id,
        role: req.user.role,
        userModel: modelName,
        twoFactorEnabled: enabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
};

exports.enable2FA = async (req, res) => {
  try {
    const { user, modelName } = await resolveAuthenticatedUserAndModel(req.user);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerCheck = verifyAuthenticated2FAOwner(req, user, modelName);
    if (!ownerCheck.ok) {
      return res.status(ownerCheck.status).json({ error: ownerCheck.error, message: ownerCheck.error });
    }

    const password = req.body?.password || req.body?.currentPassword;
    if (!password) {
      return res.status(400).json({
        error: 'Current password is required to enable two-factor authentication.',
        message: 'Current password is required to enable two-factor authentication.',
      });
    }

    const isPasswordMatch = await bcrypt.compare(String(password), user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        error: 'Incorrect current password',
        message: 'Incorrect current password',
      });
    }

    const setupKey = '2fa-setup:' + String(user._id);
    const lockoutCount = await getAttempts(setupKey);
    if (lockoutCount >= 5) {
      return res.status(429).json({
        error: 'Too many failed 2FA verification attempts. Please try again later.',
        message: 'Too many failed 2FA verification attempts. Please try again later.',
      });
    }

    const latestSetupOtp = await OTPSession.findOne({
      userId: user._id,
      purpose: '2fa-setup',
    }).sort({ createdAt: -1 });
    const priorFailedAttempts = Number(latestSetupOtp?._doc?.failedAttempts || latestSetupOtp?.failedAttempts || 0);
    if (priorFailedAttempts >= 5) {
      return res.status(429).json({
        error: 'Too many failed 2FA verification attempts. Please try again later.',
        message: 'Too many failed 2FA verification attempts. Please try again later.',
      });
    }

    const throttle = await checkOtpRequestThrottle(setupKey, req.ip, { cooldownSeconds: 0 });
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        error: throttle.message,
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    const destEmail =
      user.email ||
      user.personalEmail ||
      user.contactInfo?.email ||
      (typeof user.contactInfo === 'string' && user.contactInfo.includes('@') ? user.contactInfo : null);

    if (!destEmail) {
      return res.status(400).json({
        error: 'No valid email address is registered for this account.',
        message: 'No valid email address is registered for this account.',
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await OTPSession.updateMany(
      { userId: user._id, purpose: '2fa-setup', used: false },
      { $set: { used: true } }
    );

    const otpDoc = await OTPSession.create({
      userId: user._id,
      userModel: modelName || 'Doctor',
      otp: hashedOtp,
      expiresAt,
      purpose: '2fa-setup',
      failedAttempts: priorFailedAttempts,
    });

    const emailResult = await emailService.sendOTPEmail(destEmail, user.fullName || user.name || 'User', otp, require('../services/recipientLanguageService').languageOptionsForRecord(modelName || 'Doctor', user));
    if (!emailResult || !emailResult.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpDoc._id });
      return res.status(emailResult?.statusCode || 503).json({
        error: 'Unable to deliver 2FA verification OTP email right now. Please try again shortly.',
        message: 'Unable to deliver 2FA verification OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(setupKey, req.ip);

    const maskedEmail = destEmail.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));

    return res.status(200).json({
      data: {
        requiresOTP: true,
        purpose: '2fa-setup',
        emailHint: maskedEmail,
        providerAccepted: true,
        deliveryQueued: false,
        deliveryConfirmed: false,
        provider: emailResult.provider,
        fallbackUsed: Boolean(emailResult.fallbackUsed),
      },
      message: 'Verification OTP sent to your email to enable Two-Factor Authentication.',
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to initiate 2FA setup" });
  }
};

exports.verify2FASetup = async (req, res) => {
  try {
    const { user, modelName } = await resolveAuthenticatedUserAndModel(req.user);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerCheck = verifyAuthenticated2FAOwner(req, user, modelName);
    if (!ownerCheck.ok) {
      return res.status(ownerCheck.status).json({ error: ownerCheck.error, message: ownerCheck.error });
    }

    const rawCode = req.body?.otp ?? req.body?.token;
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: 'Verification OTP is required', message: 'Verification OTP is required' });
    }

    const setupKey = '2fa-setup:' + String(user._id);
    const attempts = await getAttempts(setupKey);
    if (attempts >= 5) {
      return res.status(429).json({
        error: 'Too many failed 2FA verification attempts. Please try again later.',
        message: 'Too many failed 2FA verification attempts. Please try again later.',
      });
    }

    const latestOtpRecord = await OTPSession.findOne({
      userId: user._id,
      userModel: modelName,
      purpose: '2fa-setup',
    }).sort({ createdAt: -1 });

    if (!latestOtpRecord) {
      await incrementAttempts(setupKey);
      return res.status(400).json({
        error: 'No pending 2FA verification session found. Please request a verification OTP first.',
        message: 'No pending 2FA verification session found. Please request a verification OTP first.',
      });
    }

    const persistedFailures = latestOtpRecord.failedAttempts === undefined ? 0 : latestOtpRecord.failedAttempts;
    if (!Number.isSafeInteger(persistedFailures) || persistedFailures < 0) throw new Error('MFA_COUNTER_INVALID');
    if (persistedFailures >= 5) {
      if (!latestOtpRecord.used) {
        await OTPSession.updateOne({ _id: latestOtpRecord._id }, { $set: { used: true } });
      }
      return res.status(429).json({
        error: 'Too many failed 2FA verification attempts. Please try again later.',
        message: 'Too many failed 2FA verification attempts. Please try again later.',
      });
    }

    if (latestOtpRecord.used) {
      await incrementAttempts(setupKey);
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new code.',
        message: 'This OTP has already been used. Please request a new code.',
      });
    }

    if (!Number.isFinite(new Date(latestOtpRecord.expiresAt).getTime()) || new Date(latestOtpRecord.expiresAt) <= new Date()) {
      await incrementAttempts(setupKey);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new code.',
        message: 'OTP has expired. Please request a new code.',
      });
    }

    const isMatch = await bcrypt.compare(code, latestOtpRecord.otp);
    if (!isMatch) {
      const newAttempts = await incrementAttempts(setupKey);
      const nextDocFailures = persistedFailures + 1;
      const effectiveFailures = Math.max(newAttempts, nextDocFailures);
      await OTPSession.collection.updateOne(
        { _id: latestOtpRecord._id },
        {
          $inc: { failedAttempts: 1 },
          ...(effectiveFailures >= 5 ? { $set: { used: true } } : {}),
        }
      );
      return res.status(400).json({
        error: `Incorrect OTP. ${Math.max(0, 5 - effectiveFailures)} attempt(s) remaining.`,
        message: `Incorrect OTP. ${Math.max(0, 5 - effectiveFailures)} attempt(s) remaining.`,
      });
    }

    const claimedOtp = await OTPSession.findOneAndUpdate(
      { _id: latestOtpRecord._id, userId: user._id, userModel: modelName, purpose: '2fa-setup', otp: latestOtpRecord.otp,
        used: false, expiresAt: { $gt: new Date() }, failedAttempts: { $gte: 0, $lt: 5 } },
      { $set: { used: true, failedAttempts: 0 } },
      { returnDocument: 'after' }
    );
    if (!claimedOtp) {
      return res.status(400).json({
        error: 'This OTP has already been used. Please request a new code.',
        message: 'This OTP has already been used. Please request a new code.',
      });
    }

    await clearAttempts(setupKey);

    user.twoFactorEnabled = true;
    if (user.otpSecret !== undefined) {
      user.otpSecret = undefined;
    }
    await user.save();

    return res.status(200).json({
      data: {
        userId: user._id,
        role: req.user.role,
        userModel: modelName,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      },
      message: "2FA enabled successfully",
    });
  } catch (err) {
    return res.status(500).json({ error: "Verification failed" });
  }
};

exports.toggle2FA = async (req, res) => {
  try {
    const { user, modelName } = await resolveAuthenticatedUserAndModel(req.user);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerCheck = verifyAuthenticated2FAOwner(req, user, modelName);
    if (!ownerCheck.ok) {
      return res.status(ownerCheck.status).json({ error: ownerCheck.error, message: ownerCheck.error });
    }

    const { enabled, twoFactorEnabled } = req.body || {};
    const password = req.body?.password || req.body?.currentPassword;
    const targetState = typeof enabled === 'boolean'
      ? enabled
      : (typeof twoFactorEnabled === 'boolean' ? twoFactorEnabled : null);

    if (typeof targetState !== 'boolean') {
      return res.status(400).json({ error: 'Please specify enabled (boolean) to update two-factor authentication.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Current password is required to change two-factor authentication settings.' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    // Enabling 2FA requires completing the verification process (cannot enable without a verified 2fa-setup OTP)
    if (targetState === true) {
      const code = String(req.body?.otp || req.body?.token || '').trim();
      if (!code) {
        return res.status(400).json({
          error: 'Enabling 2FA requires completing email OTP verification. Please request a verification code first.',
          message: 'Enabling 2FA requires completing email OTP verification. Please request a verification code first.',
        });
      }
      return await exports.verify2FASetup(req, res);
    }

    user.twoFactorEnabled = false;
    if (user.otpSecret !== undefined) {
      user.otpSecret = undefined;
    }
    await user.save();

    await OTPSession.updateMany(
      { userId: user._id, purpose: '2fa-setup', used: false },
      { $set: { used: true } }
    );

    return res.status(200).json({
      data: {
        userId: user._id,
        role: req.user.role,
        userModel: modelName,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      },
      message: 'Two-factor authentication disabled successfully.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update 2FA settings' });
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
    return res.status(500).json({ error: "Logout failed" });
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
    return res.status(500).json({ error: "Heartbeat failed" });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { ROLE_MODELS, assertAccountState, readAccount } = require('../security/accountState');
    if (typeof process.env.JWT_SECRET !== 'string' || Buffer.byteLength(process.env.JWT_SECRET) < 32 || typeof process.env.JWT_REFRESH_SECRET !== 'string' || Buffer.byteLength(process.env.JWT_REFRESH_SECRET) < 32 || process.env.JWT_REFRESH_SECRET === process.env.JWT_SECRET) {
      return res.status(503).json({ error: 'Refresh verification unavailable' });
    }
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token provided' });
    if (typeof token !== 'string' || token.length > 8192) return res.status(403).json({ error: 'Invalid refresh token' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
      if (!decoded || typeof decoded.id !== 'string' || !/^[a-f0-9]{24}$/i.test(decoded.id) || !Object.hasOwn(ROLE_MODELS, decoded.role) || !Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now()) throw new Error('Invalid claims');
    } catch (err) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const fp = req.headers['x-device-fingerprint'] || null;
    const incomingRefreshHash = crypto.createHash('sha256').update(token).digest('hex');

    // Enforce strict refresh-token rotation & replay prevention:
    // Locate the active session matching this exact refreshTokenHash.
    // Legacy sessions with null/absent refreshTokenHash are intentionally NOT accepted here
    // so refresh-token replay protections can never be bypassed; pre-deployment sessions must re-authenticate once.
    const existingSession = await SessionToken.findOne({
      userId: decoded.id,
      userModel: ROLE_MODELS[decoded.role],
      refreshTokenHash: incomingRefreshHash,
      isValid: true
    });

    if (!existingSession) {
      // Check if this refreshTokenHash was already rotated/invalidated (replay attempt)
      const revokedOrRotated = await SessionToken.findOne({
        userId: decoded.id,
        userModel: ROLE_MODELS[decoded.role],
        refreshTokenHash: incomingRefreshHash,
        isValid: false
      });
      res.clearCookie('refreshToken');
      if (revokedOrRotated) {
        return res.status(401).json({ error: 'Refresh token already used or invalidated. Please log in again.' });
      }
      return res.status(401).json({ error: 'Session expired or logged out. Please log in again.' });
    }

    if (existingSession.isValid !== true || String(existingSession.userId) !== decoded.id || existingSession.logoutAt || existingSession.userModel !== ROLE_MODELS[decoded.role] ||
        (existingSession.expiredAt != null && (!Number.isFinite(new Date(existingSession.expiredAt).getTime()) || new Date(existingSession.expiredAt) <= new Date()))) {
      return res.status(401).json({ error: 'Session expired or invalidated' });
    }
    try {
      assertAccountState(decoded, await readAccount(decoded));
      const ban = await require('../models/BanRecord').findOne({ targetId: decoded.id, isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
      if (ban !== null) return res.status(403).json({ error: 'Account verification required' });
    } catch (_) { return res.status(503).json({ error: 'Account verification unavailable' }); }

    // Enforce strict device-fingerprint binding so a refresh token cannot authorize an unrelated client/device
    if (existingSession.deviceFingerprint) {
      if (!fp || fp !== existingSession.deviceFingerprint) {
        res.clearCookie('refreshToken');
        return res.status(401).json({ error: 'Session device mismatch. Please log in again.' });
      }
      const sessionDev = await TrustedDevice.findOne({
        userId: decoded.id,
        deviceFingerprint: existingSession.deviceFingerprint
      });
      // null represents a previously untrusted device; malformed/foreign rows do not.
      if (sessionDev === undefined || (sessionDev !== null && (sessionDev.isRevoked !== false || String(sessionDev.userId) !== decoded.id || sessionDev.userModel !== existingSession.userModel || sessionDev.deviceFingerprint !== fp))) {
        res.clearCookie('refreshToken');
        return res.status(401).json({ error: 'Session revoked for this device. Please log in again.' });
      }
    }

    // Re-evaluate time after asynchronous account/device checks. Bind the final
    // single-use claim to ownership, logout, expiry and the observed device.
    const claimTime = new Date();
    if (decoded.exp * 1000 <= claimTime.getTime() || (existingSession.expiredAt != null && new Date(existingSession.expiredAt).getTime() <= claimTime.getTime())) return res.status(401).json({ error: 'Session expired or invalidated' });
    const invalidated = await SessionToken.findOneAndUpdate(
      { _id: existingSession._id, userId: decoded.id, userModel: ROLE_MODELS[decoded.role], refreshTokenHash: incomingRefreshHash, isValid: true, logoutAt: null,
        deviceFingerprint: existingSession.deviceFingerprint || null, $or: [{ expiredAt: null }, { expiredAt: { $gt: claimTime } }] },
      { $set: { isValid: false, expiredAt: claimTime } }
    );
    if (!invalidated) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Refresh token already used. Please log in again.' });
    }

    // A lost/expired authorization must never mint a replacement pair. Recheck
    // suspension after the claim; failure consumes the old token and requires login.
    try {
      assertAccountState(decoded, await readAccount(decoded));
      const ban = await require('../models/BanRecord').findOne({ targetId: decoded.id, isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
      if (ban !== null || decoded.exp * 1000 <= Date.now() || (existingSession.expiredAt != null && new Date(existingSession.expiredAt).getTime() <= Date.now())) return res.status(403).json({ error: 'Account verification required' });
    } catch (_) { return res.status(503).json({ error: 'Account verification unavailable' }); }

    const tokenPayload = { id: decoded.id, role: decoded.role, sub: decoded.sub };
    if (decoded.nic) tokenPayload.nic = decoded.nic;

    // Include unique jti so rotated tokens always have a fresh cryptographic signature & hash
    const accessToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ ...tokenPayload, jti: uuid() }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    
    const pharmacyRoles = ['pharmacist', 'pharmacy_admin', 'assistant'];
    const userModel = existingSession.userModel || (pharmacyRoles.includes(decoded.role) ? 'PharmacyStaff' : 'User');
    await createSession(decoded.id, userModel, accessToken, req, { refreshToken: newRefreshToken });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({ data: { accessToken, refreshToken: newRefreshToken }, message: "Token refreshed" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to refresh token" });
  }
};
