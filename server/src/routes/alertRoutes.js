const router = require('express').Router();
const protect = require('../middleware/auth');

// POST /api/alerts/outbreak — called by ML engine
router.post('/outbreak', (req, res) => {
  const io = req.app.get('io');
  const alertData = req.body;
  
  // Broadcast to all connected health officers
  io.emit('outbreak_alert', alertData);
  console.log('Outbreak alert triggered:', alertData);
  
  res.json({ message: 'Alert broadcast sent' });
});

// GET /api/alerts — get recent alerts
router.get('/', protect(['health_officer', 'admin']), (req, res) => {
  res.json({ alerts: [] }); // will connect to DB later
});

module.exports = router;