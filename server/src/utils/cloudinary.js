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

module.exports = { cloudinary, upload };
