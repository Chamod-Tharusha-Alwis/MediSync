'use strict';
// Not bootstrapped by the application. Dedicated secret-manager integration requires approval.
const { createNicBlindIndex } = require('./nicBlindIndex');
let codec;
function initialize(configuration) {
  if (codec) throw new Error('NIC_INDEX_ALREADY_INITIALIZED');
  codec = createNicBlindIndex(configuration);
}
function activeNicIndex(nic) {
  if (!codec) throw new Error('NIC_INDEX_NOT_INITIALIZED');
  return codec.index(nic);
}
module.exports = { initialize, activeNicIndex };
