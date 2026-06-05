const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { uploadProfilePic } = require('../utils/cloudinary');
const userController = require('../controllers/userController');

router.post('/upload-profile-pic', protect(), uploadProfilePic.single('image'), userController.uploadProfilePic);
router.put('/profile', protect(), userController.updateProfile);

module.exports = router;
