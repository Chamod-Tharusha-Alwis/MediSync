const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  reviewerName: {
    type: String,
    default: 'Anonymous'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetModel: {
    type: String,
    enum: ['Doctor', 'Hospital', 'Pharmacy'],
    required: true
  },
  consultationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
