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

    const doctorIds = doctors.map(d => d._id);

    const ratings = await ConsultationRating.aggregate([
      { $match: { doctorId: { $in: doctorIds } } },
      { $group: { _id: '$doctorId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const ratingsMap = ratings.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr;
      return acc;
    }, {});

    const allRecentReviews = await ConsultationRating.find({ doctorId: { $in: doctorIds }, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .select('doctorId rating comment createdAt')
      .lean();

    const reviewsMap = {};
    allRecentReviews.forEach(review => {
      const dId = review.doctorId.toString();
      if (!reviewsMap[dId]) reviewsMap[dId] = [];
      if (reviewsMap[dId].length < 5) reviewsMap[dId].push(review);
    });

    const enrichedDoctors = doctors.map(doc => {
      const dId = doc._id.toString();
      const r = ratingsMap[dId];
      if (r) {
        doc.averageRating = Number(r.avgRating.toFixed(1));
        doc.ratingCount = r.count;
      } else {
        doc.averageRating = 0;
        doc.ratingCount = 0;
      }
      doc.recentReviews = reviewsMap[dId] || [];
      return doc;
    });

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
