const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const supportController = require('../controllers/supportController');

// Patient routes
router.post('/ticket', protect(['patient']), supportController.createTicket);
router.get('/my-tickets', protect(['patient']), supportController.getPatientTickets);

// Admin routes
router.get('/all-tickets', protect(['admin', 'super_admin']), supportController.getAllTickets);
router.post('/ticket/:id/reply', protect(['admin', 'super_admin']), supportController.replyTicket);

module.exports = router;
