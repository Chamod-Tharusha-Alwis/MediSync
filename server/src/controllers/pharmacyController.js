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
    const staff = await PharmacyStaff.findOne({ email }).populate('pharmacyId');
    if (!staff || !staff.isActive) return res.status(401).json({ error: 'Invalid credentials or inactive account' });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (staff.mustChangePassword) {
      return res.json({ 
        message: 'Password change required', 
        data: { mustChangePassword: true, staffId: staff._id }
      });
    }

    const accessToken = jwt.sign(
      { id: staff._id, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ── Persist session so protect() middleware can validate this token ──────
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    await SessionToken.create({
      userId:     staff._id,
      userModel:  'PharmacyStaff',
      tokenHash,
      deviceInfo: req.headers['user-agent'] || 'Unknown Device',
      ipAddress:  req.ip || req.connection?.remoteAddress,
      isValid:    true,
      lastUsed:   new Date()
    });

    // ── Set refresh token cookie so the Axios interceptor can silently renew ─
    const refreshToken = jwt.sign(
      { id: staff._id, role: staff.role },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: 'Login successful',
      data: {
        accessToken,
        role: staff.role,
        pharmacyName: staff.pharmacyId.name,
        staffName: staff.fullName
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
    res.status(500).json({ error: 'Failed to get prescriptions', details: error.message });
  }
};

exports.dispense = async (req, res) => {
  try {
    const { prescriptionId, patientNic, items, notes, isAlternativeDispensed, alternativeDetails } = req.body;
    const staff = await PharmacyStaff.findById(req.user.id).populate('pharmacyId');
    if (!staff) return res.status(404).json({ error: 'Staff record not found' });
    
    const prescription = await Prescription.findOne({ prescriptionId });
    if (!prescription) return res.status(404).json({ error: 'Prescription not found' });
    if (prescription.status === 'dispensed') return res.status(400).json({ error: 'Already dispensed' });
    if (prescription.expiresAt < new Date()) return res.status(400).json({ error: 'Prescription expired' });

    const dispensing = new Dispensing({
      receiptNumber: generateReceiptNumber(),
      prescriptionId: prescription._id,
      pharmacyId: staff.pharmacyId._id,
      staffId: staff._id,
      patientNic,
      items: items || [{ drugName: prescription.drugName, dosage: prescription.dosage || 'N/A', quantityDispensed: prescription.durationDays || 1, status: 'dispensed' }],
      notes
    });
    await dispensing.save();

    // Update prescription status
    prescription.status = 'dispensed';
    prescription.dispensedAt = new Date();
    prescription.dispensedBy = staff.pharmacyId._id;
    prescription.dispensedByPharmacist = staff.fullName;
    prescription.dispenserStaffId = staff._id.toString();
    prescription.pharmacyName = staff.pharmacyId.name;
    // Save alternative medication flags if provided
    if (isAlternativeDispensed) {
      prescription.isAlternativeDispensed = true;
      prescription.alternativeDetails = alternativeDetails || '';
    }
    await prescription.save();

    // Decrypt prescription fields before building email body
    try {
      if (typeof prescription.decryptFieldsSync === 'function') prescription.decryptFieldsSync();
    } catch (_) {}

    // Decrement inventory stock
    const pharmacy = staff.pharmacyId;
    if (pharmacy && pharmacy.inventory) {
      const itemsToDispense = items || [{ drugName: prescription.drugName, quantityDispensed: prescription.durationDays || 1 }];
      for (const dispenseItem of itemsToDispense) {
        const name = dispenseItem.drugName?.toLowerCase().trim();
        const qty = parseInt(dispenseItem.quantityDispensed) || 1;
        const invItem = pharmacy.inventory.find(i => i.drugName.toLowerCase().trim() === name);
        if (invItem) {
          invItem.stock = Math.max(0, invItem.stock - qty);
        }
      }
      await pharmacy.save();
    }

    // Fire-and-forget: send notification email to patient
    (async () => {
      try {
        const nicHash = crypto.createHash('sha256').update(patientNic.trim().toUpperCase()).digest('hex');
        const patient = await Patient.findOne({ nic: patientNic.trim().toUpperCase() }).catch(() =>
          Patient.findOne({ nicHash })
        );
        if (patient) {
          // Decrypt patient fullName if encrypted
          let patientName = patient.fullName;
          try { patient.decryptFieldsSync(); patientName = patient.fullName; } catch (_) {}
          // Build meds string using decrypted prescription.drugName as fallback
          const meds = items && items.length > 0
            ? items.map(i => i.drugName).join(', ')
            : (prescription.medications?.length > 0
              ? prescription.medications.map(m => m.name).join(', ')
              : prescription.drugName || 'Medication');
          const altNote = isAlternativeDispensed && alternativeDetails
            ? `\n⚠️ Alternative dispensed: ${alternativeDetails}` : '';
          await emailService.sendDispenseNotificationEmail(
            patient.email,
            patientName,
            pharmacy.name,
            staff.fullName + ' (ID: ' + staff._id.toString() + ')',
            meds + altNote,
            new Date().toLocaleString('en-GB')
          );
        }
      } catch (emailErr) {
        console.warn('[DISPENSE EMAIL] Could not send notification:', emailErr.message);
      }
    })();

    res.status(201).json({ message: 'Dispensed successfully', data: { receiptNumber: dispensing.receiptNumber } });
  } catch (error) {
    res.status(500).json({ error: 'Dispensing failed', details: error.message });
  }
};

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

    // 6. Call ML engine
    const { generateToken } = require('../utils/internalAuth');
    const mlRes = await axios.post(
      `${process.env.ML_ENGINE_URL}/predict-district-demand`,
      { district, drugTrends },
      { headers: { 'x-internal-key': generateToken() } }
    );

    res.json(mlRes.data);
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
      { $match: { pharmacyId: staff.pharmacyId._id, createdAt: { $gte: since24h } } },
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
exports.dispenseOTC = async (req, res) => {
  try {
    const { patientNic, consultationRef, medications, notes } = req.body;

    if (!patientNic || !medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: 'patientNic and at least one medication are required.' });
    }

    // Retrieve pharmacist info for the record
    const staff = await PharmacyStaff.findById(req.user.id).populate('pharmacyId');
    if (!staff) return res.status(404).json({ error: 'Pharmacist staff record not found.' });

    // SHA-256 blind index — same algorithm used by the doctor controller
    const nicHash = crypto.createHash('sha256').update(patientNic.trim().toUpperCase()).digest('hex');

    // Create a single aggregated OTC prescription document
    const otcDoc = new Prescription({
      patientNic: patientNic.trim().toUpperCase(),
      nicHash,
      isOTC: true,
      consultationRef: consultationRef || undefined,
      dispensedByPharmacist: staff.fullName || staff._id.toString(),
      dispenserStaffId: staff._id.toString(),
      pharmacyName: staff.pharmacyId?.name || '',
      dispensedAt: new Date(),
      medications: medications.map(m => ({
        name:      m.name      || m.drugName || '',
        dosage:    m.dosage    || '',
        frequency: m.frequency || '',
      })),
      // Use first drug as the top-level drugName for backward compat
      drugName:  medications[0]?.name || medications[0]?.drugName || 'OTC Dispensation',
      dosage:    medications[0]?.dosage    || '',
      frequency: medications[0]?.frequency || '',
      instructions: notes || '',
      status: 'dispensed',
    });

    await otcDoc.save();

    res.status(201).json({
      message: 'OTC dispensation recorded successfully.',
      data: { prescriptionId: otcDoc.prescriptionId, medicationCount: medications.length },
    });
  } catch (error) {
    console.error('[OTC] Dispensing error:', error.message);
    res.status(500).json({ error: 'OTC dispensing failed.', details: error.message });
  }
};
