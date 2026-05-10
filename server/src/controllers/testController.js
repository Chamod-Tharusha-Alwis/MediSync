const TestOrder = require('../models/TestOrder');
const Consultation = require('../models/Consultation');

exports.orderTest = async (req, res) => {
  try {
    const {
      consultationId, patientNic, testName, testCategory,
      urgency, instructions, isSurgeryRelated, surgeryNotes, hospitalId
    } = req.body;

    if (!consultationId || !patientNic || !testName || !testCategory) {
      return res.status(400).json({ error: 'consultationId, patientNic, testName, and testCategory are required' });
    }

    // Verify the consultation belongs to the requesting doctor
    const consultation = await Consultation.findOne({ _id: consultationId, doctorId: req.user.id });
    if (!consultation) {
      return res.status(403).json({ error: 'Consultation not found or not authorized' });
    }

    const testOrder = new TestOrder({
      consultationId,
      patientNic,
      doctorId: req.user.id,
      hospitalId: hospitalId || consultation.sessionHospitalId || null,
      testName,
      testCategory,
      urgency: urgency || 'routine',
      instructions,
      isSurgeryRelated: isSurgeryRelated || false,
      surgeryNotes: isSurgeryRelated ? surgeryNotes : undefined,
      status: 'ordered',
    });

    await testOrder.save();
    return res.status(201).json({ message: 'Test ordered successfully', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to order test', details: error.message });
  }
};

exports.getPatientTests = async (req, res) => {
  try {
    const { nic } = req.params;

    // Patients can only view their own tests
    if (req.user.role === 'patient' && req.user.sub !== nic) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tests = await TestOrder.find({ patientNic: nic })
      .populate('doctorId', 'fullName specialization')
      .populate('hospitalId', 'name district')
      .sort({ orderedAt: -1 });

    return res.json({ data: tests });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch tests', details: error.message });
  }
};

exports.getConsultationTests = async (req, res) => {
  try {
    const { id } = req.params;

    const tests = await TestOrder.find({ consultationId: id })
      .populate('doctorId', 'fullName')
      .sort({ orderedAt: -1 });

    return res.json({ data: tests });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch consultation tests', details: error.message });
  }
};

exports.uploadTestResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { resultNotes, reportedBy } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const testOrder = await TestOrder.findById(id);
    if (!testOrder) {
      return res.status(404).json({ error: 'Test order not found' });
    }

    testOrder.resultFileUrl = req.file.path;                 // Cloudinary URL
    testOrder.resultFileName = req.file.originalname || req.file.filename;
    testOrder.resultCloudinaryId = req.file.filename;        // public_id from Cloudinary
    testOrder.resultUploadedAt = new Date();
    testOrder.resultNotes = resultNotes || '';
    testOrder.reportedBy = reportedBy || '';
    testOrder.status = 'completed';

    await testOrder.save();
    return res.json({ message: 'Result uploaded successfully', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to upload result', details: error.message });
  }
};

exports.updateTestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['ordered', 'sample_collected', 'processing', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const testOrder = await TestOrder.findById(id);
    if (!testOrder) return res.status(404).json({ error: 'Test order not found' });

    // Simple forward-only transition check
    const order = ['ordered', 'sample_collected', 'processing', 'completed'];
    const currentIdx = order.indexOf(testOrder.status);
    const newIdx = order.indexOf(status);
    if (newIdx < currentIdx) {
      return res.status(400).json({ error: 'Cannot move test backwards in status' });
    }

    testOrder.status = status;
    await testOrder.save();
    return res.json({ message: 'Status updated', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update status', details: error.message });
  }
};

exports.cancelTest = async (req, res) => {
  try {
    const { id } = req.params;

    const testOrder = await TestOrder.findOne({ _id: id, doctorId: req.user.id });
    if (!testOrder) return res.status(404).json({ error: 'Test order not found or not authorized' });

    if (testOrder.status !== 'ordered') {
      return res.status(400).json({ error: 'Only orders with status "ordered" can be cancelled' });
    }

    testOrder.status = 'cancelled';
    await testOrder.save();
    return res.json({ message: 'Test order cancelled', data: testOrder });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to cancel test', details: error.message });
  }
};

exports.getHospitalTests = async (req, res) => {
  try {
    const Hospital = require('../models/Hospital');
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = { hospitalId: hospital._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.urgency) filter.urgency = req.query.urgency;
    if (req.query.category) filter.testCategory = req.query.category;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.orderedAt = {};
      if (req.query.dateFrom) filter.orderedAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.orderedAt.$lte = new Date(req.query.dateTo);
    }
    
    const total = await TestOrder.countDocuments(filter);
    const tests = await TestOrder.find(filter)
      .populate('doctorId', 'fullName specialization doctorId')
      .sort({ orderedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({ data: tests, total, page, pages: Math.ceil(total/limit) });
  } catch (err) {
    console.error('getHospitalTests error:', err);
    res.status(500).json({ error: err.message });
  }
};

