'use strict';
const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  eventId: { type: String, required: true }, actorId: { type: String, required: true }, actorRole: { type: String, required: true },
  action: { type: String, required: true }, resourceType: { type: String, required: true }, resourceId: { type: String, required: true },
  eventAt: { type: Date, required: true }, eventHash: { type: String, required: true }, projectedAt: Date
}, { _id: false });
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true }, actorRole: { type: String, required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  kind: { type: String, required: true }, requestHash: { type: String, required: true },
  // Only opaque identifiers and counts; never persist the raw clinical request here.
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  outbox: { type: [eventSchema], validate: events => events.length > 0 && events.length <= 128 }
}, { timestamps: true, collection: 'clinicalcommands' });
// Non-capped, no TTL: clinical recovery evidence must not silently roll off.
module.exports = mongoose.model('ClinicalCommand', schema);
