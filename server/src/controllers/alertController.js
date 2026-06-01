const OutbreakAlert = require('../models/OutbreakAlert');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const emailService = require('../utils/emailService');

exports.triggerAlert = async (req, res) => {
  try {
    const internalKey = req.headers['x-internal-key'];
    if (internalKey !== process.env.INTERNAL_API_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { district, predictedCases, zScore, message, affectedIcdCodes } = req.body;

    const alert = new OutbreakAlert({
      district,
      predictedCases,
      zScore,
      message,
      affectedIcdCodes,
      isActive: true,
      severity: zScore > 3 ? 'critical' : zScore > 2 ? 'high' : 'moderate'
    });

    await alert.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('outbreak_alert', alert);
    }

    res.status(201).json({ message: 'Alert triggered and broadcasted', data: alert });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger alert', details: error.message });
  }
};

exports.broadcastAlert = async (req, res) => {
  try {
    const { district, message, zScore } = req.body;
    
    // Check admin role
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only admins can broadcast alerts' });
    }

    if (!district || !message) {
      return res.status(400).json({ error: 'District and message are required' });
    }

    // Send emails to all patients in a district
    const patients = await Patient.find({ district: district === 'Nationwide' ? { $exists: true } : district }).select('email fullName');
    const emailList = patients.filter(p => p.email).map(p => p.email);

    if (emailList.length > 0) {
      await emailService.sendOutbreakAlert(emailList, district, message, zScore || 0);
    }

    // Save to database for history
    const BroadcastMessage = require('../models/BroadcastMessage');
    const newBroadcast = new BroadcastMessage({
      title: req.body.title || 'System Alert',
      message: message,
      targetRole: req.body.targetRole || 'patient',
      targetDistrict: district,
      sentBy: req.user.id,
      sentAt: new Date()
    });
    await newBroadcast.save();

    res.json({ 
      message: `Broadcasted alert to ${emailList.length} recipients in ${district}`,
      data: newBroadcast
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to broadcast alert', details: error.message });
  }
};

exports.getActiveAlerts = async (req, res) => {
  try {
    const alerts = await OutbreakAlert.find({ status: 'Active' }).sort({ createdAt: -1 });
    res.json({ data: alerts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts', details: error.message });
  }
};

exports.getDiseaseTrends = async (req, res) => {
  try {
    const { district } = req.query;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchStage = { createdAt: { $gte: thirtyDaysAgo } };
    if (district) {
      const patientsInDistrict = await Patient.find({ district }).select('nic');
      const nics = patientsInDistrict.map(p => p.nic);
      matchStage.patientNic = { $in: nics };
    }

    const trends = await Consultation.aggregate([
      { $match: matchStage },
      { $group: { _id: "$diagnosis", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({ data: trends });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trends', details: error.message });
  }
};

exports.getLatestBroadcast = async (req, res) => {
  try {
    const BroadcastMessage = require('../models/BroadcastMessage');
    const latest = await BroadcastMessage.findOne().sort({ sentAt: -1, createdAt: -1 });
    res.json({ data: latest });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest broadcast', details: error.message });
  }
};

exports.verifyAlertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedbackStatus } = req.body; // 'confirmed' or 'false_positive'
    
    if (!['confirmed', 'false_positive'].includes(feedbackStatus)) {
      return res.status(400).json({ error: 'Invalid feedback status' });
    }

    const alert = await OutbreakAlert.findById(id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    alert.feedbackStatus = feedbackStatus;
    // Auto-resolve if marked as false_positive
    if (feedbackStatus === 'false_positive') {
      alert.status = 'Resolved';
    }
    await alert.save();

    // Call ML feedback endpoint
    const axios = require('axios');
    const { generateToken } = require('../utils/internalAuth');
    try {
      await axios.post(
        `${process.env.ML_ENGINE_URL || 'http://localhost:5001'}/api/ml/outbreak-feedback`,
        {
          disease: alert.disease,
          district: alert.location || alert.district || 'Colombo',
          is_true_outbreak: feedbackStatus === 'confirmed' ? 1 : 0,
          date: alert.createdAt.toISOString().split('T')[0]
        },
        {
          headers: { 'x-internal-key': generateToken() }
        }
      );
    } catch (mlErr) {
      console.error('Failed to send feedback to ML Engine:', mlErr.message);
    }

    res.json({ message: 'Alert feedback recorded successfully', data: alert });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record feedback', details: error.message });
  }
};
