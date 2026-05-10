const express = require('express');
const router = express.Router();
const drugController = require('../controllers/drugController');
const protect = require('../middleware/auth');

router.get('/search', protect(['doctor', 'pharmacist', 'pharmacy_admin']), drugController.searchDrugs);

// ICD routes — both canonical and alias paths
router.get('/icd/search',  protect(['doctor']), drugController.getICDCodes);
router.get('/icd-search',  protect(['doctor']), drugController.getICDCodes);  // alias

// Drug interaction routes — both canonical and alias paths
router.post('/interactions',       protect(['doctor', 'pharmacist', 'pharmacy_admin']), drugController.checkInteraction);
router.post('/check-interaction',  protect(['doctor', 'pharmacist', 'pharmacy_admin']), drugController.checkInteraction);  // alias

// Drug recommendation routes — both canonical and alias paths
router.post('/recommendations', protect(['doctor']), drugController.recommendDrugs);
router.post('/recommend',       protect(['doctor']), drugController.recommendDrugs);  // alias

// Returns all valid symptom names from the ML symptom_map.json
router.get('/symptoms', protect(['doctor']), drugController.getSymptoms);

module.exports = router;
