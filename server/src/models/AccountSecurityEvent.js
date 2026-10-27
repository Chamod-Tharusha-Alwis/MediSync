'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, userModel: { type: String, required: true },
  actorId: String, actorModel: String,
  action: { type: String, required: true }, timestamp: { type: Date, required: true }
}, { collection: 'accountsecurityevents' });
module.exports = mongoose.model('AccountSecurityEvent', schema);
