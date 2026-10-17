const mongoose = require('mongoose');
const crypto = require('crypto');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const Patient = require('../models/Patient');
const SessionToken = require('../models/SessionToken');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { hashPassword, generateTempPassword, validatePasswordStrength } = require('../utils/passwordUtils');
const emailService = require('../utils/emailService');
const { generateReceiptNumber } = require('../utils/generateReceiptNumber');
const { parseDeviceModel } = require('../utils/deviceParser');


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
    if (error.code === 11000 || (error.message && error.message.includes('11000'))) {
      return res.status(400).json({ error: 'Pharmacy registration number or admin email already exists' });
    }
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
};

exports.loginPharmacy = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim();
    const staff = await PharmacyStaff.findOne({ 
      email: new RegExp('^' + cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') 
    }).populate('pharmacyId');
    if (!staff || !staff.isActive) return res.status(401).json({ error: 'Invalid credentials or inactive account' });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (staff.mustChangePassword) {
      return res.json({ 
        message: 'Password change required', 
        data: { mustChangePassword: true, staffId: staff._id }
      });
    }

    const ua = req.headers['user-agent'] || 'Unknown Device';
    const fingerprint = req.headers['x-device-fingerprint'] || null;
    const clientHw = req.headers['x-hardware-model'] || req.headers['sec-ch-ua-model'];
    const parsedModel = parseDeviceModel(ua, clientHw);

    const TrustedDevice = require('../models/TrustedDevice');
    let existingDevice = null;
    if (fingerprint) {
      existingDevice = await TrustedDevice.findOne({ userId: staff._id, deviceFingerprint: fingerprint });
    }
    const isRevokedDeviceLogin = Boolean(existingDevice && existingDevice.isRevoked);
    const hasTwoFactor = Boolean(
      staff.twoFactorEnabled ||
      staff._doc?.twoFactorEnabled ||
      (typeof staff.get === 'function' && staff.get('twoFactorEnabled'))
    );

    if (hasTwoFactor || isRevokedDeviceLogin) {
      const OTPSession = require('../models/OTPSession');
      const { getAttempts, checkOtpRequestThrottle, recordOtpRequestSent } = require('../config/redis');
      const authOtpKey = 'auth:' + String(staff._id);
      const verifyLockoutCount = await getAttempts(authOtpKey);
      if (verifyLockoutCount >= 5) {
        return res.status(429).json({
          error: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
          message: 'Account OTP verification is temporarily locked due to too many failed attempts. Please try again later.',
        });
      }

      const latestLoginOtp = await OTPSession.findOne({
        userId: staff._id,
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

      const otp = crypto.randomInt(100000, 1000000).toString();
      const hashedOtp = await bcrypt.hash(otp, 10);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await OTPSession.updateMany(
        { userId: staff._id, purpose: 'login', used: false },
        { $set: { used: true } }
      );

      const otpDoc = await OTPSession.create({
        userId: staff._id,
        userModel: 'PharmacyStaff',
        otp: hashedOtp,
        expiresAt,
        purpose: 'login',
        failedAttempts: priorFailedAttempts,
      });

      const emailResult = await emailService.sendOTPEmail(staff.email, staff.fullName || 'Pharmacist', otp);
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

      const maskedEmail = (staff.email || '').replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));

      return res.json({
        message: isRevokedDeviceLogin && !hasTwoFactor
          ? 'This device was previously revoked. Please verify the OTP sent to your email to continue.'
          : 'OTP sent to your email',
        data: {
          requiresOTP: true,
          userId: staff._id,
          emailHint: maskedEmail,
          role: staff.role,
          reason: isRevokedDeviceLogin && !hasTwoFactor ? 'revoked_device' : '2fa',
          providerAccepted: true,
          deliveryQueued: false,
          deliveryConfirmed: false,
          provider: emailResult.provider,
          fallbackUsed: Boolean(emailResult.fallbackUsed),
        }
      });
    }

    const { v4: uuid } = require('uuid');
    const accessToken = jwt.sign(
      { id: staff._id, role: staff.role, jti: uuid() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: staff._id, role: staff.role, jti: uuid() },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // ── Persist session and track trusted device ────────────────────────────
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    let isTrusted = false;
    let isNewDevice = false;
    if (fingerprint) {
      if (existingDevice) {
        isTrusted = !existingDevice.isRevoked && (existingDevice.isTrusted === true);
        existingDevice.lastSeenAt = new Date();
        existingDevice.deviceModel = parsedModel;
        await existingDevice.save();
      } else {
        // Security invariant: newly seen devices always start as UNTRUSTED (false)
        isNewDevice = true;
        isTrusted = false;
        try {
          await TrustedDevice.create({
            userId: staff._id,
            userModel: 'PharmacyStaff',
            deviceFingerprint: fingerprint,
            deviceModel: parsedModel,
            deviceLabel: parsedModel,
            deviceInfo: ua,
            isTrusted: false,
            trustedAt: null,
            lastSeenAt: new Date(),
            isRevoked: false
          });
        } catch (e) {}
      }
    }

    if (isNewDevice || !isTrusted) {
      try {
        const AuditLog = require('../models/AuditLog');
        await AuditLog.create({
          actorId: staff._id,
          actorRole: staff.role,
          action: 'Untrusted Login Attempt',
          deviceModel: parsedModel
        });
      } catch (_) {}
    }

    await SessionToken.create({
      userId:     staff._id,
      userModel:  'PharmacyStaff',
      tokenHash,
      refreshTokenHash,
      deviceInfo: ua,
      deviceFingerprint: fingerprint,
      deviceModel: parsedModel,
      isTrusted:  isTrusted,
      isValid:    true,
      lastUsed:   new Date()
    });

    staff.lastLoginAt = new Date();
    await staff.save();

    // ── Send Login Notification Email ─────────────────────────────────────────
    if (process.env.SKIP_LOGIN_NOTIFICATION !== 'true') {
      try {
        const axios = require('axios');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        let networkInfo = { isp: 'Internet Service Provider', country: 'Sri Lanka', city: 'Colombo', region: 'Western' };
        try {
          if (ip && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.') && ip !== '::1') {
            const cleanIp = ip.includes(',') ? ip.split(',')[0].trim() : ip;
            const geoRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,regionName,city,isp`, { timeout: 2500 });
            if (geoRes.data?.status === 'success') {
              networkInfo = { isp: geoRes.data.isp, country: geoRes.data.country, city: geoRes.data.city, region: geoRes.data.regionName };
            }
          }
        } catch (e) {}

        console.log(`[AUTH LOGIN NOTIFICATION] Role: ${staff.role} | Device: ${parsedModel} | isTrusted: ${isTrusted}`);
        const resNotification = await emailService.sendLoginNotificationEmail(
          staff.email,
          staff.fullName,
          staff.nic || staff.email,
          staff.role === 'pharmacy_admin' ? 'Pharmacy Administrator' : 'Pharmacist',
          parsedModel,
          networkInfo,
          'Individual Login',
          staff.pharmacyId ? staff.pharmacyId.name : null,
          isTrusted
        );
        console.log(`[AUTH LOGIN NOTIFICATION RESULT]`, {
          provider: resNotification?.provider || null,
          providerAccepted: Boolean(resNotification?.providerAccepted),
          deliveryQueued: Boolean(resNotification?.deliveryQueued),
          fallbackUsed: Boolean(resNotification?.fallbackUsed),
          deliveryConfirmed: false,
        });
      } catch (e) {
        console.error('[AUTH LOGIN NOTIFICATION ERROR] Pharmacy login email failed:', e.message);
      }
    }

    // ── Set refresh token cookie so the Axios interceptor can silently renew ─
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        role: staff.role,
        pharmacyName: staff.pharmacyId ? staff.pharmacyId.name : 'Unknown Pharmacy',
        staffName: staff.fullName,
        isTrusted
      }
    });
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

exports.getMe = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id)
      .select('-password')
      .populate('pharmacyId', 'name district');
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json({ data: staff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile', details: error.message });
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
      mustChangePassword: true,
      createdBy: admin._id
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
    // Use SHA-256 blind index so we never query the encrypted field
    const targetHash = crypto.createHash('sha256').update(nic.trim().toUpperCase()).digest('hex');
    const prescriptions = await Prescription.find({ 
      nicHash: targetHash, 
      status: { $in: ['pending', 'issued'] },
      isOTC: { $ne: true },           // Only doctor-issued prescriptions
      expiresAt: { $gt: new Date() }
    }).populate('doctorId', 'fullName').populate('hospitalId', 'name');
    // Fetch the patient profile to display on frontend (do NOT use .lean() or restrict .select() so decryption works)
    const patientUser = await Patient.findOne({ nic: nic.trim().toUpperCase() });
    if (patientUser && typeof patientUser.decryptFieldsSync === 'function') {
      patientUser.decryptFieldsSync();
    }

    res.json({ data: { prescriptions, patient: patientUser } });
  } catch (error) {
    console.error('getPendingPrescriptions error:', error);
    res.status(500).json({ error: 'Failed to get prescriptions', details: error.message });
  }
};

exports.dispense = require('./dispensingController').dispense;

exports.getDispensingHistory = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Ensure we are querying correctly
    const query = { pharmacyId: staff.pharmacyId };
    if (req.query.nic) query.patientNic = req.query.nic;

    const history = await Dispensing.find(query)
      .populate('staffId', 'fullName role')
      .populate({
        path: 'prescriptionId',
        match: { status: 'dispensed' }, // Ensure we only get dispensed prescriptions
        select: 'prescriptionId consultationRef drugName medications status isOTC patientNic',
        populate: { path: 'doctorId', select: 'fullName' }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
      
    // Filter out any where prescription was not matched (if match condition failed)
    const validHistory = history.filter(h => h.prescriptionId !== null);
    
    const total = await Dispensing.countDocuments(query);
    res.json({ data: validHistory, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('[getDispensingHistory Error]:', error.message);
    res.status(500).json({ error: 'Failed to get history', details: error.message });
  }
};

exports.getReceipt = async (req, res) => {
  try {
    const { receiptNo } = req.params;
    const dispensing = await Dispensing.findOne({ receiptNumber: receiptNo })
      .populate('pharmacyId', 'name address phone')
      .populate('staffId', 'fullName role')
      .populate({
        path: 'prescriptionId',
        populate: { path: 'doctorId', select: 'fullName' }
      });
      
    if (!dispensing) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ data: dispensing });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch receipt', details: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

    const todayDispensed = await Dispensing.countDocuments({ pharmacyId: staff.pharmacyId, createdAt: { $gte: startOfDay } });
    const monthDispensed = await Dispensing.countDocuments({ pharmacyId: staff.pharmacyId, createdAt: { $gte: monthStart } });

    res.json({ data: { todayDispensed, monthDispensed } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
};

exports.predictRestock = async (req, res) => {
  try {
    const axios = require('axios');
    const { generateToken } = require('../utils/internalAuth');
    const { data } = await axios.post(
      `${process.env.ML_ENGINE_URL}/predict-district-demand`,
      req.body,
      { headers: { 'x-internal-key': generateToken() } }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'ML Engine unavailable' });
  }
};

exports.getDistrictRestockAlerts = async (req, res) => {
  try {
    const axios = require('axios');

    // 1. Resolve the pharmacist's district via their linked Pharmacy
    const staff = await PharmacyStaff.findById(req.user.id).populate('pharmacyId');
    if (!staff || !staff.pharmacyId) {
      return res.status(400).json({ error: 'Pharmacist is not linked to a pharmacy' });
    }
    const district = staff.pharmacyId.district;

    // 2. Find all pharmacies in this district
    const pharmaciesInDistrict = await Pharmacy.find({ district }).select('_id');
    const pharmacyIds = pharmaciesInDistrict.map(p => p._id);

    // 3. Aggregate dispensing over the last 14 days for these pharmacies
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const dispensings = await Dispensing.find({
      pharmacyId: { $in: pharmacyIds },
      dispensedAt: { $gte: since }
    }).select('items dispensedAt');

    if (dispensings.length === 0) {
      return res.status(200).json({ 
          message: "Not enough dispensing data to generate ML predictions.",
          alerts: [] 
      });
    }

    // 4. Build drugTrends: { "Paracetamol": [ {date, count}, ... ] }
    const rawCounts = {}; // { drugName: { dateStr: count } }

    for (const record of dispensings) {
      const dateStr = record.dispensedAt.toISOString().slice(0, 10);
      for (const item of (record.items || [])) {
        const name = item.drugName?.trim();
        if (!name) continue;
        if (!rawCounts[name]) rawCounts[name] = {};
        rawCounts[name][dateStr] = (rawCounts[name][dateStr] || 0) + (item.quantityDispensed || 1);
      }
    }

    // 5. Convert to sorted arrays for the ML engine
    const drugTrends = {};
    for (const [drug, dateCounts] of Object.entries(rawCounts)) {
      drugTrends[drug] = Object.entries(dateCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    // 6. Call ML engine with built-in high-availability analytical fallback
    try {
      const { generateToken } = require('../utils/internalAuth');
      const mlRes = await axios.post(
        `${process.env.ML_ENGINE_URL || 'http://localhost:5001'}/predict-district-demand`,
        { district, drugTrends },
        { headers: { 'x-internal-key': generateToken() }, timeout: 60000 }
      );
      return res.json(mlRes.data);
    } catch (mlErr) {
      console.warn('[getDistrictRestockAlerts] ML Engine unavailable, executing built-in predictive engine:', mlErr.message);
      
      const alerts = [];
      for (const [drugName, dailyCounts] of Object.entries(drugTrends)) {
        if (!dailyCounts || dailyCounts.length < 2) continue;
        const counts = dailyCounts.map(d => d.count || 0);
        const n = counts.length;
        const mid = Math.floor(n / 2);
        const baselineAvg = counts.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(1, mid);
        const recentAvg = counts.slice(mid).reduce((a, b) => a + b, 0) / Math.max(1, n - mid);
        const pctChange = ((recentAvg - baselineAvg) / Math.max(1, baselineAvg)) * 100;
        const slope = (counts[counts.length - 1] - counts[0]) / Math.max(1, n - 1);

        if (pctChange >= 50 || (slope > 0 && recentAvg >= baselineAvg * 1.5)) {
          alerts.push({
            drugName,
            trend: `+${Math.round(pctChange)}%`,
            recentDailyAvg: Math.round(recentAvg * 10) / 10,
            baselineDailyAvg: Math.round(baselineAvg * 10) / 10,
            status: "Critical",
            message: `Dispensing surged by ${Math.round(pctChange)}% in ${district}. Restock immediately.`
          });
        } else if (pctChange >= 25 || (slope > 0 && recentAvg >= baselineAvg * 1.25)) {
          alerts.push({
            drugName,
            trend: `+${Math.round(pctChange)}%`,
            recentDailyAvg: Math.round(recentAvg * 10) / 10,
            baselineDailyAvg: Math.round(baselineAvg * 10) / 10,
            status: "Warning",
            message: `Dispensing up ${Math.round(pctChange)}% in ${district}. Consider restocking soon.`
          });
        }
      }

      alerts.sort((a, b) => (a.status === 'Critical' ? -1 : 1));

      return res.json({
        district,
        alerts,
        drugsAnalyzed: Object.keys(drugTrends).length,
        generatedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('[getDistrictRestockAlerts]', err.message);
    res.status(500).json({ error: 'Failed to generate restock alerts', details: err.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    if (!staff || !staff.pharmacyId) {
      return res.status(400).json({ error: 'Pharmacist is not linked to a pharmacy' });
    }
    const pharmacy = await Pharmacy.findById(staff.pharmacyId);
    res.json({ data: pharmacy.inventory || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory', details: error.message });
  }
};

exports.updateInventoryItem = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id);
    if (!staff || !staff.pharmacyId) {
      return res.status(400).json({ error: 'Pharmacist is not linked to a pharmacy' });
    }
    const { drugName, stock, reorderLevel, unit } = req.body;
    if (!drugName) return res.status(400).json({ error: 'Drug name is required' });

    const pharmacy = await Pharmacy.findById(staff.pharmacyId);
    const existingItem = pharmacy.inventory.find(
      i => i.drugName.toLowerCase().trim() === drugName.toLowerCase().trim()
    );

    if (existingItem) {
      if (stock !== undefined) existingItem.stock = stock;
      if (reorderLevel !== undefined) existingItem.reorderLevel = reorderLevel;
      if (unit !== undefined) existingItem.unit = unit;
    } else {
      pharmacy.inventory.push({
        drugName,
        stock: stock || 0,
        reorderLevel: reorderLevel || 50,
        unit: unit || 'tablets'
      });
    }

    await pharmacy.save();
    res.json({ message: 'Inventory updated successfully', data: pharmacy.inventory });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inventory', details: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   24-Hour Local Restock Analytics — No ML dependency
   ───────────────────────────────────────────────────────────────────────────── */
exports.getRestockAnalytics = async (req, res) => {
  try {
    const staff = await PharmacyStaff.findById(req.user.id).populate('pharmacyId');
    if (!staff || !staff.pharmacyId) {
      return res.status(400).json({ error: 'Pharmacist is not linked to a pharmacy' });
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Aggregate dispensing records for this pharmacy in the last 24 hours
    const pipeline = [
      {
        $match: {
          pharmacyId: staff.pharmacyId._id,
          $or: [
            { dispensedAt: { $gte: since24h } },
            { createdAt: { $gte: since24h } }
          ]
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $trim: { input: { $toLower: '$items.drugName' } } },
          displayName: { $first: '$items.drugName' },
          totalDispensed: { $sum: { $ifNull: ['$items.quantityDispensed', 1] } }
        }
      },
      { $sort: { totalDispensed: -1 } },
      { $limit: 20 }
    ];

    const results = await Dispensing.aggregate(pipeline);

    // Cross-reference with inventory
    const inventory = staff.pharmacyId.inventory || [];
    const inventoryMap = {};
    for (const item of inventory) {
      inventoryMap[item.drugName.toLowerCase().trim()] = item;
    }

    const leaderboard = results.map((r, idx) => {
      const inv = inventoryMap[r._id] || null;
      const currentStock = inv ? inv.stock : null;
      const reorderLevel = inv ? inv.reorderLevel : null;
      const percentDepleted = (inv && inv.stock + r.totalDispensed > 0)
        ? Math.round((r.totalDispensed / (inv.stock + r.totalDispensed)) * 100)
        : null;
      return {
        rank: idx + 1,
        drugName: r.displayName || r._id,
        totalDispensed24h: r.totalDispensed,
        currentStock,
        reorderLevel,
        percentDepleted,
        isCritical: inv ? inv.stock <= inv.reorderLevel : false,
        unit: inv ? inv.unit : 'units'
      };
    });

    res.json({
      data: leaderboard,
      meta: {
        pharmacyName: staff.pharmacyId.name,
        since: since24h.toISOString(),
        drugsAnalyzed: results.length
      }
    });
  } catch (error) {
    console.error('[getRestockAnalytics]', error.message);
    res.status(500).json({ error: 'Failed to fetch restock analytics', details: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   OTC Direct Dispensing — Pharmacist dispenses without a doctor prescription
   ───────────────────────────────────────────────────────────────────────────── */
exports.dispenseOTC = require('./dispensingController').dispenseOTC;
