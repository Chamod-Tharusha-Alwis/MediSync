const crypto = require('crypto');
const { encrypt, decrypt } = require('mongoose-field-encryption');

const _hash = (secret) => crypto.createHash("sha256").update(secret).digest("hex").substring(0, 32);
const saltGenerator = () => crypto.randomBytes(16);

/**
 * Custom Mongoose Plugin: Versioned Encryption
 * Replaces mongoose-field-encryption to support multi-key rotation based on doc.keyVersion.
 */
function versionedEncryption(schema, options) {
  const fields = options.fields || [];

  // 1. Add schema fields for markers
  for (const field of fields) {
    schema.add({
      ['__enc_' + field]: { type: Boolean, default: false },
      ['__enc_' + field + '_d']: { type: String, default: '' }
    });
  }

  function getSecret(version) {
    const keys = global.ENCRYPTION_KEYS || {};
    const rawSecret = keys[String(version)];
    if (!rawSecret) {
      if (process.env.NODE_ENV === 'test' && process.env.ENCRYPTION_KEY) {
        return _hash(process.env.ENCRYPTION_KEY);
      }
      throw new Error(`Missing encryption key for version ${version}`);
    }
    return _hash(rawSecret);
  }

  function doEncrypt(doc) {
    // Determine active version for saving
    const targetVersion = global.ACTIVE_KEY_VERSION || 1;
    doc.keyVersion = targetVersion;
    const secret = getSecret(targetVersion);

    for (const field of fields) {
      const encryptedFieldName = '__enc_' + field;
      const encryptedFieldData = encryptedFieldName + '_d';
      const fieldValue = doc[field];

      if (!doc[encryptedFieldName] && typeof fieldValue !== 'undefined' && fieldValue !== null) {
        if (typeof fieldValue === 'string') {
          doc[field] = encrypt(fieldValue, secret, saltGenerator);
        } else {
          doc[encryptedFieldData] = encrypt(JSON.stringify(fieldValue), secret, saltGenerator);
          doc[field] = undefined;
        }
        doc[encryptedFieldName] = true;
      }
    }
  }

  function doDecrypt(doc) {
    const version = doc.keyVersion || 1;
    const secret = getSecret(version);

    for (const field of fields) {
      const encryptedFieldName = '__enc_' + field;
      const encryptedFieldData = encryptedFieldName + '_d';

      if (doc[encryptedFieldName]) {
        if (doc[encryptedFieldData]) {
          doc[field] = JSON.parse(decrypt(doc[encryptedFieldData], secret));
          doc[encryptedFieldData] = '';
        } else if (doc[field]) {
          doc[field] = decrypt(doc[field], secret);
        }
        doc[encryptedFieldName] = false;
      }
    }
  }

  schema.methods.encryptFieldsSync = function() { doEncrypt(this); };
  schema.methods.decryptFieldsSync = function() { doDecrypt(this); };

  schema.post('init', function(doc) {
    try {
      doDecrypt(doc);
    } catch (err) {
      console.error('[versionedEncryption] Decrypt error on init:', err.message);
    }
  });

  schema.pre('save', function() {
    doEncrypt(this);
  });
}

module.exports = versionedEncryption;
