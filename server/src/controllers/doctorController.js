const crypto = require('crypto');
const axios = require('axios');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const ConsultationRating = require('../models/ConsultationRating');
const { generateLockedPrescription } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');
const { sendEmail } = require('../utils/email');

exports.getProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id)
      .select('-password -otpSecret')
      .populate('hospitals', 'name location');
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const ratings = await ConsultationRating.aggregate([
      { $match: { doctorId: doctor._id } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    
    const doctorObj = doctor.toObject();
    if (ratings.length > 0) {
      doctorObj.averageRating = Number(ratings[0].avgRating.toFixed(1));
      doctorObj.ratingCount = ratings[0].count;
    } else {
      doctorObj.averageRating = 0;
      doctorObj.ratingCount = 0;
    }

    return res.json({ data: doctorObj });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
};

exports.updateDoctorProfile = async (req, res) => {
  try {
    const { fullName, specialization, contactNumber, personalEmail, clinicAddress } = req.body;
    const doctor = await Doctor.findByIdAndUpdate(
      req.user.id,
      { $set: { fullName, specialization, contactNumber, personalEmail, clinicAddress } },
      { returnDocument: 'after' }
    ).select('-password -otpSecret');
    
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    return res.json({ message: 'Profile updated', data: doctor });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const workspaceId = req.query.hospitalId; 
    const isPersonal = !workspaceId;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const consultQuery = { doctorId };
    if (!isPersonal) consultQuery.sessionHospitalId = workspaceId;

    const todayConsultations = await Consultation.countDocuments({
      ...consultQuery,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const pendingFollowUps = await Consultation.countDocuments({
      ...consultQuery,
      isFollowUpRequired: true,
      followUpDate: { $gte: startOfDay }
    });

    const rxQuery = { doctorId };
    if (!isPersonal) rxQuery.hospitalId = workspaceId;

    const activeRx = await Prescription.countDocuments({
      ...rxQuery,
      status: { $in: ['pending', 'issued'] }
    });

    const uniquePatients = await Consultation.distinct('patientNic', consultQuery);
    const totalPatients = uniquePatients.length;

    const recentConsultations = await Consultation.find(consultQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('patientNic', 'fullName') // Assuming some virtual or just returning the string if not ref
      .lean();

    return res.json({
      data: {
        todayConsultations,
        activeRx,
        totalPatients,
        pendingFollowUps,
        recentConsultations
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
};

exports.createConsultation = async (req, res) => {
  try {
    const {
      patientNic, symptoms, icdCode, icdDescription,
      diagnosis, notes, clinicalNotes, isFollowUpRequired,
      followUpDate, followUpNotes, loginType, 
      sessionHospitalId, prescriptions = [], labTests = [], orderedTests = []
    } = req.body

    // Validate patient exists
    const patient = await Patient.findOne({ nic: patientNic })
    if (!patient) {
      return res.status(404).json({ 
        error: 'Patient not found. Register patient first.' 
      })
    }
    
    // Generate Global Consultation ID
    const generatedId = 'CON-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Generate SHA-256 blind index for querying encrypted NIC
    const hashedNic = crypto.createHash('sha256').update(patientNic.trim()).digest('hex');

    // Build consultation object - only include fields that exist in schema
    const consultationData = {
      consultationId: generatedId,
      patientNic,
      nicHash: hashedNic,
      patientNic_bi: hashedNic,
      patientId: patient._id,          // unencrypted ObjectId for safe querying
      doctorId: req.user.id,
      symptoms: symptoms || [],
      diagnosis: diagnosis || '',
      notes: notes || clinicalNotes || '',
      isFollowUpRequired: isFollowUpRequired || false,
      loginType: loginType || 'personal',
    }
    
    // Optional fields - only add if schema has them
    if (icdCode) consultationData.icdCode = icdCode
    if (icdDescription) consultationData.icdDescription = icdDescription
    if (followUpDate) consultationData.followUpDate = new Date(followUpDate)
    if (followUpNotes) consultationData.followUpNotes = followUpNotes
    if (sessionHospitalId) consultationData.sessionHospitalId = sessionHospitalId
    if (patient.district) consultationData.district = patient.district
    // Store ordered lab test names directly on the consultation
    const orderedTestNames = req.body.orderedTests
      ? req.body.orderedTests.map(t => (typeof t === 'string' ? t : t.testName)).filter(Boolean)
      : []
    if (orderedTestNames.length > 0) consultationData.labTests = orderedTestNames
    
    const consultation = new Consultation(consultationData);
    await consultation.save();
    
    // Create prescriptions
    const createdPrescriptions = []
    const conflictWarnings = []
    
    for (const rxData of prescriptions) {
      // Allergy check
      const patientAllergies = patient.allergies || []
      const hasConflict = patientAllergies.some(a => 
        rxData.drugName && rxData.drugName.toLowerCase().includes(a.toLowerCase())
      )
      if (hasConflict) {
        conflictWarnings.push({
          drug: rxData.drugName,
          allergen: patientAllergies.find(a => 
            rxData.drugName.toLowerCase().includes(a.toLowerCase())
          )
        })
      }
      
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (parseInt(rxData.durationDays) || 7))
      
      try {
        const rxDoc = new Prescription({
          consultationId: consultation._id,
          consultationRef: generatedId,
          patientNic,
          nicHash: hashedNic,
          patientNic_bi: hashedNic,
          patientId: patient._id,       // unencrypted ObjectId for safe querying
          doctorId: req.user.id,
          drugName: rxData.drugName || rxData.name || '',
          dosage: rxData.dosage || '',
          frequency: rxData.frequency || '',
          durationDays: parseInt(rxData.durationDays) || 7,
          instructions: rxData.instructions || '',
          expiresAt,
          status: 'pending',
          hospitalId: sessionHospitalId || null,
        });
        await rxDoc.save();
        // ── CRITICAL: Decrypt fields immediately after save so the in-memory
        //    document has plain-text values (drugName, dosage) before we map
        //    it to the PDF. Without this, mongoose-field-encryption leaves
        //    those fields as AES ciphertext on the JS object.
        if (typeof rxDoc.decryptFieldsSync === 'function') {
          rxDoc.decryptFieldsSync();
        }
        createdPrescriptions.push(rxDoc)
      } catch (rxErr) {
        console.error('Prescription create error:', rxErr.message)
        throw rxErr
      }
    }
    
    // ── Create LabTest documents ─────────────────────────────────────────────
    // The frontend sends two fields:
    //   labTests:     ['CBC', 'Lipid Panel']           (plain strings)
    //   orderedTests: [{ testName:'CBC' }, …]          (objects)
    // We merge / deduplicate and create one LabTest per unique test name.
    const createdTests = []
    const mergedTestNames = [
      ...labTests.map(t => (typeof t === 'string' ? t : t.testName)).filter(Boolean),
      ...orderedTests.map(t => (typeof t === 'string' ? t : t.testName)).filter(Boolean),
    ];
    const uniqueTestNames = [...new Set(mergedTestNames)];

    if (uniqueTestNames.length > 0) {
      const LabTest = require('../models/LabTest')
      const testPromises = uniqueTestNames.map(name =>
        LabTest.create({
          consultationId: consultation._id,
          consultationRef: generatedId,
          patientNic: patientNic,
          patientNic_bi: hashedNic,
          patientId: patient._id,
          referredBy: req.user.id,
          testName: name.trim(),
          testCategory: 'Other',
          urgency: 'routine',
          notes: '',
          status: 'pending',
        })
      );
      try {
        const results = await Promise.all(testPromises);
        createdTests.push(...results);
      } catch (testErr) {
        console.error('❌ LabTest creation error:', testErr.message);
        // Don't fail the consultation over a test order error
      }
    }
    
    // ── E-Prescription PDF Generation & Email ────────────────────────────
    // This runs after all prescriptions are saved. Decrement is non-blocking
    // but we await so tracer logs appear before the response.
    if (createdPrescriptions.length > 0) {
      try {
        patient.decryptFieldsSync();

        if (!patient.email) {
          console.error('[EMAIL ABORTED] Patient has no email address on file.');
        } else {
          const doctor   = await Doctor.findById(req.user.id);
          const drName   = doctor ? doctor.fullName : 'Consulting Medical Professional';
          const patientDOB = patient.dateOfBirth
            ? new Date(patient.dateOfBirth).toLocaleDateString('en-GB')
            : 'N/A';

          // ── CRITICAL: Log decrypted field values to confirm they are plain-text
          const rxForPDF = createdPrescriptions.map(rx => {
            return {
              drugName:     rx.drugName,
              dosage:       rx.dosage,
              frequency:    rx.frequency,
              durationDays: rx.durationDays,
              instructions: rx.instructions,
            };
          });

          // Pass lab tests and follow-up date from the consultation
          const labTestsForPDF  = orderedTestNames.length > 0 ? orderedTestNames : [];
          const followUpForPDF  = followUpDate ? new Date(followUpDate) : null;

          const pdfBuffer = await generateLockedPrescription(
            rxForPDF,
            patient.fullName,
            patient.nic,
            patientDOB,
            drName,
            loginType || 'personal',
            patient.gender || '',
            labTestsForPDF,
            followUpForPDF,
            generatedId
          );

          const masterKey = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'default-owner-key-12345678';
          const securePassword = crypto.createHmac('sha256', masterKey)
            .update(patient.nic)
            .digest('hex')
            .substring(0, 8)
            .toUpperCase();

          const emailResult = await emailService.sendPrescriptionEmail(
            patient.email,
            patient.fullName,
            pdfBuffer,
            securePassword
          );

          if (!(emailResult && emailResult.success)) {
            console.error(`[DEBUG] EMAIL PIPELINE FAILURE: ${emailResult ? emailResult.error : 'Unknown'}`);
          }
        }
      } catch (pdfErr) {
        // Never block the 201 response over a PDF/email failure
        console.error(`[DEBUG] PDF/EMAIL PIPELINE EXCEPTION: ${pdfErr.message}`);
        console.error(pdfErr);
      }
    }

    // ── Async ML calls (non-blocking) ─────────────────────────────────────
    const { generateToken } = require('../utils/internalAuth');
    Promise.all([
      axios.post(process.env.ML_ENGINE_URL + '/ingest', {
        district: patient.district || 'Unknown',
        drugCategory: prescriptions[0]?.category || 'general',
        date: new Date().toISOString().split('T')[0]
      }, {
        headers: { 'x-internal-key': generateToken() }
      }).catch(e => console.error('ML ingest error (non-critical):', e.message)),
      axios.post(process.env.ML_ENGINE_URL + '/patient-risk', {
        age: patient.dateOfBirth ? 
          Math.floor((Date.now()-new Date(patient.dateOfBirth))/(365.25*24*3600*1000)) : 30,
        chronicConditions: patient.chronicConditions || [],
        consultationCount30days: 1,
        activePrescriptionsCount: createdPrescriptions.length
      }, {
        headers: { 'x-internal-key': generateToken() }
      }).catch(e => console.error('ML risk error (non-critical):', e.message))
    ])
    
    // Fetch patient's email address using their ID
    try {
      const patientRecord = await Patient.findById(patient._id);
      const patientEmail = patientRecord ? patientRecord.email : null;

      if (patientEmail) {
        const rxForEmail = createdPrescriptions.map(rx => {
          return `- ${rx.drugName} (${rx.dosage} | ${rx.frequency} | ${rx.durationDays} days | Instructions: ${rx.instructions})`;
        }).join('<br/>');

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #0F172A; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MediSync</h1>
              <p style="color: #94A3B8; margin: 4px 0 0; font-size: 13px;">E-Prescription & Consultation Released</p>
            </div>
            <div style="padding: 32px 24px; background-color: #ffffff;">
              <p style="font-size: 16px; color: #1E293B; margin-top: 0;">Hello ${patientRecord.fullName || 'Patient'},</p>
              <p style="font-size: 15px; color: #475569; line-height: 1.5;">
                Your E-Prescription has been finalized and released by your consulting doctor.
              </p>
              
              <div style="margin: 24px 0; padding: 20px; background-color: #F8FAFC; border-left: 4px solid #0F172A; border-radius: 6px;">
                <p style="margin: 0 0 12px 0; font-size: 15px; color: #1E293B;"><strong>Confirmed Diagnosis:</strong> <span style="color: #0284C7; font-weight: 600;">${diagnosis || 'N/A'}</span></p>
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #1E293B; font-weight: bold;">Prescribed Medications:</p>
                <div style="font-size: 14px; color: #475569; line-height: 1.6;">
                  ${rxForEmail ? rxForEmail : 'None prescribed'}
                </div>
              </div>
              
              <p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 0;">
                Please log in to your <strong>Patient Portal</strong> to view the full E-Prescription and access your secure medical files.
              </p>
            </div>
            <div style="background-color: #F1F5F9; padding: 16px 24px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="font-size: 12px; color: #64748B; margin: 0;">This is an automated notification from the MediSync Platform. Do not reply to this email.</p>
            </div>
          </div>
        `;

        await sendEmail({
          to: patientEmail,
          subject: `MediSync: E-Prescription & Consultation Summary (${generatedId})`,
          html: emailHtml
        });
      }
    } catch (emailErr) {
      console.error('[sendEmail] Detailed release email send failed:', emailErr.message);
    }
    
    res.status(201).json({
      message: 'Consultation created successfully',
      consultationId: consultation._id,
      prescriptions: createdPrescriptions,
      tests: createdTests,
      conflictWarnings
    })
    
  } catch (err) {
    console.error('createConsultation ERROR:', err.message)
    console.error('Full error:', err)
    if (err.name === 'ValidationError') {
      const fields = Object.keys(err.errors)
      return res.status(400).json({
        error: 'Validation failed',
        fields,
        details: fields.map(f => err.errors[f].message)
      })
    }
    if (err.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid data format',
        field: err.path,
        value: err.value
      })
    }
    res.status(500).json({ error: err.message })
  }
};

exports.getConsultations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const consultations = await Consultation.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Consultation.countDocuments({ doctorId: req.user.id });

    return res.json({
      data: consultations,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch consultations', details: error.message });
  }
};

exports.updateFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFollowUpRequired, followUpDate } = req.body;

    const consultation = await Consultation.findOneAndUpdate(
      { _id: id, doctorId: req.user.id },
      { $set: { isFollowUpRequired, followUpDate } },
      { returnDocument: 'after' }
    );

    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    return res.json({ message: 'Follow-up updated', data: consultation });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update follow-up', details: error.message });
  }
};

exports.predictDisease = async (req, res) => {
  try {
    const { symptoms } = req.body;
    const { generateToken } = require('../utils/internalAuth');

    const mlUrl = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';

    const mlRes = await axios.post(
      `${mlUrl}/api/ml/predict-disease`,
      { symptoms },
      {
        headers: { 'x-internal-key': generateToken() },
        timeout: 10000, // 10-second timeout
      }
    );
    return res.json(mlRes.data);
  } catch (error) {
    console.error('⚠️  ML Engine unavailable — returning fallback predictions:', error.message);
    if (error.response) {
      console.error('ML Engine Response:', error.response.data);
    }

    // ── Graceful fallback so the frontend wizard keeps working ─────────────
    return res.status(200).json({
      predictions: [
        { disease: 'General Infection',       probability: 0.75, specialist: 'General Physician' },
        { disease: 'Viral Fever',             probability: 0.60, specialist: 'General Physician' },
        { disease: 'Allergic Reaction',       probability: 0.45, specialist: 'Immunologist' },
        { disease: 'Stress-Related Disorder', probability: 0.30, specialist: 'Psychiatrist' },
      ],
      fallback: true,
      note: 'ML engine was unreachable; these are generic suggestions. Please use clinical judgement.',
    });
  }
};

exports.getPatientDirectory = async (req, res) => {
  try {
    const consultations = await Consultation.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const uniqueNics = [...new Set(consultations.map(c => c.patientNic))];
    const patients = await Patient.find({ nic: { $in: uniqueNics } }).lean();
    
    // Fetch prescriptions for these consultations
    const consultationIds = consultations.map(c => c._id);
    const prescriptions = await Prescription.find({ consultationId: { $in: consultationIds } }).lean();

    // Map patients and prescriptions to consultations
    const data = consultations.map(c => {
      const patient = patients.find(p => p.nic === c.patientNic);
      const rx = prescriptions.filter(p => String(p.consultationId) === String(c._id));
      return {
        ...c,
        patientName: patient ? patient.fullName : 'Unknown Patient',
        patientDetails: patient || null,
        prescriptions: rx
      };
    });

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch patient directory', details: error.message });
  }
};
