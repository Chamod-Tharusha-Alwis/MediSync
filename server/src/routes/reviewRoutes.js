const express = require('express');
const router = express.Router();
const protect = require('../middleware/verifiedAuth');
const reviewController = require('../controllers/reviewController');
const reviewLimiter = require('express-rate-limit')({windowMs:60*60*1000,max:20,keyGenerator:req=>req.user.id,standardHeaders:true,legacyHeaders:false});

router.post('/', protect(['patient']), reviewLimiter, reviewController.submitReview);
router.get('/:targetId', reviewController.getTargetReviews);

module.exports = router;
