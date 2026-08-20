const mongoose = require('mongoose');

const recoveryTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userModel: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('RecoveryToken', recoveryTokenSchema);
