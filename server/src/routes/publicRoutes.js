const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const rateLimit = require('express-rate-limit');

const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per `window`
  message: { error: 'Too many requests', details: 'Please try again later.' }
});

router.get('/doctors', publicController.getDoctors);
router.get('/hospitals', publicController.getHospitals);
router.get('/pharmacies', publicController.getPharmacies);
router.get('/health-stats', publicLimiter, publicController.getHealthStats);
router.get('/diseases/search', publicController.searchDiseases);

module.exports = router;
