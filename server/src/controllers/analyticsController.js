const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const OutbreakAlert = require('../models/OutbreakAlert');

exports.getDashboardStats = async (req, res) => {
  try {
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
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'doctor'
      }},
      { $unwind: '$doctor' },
      { $project: { _id: 1, count: 1, name: '$doctor.fullName' } }
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
      if (typeof p.decryptFieldsSync === 'function') {
        try { p.decryptFieldsSync(); } catch(e) {}
      }
      if (p.medications && Array.isArray(p.medications)) {
        p.medications.forEach(m => {
          if (m.name) {
            drugCounts[m.name] = (drugCounts[m.name] || 0) + 1;
          }
        });
      }
    });

    const topDrugs = Object.entries(drugCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. Recent Outbreak Alerts
    const alerts = await OutbreakAlert.find({ ...hospitalQuery })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      data: {
        registrationGrowth,
        topDoctors,
        dispensingStats: { issuedCount, dispensedCount, dispensingRate },
        topDrugs,
        alerts
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
};
