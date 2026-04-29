const router = require('express').Router();
const { register, login, refresh, logout } = require('../controllers/authController');
const Joi = require('joi');

// Input validation middleware
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const nicSchema = /^([0-9]{9}[vVxX]|[0-9]{12})$/; // Sri Lankan NIC format

router.post('/register', register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;