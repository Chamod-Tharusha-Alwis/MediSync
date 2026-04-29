const router = require('express').Router();
const protect = require('../middleware/auth');
const { issuePrescription, getPendingByNic, dispense } = require('../controllers/prescriptionController');

router.post('/issue', protect(['doctor']), issuePrescription);
router.get('/pending/:nic', protect(['pharmacist']), getPendingByNic);
router.put('/dispense/:id', protect(['pharmacist']), dispense);

module.exports = router;