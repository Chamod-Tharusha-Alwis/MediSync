const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const Review = require('../models/Review');

exports.getDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select('-password -otpSecret -orgLogins')
      .populate('hospitals', 'name district address')
      .lean();

    const doctorIds = doctors.map(d => d._id);

    const allRecentReviews = await Review.find({ 
      targetId: { $in: doctorIds }, 
      targetModel: 'Doctor', 
      comment: { $exists: true, $ne: '' } 
    })
      .sort({ createdAt: -1 })
      .select('targetId rating comment createdAt reviewerName')
      .lean();

    const reviewsMap = {};
    allRecentReviews.forEach(review => {
      const dId = review.targetId.toString();
      if (!reviewsMap[dId]) reviewsMap[dId] = [];
      if (reviewsMap[dId].length < 5) {
        reviewsMap[dId].push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          reviewerName: review.reviewerName
        });
      }
    });

    const enrichedDoctors = doctors.map(doc => {
      const dId = doc._id.toString();
      doc.averageRating = doc.averageRating || 0;
      doc.ratingCount = doc.ratingCount || 0;
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
