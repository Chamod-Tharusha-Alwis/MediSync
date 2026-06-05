/**
 * Cloudinary configuration for MediSync test result uploads.
 *
 * Free Cloudinary account: cloudinary.com (no credit card required)
 * Free tier: 10GB storage, 25 monthly credits
 * Setup: Create account → Dashboard → Copy API credentials → paste into .env
 *
 * Required .env variables:
 *   CLOUDINARY_CLOUD_NAME=your_cloud_name
 *   CLOUDINARY_API_KEY=your_api_key
 *   CLOUDINARY_API_SECRET=your_api_secret
 */
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage for test results — auto-detects PDF vs image
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'medisync/test-results',
    resource_type: 'auto',       // handles PDFs and images
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    transformation: [{ quality: 'auto' }],
  },
});

// Multer upload middleware — max 10MB
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'), false);
    }
  },
});

// ── Signed URL Generation ───────────────────────────────────────────────────
/**
 * Generate a time-limited signed URL for an authenticated Cloudinary asset.
 *
 * Authenticated assets are NOT publicly accessible. This function creates a
 * temporary signed URL that expires after a configurable duration.
 *
 * @param {string} publicId      — The Cloudinary public_id of the asset
 * @param {object} [options]     — Override options
 * @param {string} [options.resource_type='raw']  — 'raw' for PDFs, 'image' for images
 * @param {string} [options.type='authenticated'] — Cloudinary delivery type
 * @param {number} [options.expires_at]           — Unix timestamp for expiry (default: now + 5 min)
 * @returns {string} Signed URL
 */
function generateSignedUrl(publicId, options = {}) {
  const defaultExpiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

  return cloudinary.url(publicId, {
    resource_type: options.resource_type || 'raw',
    type:          options.type || 'authenticated',
    sign_url:      true,
    expires_at:    options.expires_at || defaultExpiry,
    secure:        true,
  });
}

// Cloudinary storage for profile pictures with automatic face-detection crop
const profilePicStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'medisync/profile-pics',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face', quality: 'auto' }],
  },
});

const uploadProfilePic = multer({
  storage: profilePicStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Only JPG, JPEG, and PNG are allowed.'), false);
    }
  },
});

module.exports = { cloudinary, upload, generateSignedUrl, uploadProfilePic };

