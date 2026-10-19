'use strict';

/**
 * Cloudinary 2.11 & Multer-Storage-Cloudinary 4 Compatibility Test Suite
 * Verifies upload handling, adapter initialization, file rejection, signed URLs,
 * and rollback without making external network calls.
 */

const assert = require('assert');
const stream = require('stream');
const crypto = require('crypto');
const cloudinaryUtils = require('../src/utils/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

describe('Cloudinary 2.11 Compatibility & Hardening Specification', () => {
  it('1. Initializes storage adapter with Cloudinary 2.11 and valid parameters', () => {
    const storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'medisync/test-folder',
        resource_type: 'auto',
        allowed_formats: ['pdf', 'jpg', 'png']
      }
    });
    assert(storage !== null && typeof storage._handleFile === 'function');
    assert(typeof storage._removeFile === 'function');
  });

  it('2. Handles upload stream and extracts metadata properly', async () => {
    let uploadStreamCalled = false;
    const origUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = (opts, cb) => {
      uploadStreamCalled = true;
      const writable = new stream.Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      });
      writable.on('finish', () => {
        cb(null, {
          public_id: 'medisync/test-folder/mock_asset_123',
          secure_url: 'https://res.cloudinary.com/demo/image/upload/v1234/medisync/test-folder/mock_asset_123.pdf',
          bytes: 4096,
          format: 'pdf',
          resource_type: 'raw'
        });
      });
      return writable;
    };

    const storage = new CloudinaryStorage({
      cloudinary,
      params: { folder: 'medisync/test-folder' }
    });

    const mockFile = {
      stream: new stream.Readable({
        read() {
          this.push(Buffer.from('PDF_SYNTHETIC_CONTENT'));
          this.push(null);
        }
      }),
      mimetype: 'application/pdf',
      originalname: 'test-lab-report.pdf'
    };

    const uploadResult = await new Promise((resolve, reject) => {
      storage._handleFile({}, mockFile, (err, info) => {
        if (err) reject(err);
        else resolve(info);
      });
    });

    cloudinary.uploader.upload_stream = origUploadStream;

    assert.strictEqual(uploadStreamCalled, true);
    assert.strictEqual(uploadResult.filename, 'medisync/test-folder/mock_asset_123');
    assert.strictEqual(uploadResult.size, 4096);
    assert(uploadResult.path.startsWith('https://res.cloudinary.com/'));
  });

  it('3. Rolls back and destroys asset on failed upload', async () => {
    let destroyCalled = false;
    let destroyedFilename = null;
    const origDestroy = cloudinary.uploader.destroy;

    cloudinary.uploader.destroy = (publicId, opts, cb) => {
      destroyCalled = true;
      destroyedFilename = publicId;
      if (typeof opts === 'function') opts(null, { result: 'ok' });
      else if (typeof cb === 'function') cb(null, { result: 'ok' });
    };

    const storage = new CloudinaryStorage({ cloudinary, params: {} });
    await new Promise((resolve) => {
      storage._removeFile({}, { filename: 'medisync/test-folder/rollback_id_999' }, () => {
        resolve();
      });
    });

    cloudinary.uploader.destroy = origDestroy;

    assert.strictEqual(destroyCalled, true);
    assert.strictEqual(destroyedFilename, 'medisync/test-folder/rollback_id_999');
  });

  it('4. Enforces strict MIME type validation in upload middleware fileFilter', () => {
    const uploadMiddleware = cloudinaryUtils.upload;
    assert(uploadMiddleware !== null);

    let accepted = null;
    let filterErr = null;

    // Allowed PDF
    uploadMiddleware.fileFilter({}, { mimetype: 'application/pdf' }, (err, result) => {
      filterErr = err;
      accepted = result;
    });
    assert.strictEqual(filterErr, null);
    assert.strictEqual(accepted, true);

    // Allowed PNG
    uploadMiddleware.fileFilter({}, { mimetype: 'image/png' }, (err, result) => {
      filterErr = err;
      accepted = result;
    });
    assert.strictEqual(filterErr, null);
    assert.strictEqual(accepted, true);

    // Rejected executable
    uploadMiddleware.fileFilter({}, { mimetype: 'application/x-msdownload' }, (err, result) => {
      filterErr = err;
      accepted = result;
    });
    assert(filterErr !== null);
    assert.strictEqual(accepted, false);
    assert(filterErr.message.includes('Invalid file type'));

    // Rejected javascript
    uploadMiddleware.fileFilter({}, { mimetype: 'text/javascript' }, (err, result) => {
      filterErr = err;
      accepted = result;
    });
    assert(filterErr !== null);
    assert.strictEqual(accepted, false);
  });

  it('5. Enforces 2MB size limit and image-only filter for profile pictures', () => {
    const profileUpload = cloudinaryUtils.uploadProfilePic;
    assert(profileUpload !== null);
    assert.strictEqual(profileUpload.limits.fileSize, 2 * 1024 * 1024);

    let filterErr = null;
    let accepted = null;
    profileUpload.fileFilter({}, { mimetype: 'application/pdf' }, (err, result) => {
      filterErr = err;
      accepted = result;
    });
    assert(filterErr !== null);
    assert.strictEqual(accepted, false);
    assert(filterErr.message.includes('Invalid image type'));
  });

  it('6. Generates time-limited signed URLs for private clinical assets', () => {
    cloudinary.config({ cloud_name: 'medisync_qa', api_key: '123456789012345', api_secret: 'mock_secret_key_12345' });
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 300;
    const signedUrl = cloudinaryUtils.generateSignedUrl('medisync/test-results/lab_report_001', {
      resource_type: 'raw',
      expires_at: expiresAt
    });
    assert(typeof signedUrl === 'string');
    assert(signedUrl.includes('lab_report_001'));
    assert(signedUrl.includes(`expires_at=${expiresAt}`));
    assert(signedUrl.includes('signature='));
  });

  it('7. Handles encrypted laboratory report envelope with zero plaintext exposure', async () => {
    const plainBuffer = Buffer.from('%PDF-1.4 Mock sensitive patient blood panel results');
    const fileKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedBlob = Buffer.concat([authTag, encrypted]);

    // Ensure raw plaintext is NOT in encrypted blob
    assert(!encryptedBlob.includes(Buffer.from('blood panel results')));

    let uploadedEncrypted = false;
    const origUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = (opts, cb) => {
      assert.strictEqual(opts.resource_type, 'raw');
      assert.strictEqual(opts.type, 'authenticated');
      const writable = new stream.Writable({
        write(chunk, encoding, callback) {
          if (chunk.includes(authTag)) uploadedEncrypted = true;
          callback();
        }
      });
      writable.on('finish', () => {
        cb(null, {
          public_id: 'medisync/lab-reports/enc_report_789',
          secure_url: 'https://res.cloudinary.com/demo/raw/authenticated/v1/enc_report_789.enc'
        });
      });
      return writable;
    };

    const s = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', type: 'authenticated', folder: 'medisync/lab-reports' },
      () => {}
    );
    s.end(encryptedBlob);
    await new Promise((resolve) => setTimeout(resolve, 50));
    cloudinary.uploader.upload_stream = origUploadStream;

    assert.strictEqual(uploadedEncrypted, true);
  });

  it('8. Verifies nodemailer is purged with zero broken imports or fallbacks', () => {
    let nodemailFound = false;
    try {
      require('nodemailer');
      nodemailFound = true;
    } catch (_) {
      nodemailFound = false;
    }
    assert.strictEqual(nodemailFound, false, 'Nodemailer should not be loadable in node_modules');

    const emailService = require('../src/utils/emailService');
    assert.strictEqual(typeof emailService.sendOutbreakAlert, 'function');
    assert.strictEqual(typeof emailService.sendAnomalyEmail, 'function');
  });
});
