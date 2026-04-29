const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Doctor = require('../models/Doctor');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, specialization, licenseNo, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);
    const doctorId = `DR-${uuidv4().slice(0, 8).toUpperCase()}`; // Universal Doctor ID

    const doctor = await Doctor.create({
      doctorId, fullName, email,
      password: hashedPassword,
      specialization, licenseNo, role: role || 'doctor'
    });

    res.status(201).json({ message: 'Registered successfully', doctorId: doctor.doctorId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const doctor = await Doctor.findOne({ email });
    if (!doctor) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, doctor.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = generateTokens({ 
      id: doctor._id, role: doctor.role, doctorId: doctor.doctorId 
    });

    // Store refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, role: doctor.role, doctorId: doctor.doctorId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/auth/refresh
exports.refresh = (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const { accessToken } = generateTokens({ id: decoded.id, role: decoded.role, doctorId: decoded.doctorId });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
};