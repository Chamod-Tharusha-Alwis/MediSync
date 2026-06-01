const crypto = require('crypto');
const axios = require('axios');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const ConsultationRating = require('../models/ConsultationRating');
const { generateLockedPrescription } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');

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
      sessionHospitalId, prescriptions = [], tests = []
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
    
    // Create test orders if provided
    const createdTests = []
    for (const testData of tests) {
      try {
        const TestOrder = require('../models/TestOrder')
        const testDoc = await TestOrder.create({
          consultationId: consultation._id,
          patientNic,
          doctorId: req.user.id,
          hospitalId: sessionHospitalId || null,
          testName: testData.testName,
          testCategory: testData.testCategory || 'other',
          urgency: testData.urgency || 'routine',
          instructions: testData.instructions || '',
          isSurgeryRelated: testData.isSurgeryRelated || false,
          surgeryNotes: testData.surgeryNotes || '',
        })
        createdTests.push(testDoc)
      } catch (testErr) {
        console.error('Test order creation error:', testErr.message)
        // Don't fail consultation over test order error
      }
    }
    
    // ── E-Prescription PDF Generation & Email ────────────────────────────
    // This runs after all prescriptions are saved. Decrement is non-blocking
    // but we await so tracer logs appear before the response.
    if (createdPrescriptions.length > 0) {
      try {
        patient.decryptFieldsSync();

        console.log(`[DEBUG] PDF GENERATION STARTED`);
        console.log(`[DEBUG] PATIENT NIC: ${patient.nic}`);
        console.log(`[DEBUG] PATIENT EMAIL: ${patient.email || 'MISSING'}`);
        console.log(`[DEBUG] PRESCRIPTION COUNT: ${createdPrescriptions.length}`);
        console.log(`[DEBUG] WORKSPACE/LOGIN TYPE: ${loginType || 'personal'}`);

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
            console.log(`[DEBUG] RX FOR PDF — Drug: "${rx.drugName}" | Dosage: "${rx.dosage}" | Freq: "${rx.frequency}"`);
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

          console.log(`[DEBUG] PDF BUFFER SIZE: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
          console.log(`[DEBUG] SENDING EMAIL TO: ${patient.email}`);

          const emailResult = await emailService.sendPrescriptionEmail(
            patient.email,
            patient.fullName,
            pdfBuffer
          );

          if (emailResult && emailResult.success) {
            console.log(`[DEBUG] EMAIL SENT SUCCESSFULLY — MessageID: ${emailResult.messageId}`);
          } else {
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
      }).catch(e => console.log('ML ingest error (non-critical):', e.message)),
      axios.post(process.env.ML_ENGINE_URL + '/patient-risk', {
        age: patient.dateOfBirth ? 
          Math.floor((Date.now()-new Date(patient.dateOfBirth))/(365.25*24*3600*1000)) : 30,
        chronicConditions: patient.chronicConditions || [],
        consultationCount30days: 1,
        activePrescriptionsCount: createdPrescriptions.length
      }, {
        headers: { 'x-internal-key': generateToken() }
      }).catch(e => console.log('ML risk error (non-critical):', e.message))
    ])
    
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
    const mlRes = await axios.post(
      `${process.env.ML_ENGINE_URL || 'http://localhost:5001'}/api/ml/predict-disease`,
      { symptoms },
      {
        headers: { 'x-internal-key': generateToken() }
      }
    );
    res.json(mlRes.data);
  } catch (error) {
    console.error('Error forwarding to ML engine:', error.message);
    res.status(500).json({ error: 'Failed to query ML Engine', details: error.message });
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
