const mongoose = require('mongoose');
const Review = require('../models/Review');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');

exports.submitReview = async (req, res) => {
  try {
    const { targetId, targetModel, rating, comment, consultationId } = req.body;
    const reviewerId = req.user.id;

    if (!targetId || !targetModel || !rating) {
      return res.status(400).json({ error: 'targetId, targetModel, and rating are required' });
    }

    if (!['Doctor', 'Hospital', 'Pharmacy'].includes(targetModel)) {
      return res.status(400).json({ error: 'Invalid targetModel' });
    }

    // Retrieve and decrypt patient's name
    const patient = await Patient.findById(reviewerId);
    let reviewerName = 'Anonymous Patient';
    if (patient) {
      if (typeof patient.decryptFieldsSync === 'function') {
        try { patient.decryptFieldsSync(); } catch (_) {}
      }
      reviewerName = patient.fullName || 'Anonymous Patient';
    }

    // Save the review
    const review = new Review({
      reviewerId,
      reviewerName,
      targetId,
      targetModel,
      rating,
      comment,
      consultationId
    });
    await review.save();

    // Recalculate average rating and rating count
    const stats = await Review.aggregate([
      { $match: { targetId: new mongoose.Types.ObjectId(targetId) } },
      { $group: { _id: '$targetId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const averageRating = stats.length > 0 ? Number(stats[0].avgRating.toFixed(1)) : 0;
    const ratingCount = stats.length > 0 ? stats[0].count : 0;

    // Update target document
    if (targetModel === 'Doctor') {
      await Doctor.findByIdAndUpdate(targetId, { averageRating, ratingCount });
    } else if (targetModel === 'Hospital') {
      await Hospital.findByIdAndUpdate(targetId, { averageRating, ratingCount });
    } else if (targetModel === 'Pharmacy') {
      await Pharmacy.findByIdAndUpdate(targetId, { averageRating, ratingCount });
    }

    res.status(201).json({
      message: 'Review submitted successfully',
      data: review,
      stats: { averageRating, ratingCount }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit review', details: error.message });
  }
};

exports.getTargetReviews = async (req, res) => {
  try {
    const { targetId } = req.params;
    const reviews = await Review.find({ targetId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ data: reviews });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews', details: error.message });
  }
};
