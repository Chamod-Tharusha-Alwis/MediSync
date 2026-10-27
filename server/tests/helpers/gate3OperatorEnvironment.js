'use strict';
const production = () => ({ NODE_ENV: 'production', MEDISYNC_PROTOTYPE_MODE: 'true', MEDISYNC_ALLOW_OPERATOR_KEYS: 'true', ENCRYPTION_KEYS: JSON.stringify({ '1': require('crypto').randomBytes(32).toString('hex') }), ACTIVE_KEY_VERSION: '1', MEDISYNC_DEPLOYMENT_MODE: 'clinical', MEDISYNC_LIVE_START_APPROVED: 'true', MEDISYNC_ATLAS_ROTATION_CONFIRMED: 'true', MONGO_URI: 'mongodb+srv://inert:inert@medisync.p7hjket.mongodb.net/medisync_prod?tls=true' });
const qa = () => ({ NODE_ENV: 'test', MEDISYNC_QA_BOOTSTRAPPED: 'true', MEDISYNC_QA_CREDENTIALS_ROTATED: 'true', MONGO_URI_TEST: 'mongodb+srv://inert:inert@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test?tls=true' });
const identity = database => ({ authInfo: { authenticatedUsers: [{ user: 'inert', db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: database }] } });
module.exports = { production, qa, identity };
