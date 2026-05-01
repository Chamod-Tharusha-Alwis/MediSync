const mongoose = require('mongoose');

const icdCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  description: { type: String, required: true }
});

module.exports = mongoose.model('ICDCode', icdCodeSchema);
