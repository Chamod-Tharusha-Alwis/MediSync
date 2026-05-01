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
    const patients = await Patient.find({ district }).select('contactInfo');
    const emailList = patients.filter(p => p.contactInfo && p.contactInfo.email).map(p => p.contactInfo.email);

    if (emailList.length > 0) {
      await emailService.sendOutbreakAlert(emailList, district, message, zScore || 0);
    }

    res.json({ message: `Broadcasted alert to ${emailList.length} patients in ${district}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to broadcast alert', details: error.message });
  }
};

exports.getActiveAlerts = async (req, res) => {
  try {
    const alerts = await OutbreakAlert.find({ isActive: true }).sort({ createdAt: -1 });
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
