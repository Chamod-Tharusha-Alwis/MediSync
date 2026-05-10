const axios = require('axios');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');

exports.getProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.id).select('-password -otpSecret');
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    return res.json({ data: doctor });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName, specialization, contactInfo } = req.body;
    const doctor = await Doctor.findByIdAndUpdate(
      req.user.id,
      { $set: { fullName, specialization, contactInfo } },
      { new: true }
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
      status: 'issued'
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
    
    // Build consultation object - only include fields that exist in schema
    const consultationData = {
      patientNic,
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
          patientNic,
          doctorId: req.user.id,
          drugName: rxData.drugName || rxData.name || '',
          dosage: rxData.dosage || '',
          frequency: rxData.frequency || '',
          durationDays: parseInt(rxData.durationDays) || 7,
          instructions: rxData.instructions || '',
          expiresAt,
          status: 'issued',
          hospitalId: sessionHospitalId || null,
        });
        await rxDoc.save();
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
    
    // Async ML calls - don't block response
    Promise.all([
      axios.post(process.env.ML_ENGINE_URL + '/ingest', {
        district: patient.district || 'Unknown',
        drugCategory: prescriptions[0]?.category || 'general',
        date: new Date().toISOString().split('T')[0]
      }).catch(e => console.log('ML ingest error (non-critical):', e.message)),
      axios.post(process.env.ML_ENGINE_URL + '/patient-risk', {
        age: patient.dateOfBirth ? 
          Math.floor((Date.now()-new Date(patient.dateOfBirth))/(365.25*24*3600*1000)) : 30,
        chronicConditions: patient.chronicConditions || [],
        consultationCount30days: 1,
        activePrescriptionsCount: createdPrescriptions.length
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
      { new: true }
    );

    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    return res.json({ message: 'Follow-up updated', data: consultation });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update follow-up', details: error.message });
  }
};
