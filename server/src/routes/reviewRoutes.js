const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

router.post('/', protect(['patient']), reviewController.submitReview);
router.get('/:targetId', reviewController.getTargetReviews);

module.exports = router;
