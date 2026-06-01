const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const ConsultationRating = require('../models/ConsultationRating');

exports.getDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select('-password -otpSecret -orgLogins')
      .populate('hospitals', 'name district address')
      .lean();

    const enrichedDoctors = await Promise.all(doctors.map(async (doc) => {
      const ratings = await ConsultationRating.aggregate([
        { $match: { doctorId: doc._id } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]);
      
      const recentReviews = await ConsultationRating.find({ doctorId: doc._id, comment: { $exists: true, $ne: '' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('rating comment createdAt')
        .lean();

      if (ratings.length > 0) {
        doc.averageRating = Number(ratings[0].avgRating.toFixed(1));
        doc.ratingCount = ratings[0].count;
      } else {
        doc.averageRating = 0;
        doc.ratingCount = 0;
      }
      doc.recentReviews = recentReviews;
      return doc;
    }));

    res.json({ data: enrichedDoctors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doctors', details: error.message });
  }
};

exports.getHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().select('-password').lean();
    res.json({ data: hospitals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hospitals', details: error.message });
  }
};

exports.getPharmacies = async (req, res) => {
  try {
    const pharmacies = await Pharmacy.find().select('-inventory').lean();
    res.json({ data: pharmacies });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pharmacies', details: error.message });
  }
};
