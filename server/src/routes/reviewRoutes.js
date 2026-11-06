const express = require('express');
const router = express.Router();
const protect = require('../middleware/verifiedAuth');
const reviewController = require('../controllers/reviewController');
const reviewLimiter = require('express-rate-limit')({windowMs:60*60*1000,max:20,keyGenerator:req=>req.user.id,standardHeaders:true,legacyHeaders:false});

router.post('/', protect(['patient']), reviewLimiter, reviewController.submitReview);
const publicReviewLimiter = require('express-rate-limit')({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests', details: 'Please try again later.' },
  validate: { trustProxy: false }
});

router.get('/:targetId', publicReviewLimiter, reviewController.getTargetReviews);

module.exports = router;
