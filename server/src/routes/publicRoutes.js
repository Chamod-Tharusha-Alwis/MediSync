const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/doctors', publicController.getDoctors);
router.get('/hospitals', publicController.getHospitals);
router.get('/pharmacies', publicController.getPharmacies);

module.exports = router;
