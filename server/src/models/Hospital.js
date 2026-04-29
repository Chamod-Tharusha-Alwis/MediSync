const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['government', 'private'], required: true },
  district: String,
  address: String,
  regNo: { type: String, unique: true },
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);