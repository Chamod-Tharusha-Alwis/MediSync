const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const OutbreakAlert = require('../models/OutbreakAlert');

exports.getDashboardStats = async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user?.role)) return res.status(403).json({ error: 'Administrative analytics access required' });
    const hospitalQuery = (req.user.role === 'hospital_admin' && req.user.hospitalId) 
      ? { hospitalId: req.user.hospitalId } 
      : {};

    // 1. Patient Registration Growth (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const registrationGrowth = await Patient.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // 2. Total Consultations (by doctor, limited to top 5)
    // We cannot join encrypted fields, but doctorId is not encrypted, we can join doctor details.
    const topDoctors = await Consultation.aggregate([
      { $match: { ...hospitalQuery } },
      { $group: { _id: '$doctorId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'doctors',
          localField: '_id',
          foreignField: '_id',
          as: 'doctorDoc'
      }},
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc'
      }},
      { $project: {
          _id: 1,
          count: 1,
          name: {
            $ifNull: [
              { $arrayElemAt: ['$doctorDoc.fullName', 0] },
              { $arrayElemAt: ['$userDoc.fullName', 0] },
              'Dr. Practitioner'
            ]
          }
      }}
    ]);

    // 3. Most Prescribed Drugs & Dispensing Rate
    // Mongoose doesn't support aggregating over encrypted sub-arrays easily if drug name is encrypted.
    // However, if drugName is within the encrypted tests/medications array, we might have to fetch and decrypt.
    // Wait, let's check Prescription model if medications array is encrypted.
    
    // Instead of raw aggregation for drugs which might be encrypted, we'll fetch recent prescriptions and compute in-memory if needed.
    // To keep it scalable for MVP, let's just compute dispensing rate from status.
    const rxStats = await Prescription.aggregate([
      { $match: { ...hospitalQuery } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    let issuedCount = 0;
    let dispensedCount = 0;
    rxStats.forEach(s => {
      if (s._id === 'issued') issuedCount += s.count;
      if (s._id === 'dispensed') dispensedCount += s.count;
    });
    const totalRx = issuedCount + dispensedCount;
    const dispensingRate = totalRx === 0 ? 0 : Math.round((dispensedCount / totalRx) * 100);

    // Fetch recent prescriptions to calculate top drugs in memory since it's encrypted.
    const recentPrescriptions = await Prescription.find({ ...hospitalQuery })
      .sort({ createdAt: -1 })
      .limit(500);
    
    const drugCounts = {};
    recentPrescriptions.forEach(p => {
      if (typeof p.decryptFieldsSync === 'function') p.decryptFieldsSync();
      if (Array.isArray(p.medications) && p.medications.length) {
        p.medications.forEach(m => {
          if (m.name) {
            drugCounts[m.name] = (drugCounts[m.name] || 0) + 1;
          }
        });
      } else if (p.drugName) drugCounts[p.drugName] = (drugCounts[p.drugName] || 0) + 1;
    });

    const topDrugs = Object.entries(drugCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. Recent Outbreak Alerts
    let alerts = [];
    try {
      const surveillanceService = require('../services/surveillanceService');
      alerts = await OutbreakAlert.find({
        ...hospitalQuery,
        surveillancePolicy: surveillanceService.POLICY,
        ...surveillanceService.realAlertFilter(),
        status: 'Active'
      })
        .sort({ createdAt: -1 })
        .limit(5);
    } catch (_) {
      alerts = [];
    }

    res.json({
      data: {
        registrationGrowth: Array.isArray(registrationGrowth) ? registrationGrowth : [],
        topDoctors: Array.isArray(topDoctors) ? topDoctors : [],
        dispensingStats: {
          issuedCount: Number(issuedCount) || 0,
          dispensedCount: Number(dispensedCount) || 0,
          dispensingRate: Number(dispensingRate) || 0
        },
        topDrugs: Array.isArray(topDrugs) ? topDrugs : [],
        alerts: Array.isArray(alerts) ? alerts : []
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
