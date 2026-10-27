'use strict';
const { eventHash } = require('./clinicalCommandService');
async function reconcileClinicalCommands({ CommandModel = require('../models/ClinicalCommand'), project = require('./clinicalAuditService').recordClinicalEvent, now = () => new Date() } = {}) {
  const rows = await CommandModel.find({ outbox: { $elemMatch: { projectedAt: { $exists: false } } } }).limit(100).lean();
  let inspected = 0, projected = 0;
  for (const row of rows) {
    for (const event of row.outbox) {
      if (event.projectedAt) continue;
      if (inspected++ >= 100) return { inspected: 100, projected };
      if (event.eventHash !== eventHash(event)) throw new Error('CLINICAL_OUTBOX_INTEGRITY_FAILURE');
      const result = await project({ actorId: event.actorId, actorRole: event.actorRole, action: event.action, resourceType: event.resourceType,
        resourceId: event.resourceId, eventAt: event.eventAt, projectionId: event.eventId, correlationId: String(row._id) });
      if (!result) continue;
      const changed = await CommandModel.updateOne({ _id: row._id, outbox: { $elemMatch: { eventId: event.eventId, eventHash: event.eventHash, projectedAt: { $exists: false } } } }, { $set: { 'outbox.$.projectedAt': now() } });
      if (changed.modifiedCount === 1) projected++;
    }
  }
  return { inspected, projected };
}
module.exports = { reconcileClinicalCommands };
