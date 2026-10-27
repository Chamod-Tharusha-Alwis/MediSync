'use strict';
const runtime = require('./securityRuntime');
const { createVersionedFieldPlugin } = require('./versionedFieldPluginCandidate');
const { nicIndexPlugin } = require('./nicPersistence');

module.exports = function fieldEncryption(schema, options) {
  // Register the index hook first, while its identifier is still plaintext.
  const identifierField = schema.path('patientNic') ? 'patientNic' : schema.path('nic') ? 'nic' : null;
  if (identifierField) schema.plugin(nicIndexPlugin, { field: identifierField });
  if (schema.path('encryptedFileKey')) schema.pre('save', function () {
    // File wrapping and field encryption have independent version histories.
    if (this.encryptedFileKey && this.reportEnvelopeVersion !== 2 && this.fileKeyVersion == null) this.fileKeyVersion = this.keyVersion || 1;
  });
  if (runtime.current().fieldMode === 'legacy') return require('./legacyFieldEncryption')(schema, options);
  return createVersionedFieldPlugin({
    getKeyConfiguration: () => runtime.current().fieldConfiguration(),
    getLegacyKeys: () => runtime.current().legacyKeys(),
    allowLegacyReads: runtime.current().allowsLegacyFieldReads()
  })(schema, options);
};
