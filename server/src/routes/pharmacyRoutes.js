const router = require('express').Router();
const protect = require('../middleware/auth');

// placeholder — full controller comes later
router.get('/:nic/prescriptions', protect(['pharmacist']), (req, res) => {
  res.json({ message: 'Pharmacy route working' });
});

module.exports = router;