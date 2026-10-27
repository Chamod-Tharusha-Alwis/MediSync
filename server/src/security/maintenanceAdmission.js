'use strict';
function denyLegacyMaintenance() {
  throw new Error('LEGACY_DATASET_MAINTENANCE_DISABLED: use a separately approved exact-ID, versioned migration procedure');
}
module.exports = { denyLegacyMaintenance };
