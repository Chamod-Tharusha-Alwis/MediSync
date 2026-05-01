const express = require('express');
const router = express.Router();
const drugController = require('../controllers/drugController');
const protect = require('../middleware/auth');

router.get('/search', protect(['doctor', 'pharmacist', 'pharmacy_admin']), drugController.searchDrugs);
router.get('/icd/search', protect(['doctor']), drugController.getICDCodes);
router.post('/interactions', protect(['doctor', 'pharmacist', 'pharmacy_admin']), drugController.checkInteraction);
router.post('/recommendations', protect(['doctor']), drugController.recommendDrugs);
// Returns all valid symptom names from the ML symptom_map.json
router.get('/symptoms', protect(['doctor']), drugController.getSymptoms);

module.exports = router;
