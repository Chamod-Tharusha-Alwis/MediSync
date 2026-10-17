const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const Review = require('../models/Review');
const axios = require('axios');
const { getCache, setCache } = require('../config/redis');
const internalAuth = require('../utils/internalAuth');

exports.getHealthStats = async (req, res) => {
  try {
    const rangeDays = parseInt(req.query.rangeDays) || 30;
    const district = req.query.district || 'all';
    const disease = req.query.disease || 'all';

    const cacheKey = `health-stats:${rangeDays}:${district}:${disease}`;
    
    // 1. Check Cache
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({ data: cachedData, cached: true });
    }

    // 2. Fetch from ML Engine (explicitly IPv4 127.0.0.1 to avoid Node localhost IPv6 resolution hangs)
    const mlEngineUrl = (process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
    const internalToken = internalAuth.generateToken();

    let response;
    let retries = 3;
    let delay = 500;
    while (retries > 0) {
      try {
        response = await axios.get(`${mlEngineUrl}/api/internal/health-stats`, {
          params: { rangeDays, district, disease },
          headers: {
            'x-internal-key': internalToken
          },
          timeout: 8000 // 8 second strict timeout
        });
        break; // Success
      } catch (err) {
        if (err.code === 'ECONNREFUSED' && retries > 1) {
          console.warn(`[PublicController] ML Engine connection refused. Retrying in ${delay}ms... (${retries - 1} retries left)`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2; // Exponential backoff
          retries--;
        } else {
          throw err;
        }
      }
    }

    const statsData = response.data;

    // 3. Cache the result for 5 minutes (300 seconds)
    await setCache(cacheKey, statsData, 300);

    res.json({ data: statsData, cached: false });
  } catch (error) {
    console.error('[PublicController] Failed to fetch health stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch public health statistics', details: error.message });
  }
};

const mongoose = require('mongoose');
const BanRecord = require('../models/BanRecord');
const { isAutomatedTestEnvironment, TEST_DB_NAME, PROD_DB_NAME } = require('../config/dbGuard');

const APPROVED_DEMO_DATASET_VERSION = 'MEDISYNC_UNIV_DEMO_V2';
const DEMO_DOCTOR_SYNTHETIC_LABEL = 'Demo Doctor — Synthetic Profile';
const DEMO_HOSPITAL_SYNTHETIC_LABEL = 'Demo Hospital — Synthetic Profile';
const DEMO_PHARMACY_SYNTHETIC_LABEL = 'Demo Pharmacy — Synthetic Profile';

const SYNTHETIC_DOCTOR_EMAIL_REGEX = /(?:@(?:test\.com|example\.com|invalid|demo\.medisync\.local|test\.medisync\.local)$|\.(?:invalid|test|example)$|^(?:dummy\.doctor|test_dup_|doctor_lic_|drtest_|qa\.doctor|synth[._-]))/i;
const SYNTHETIC_DOCTOR_NAME_REGEX = /^(?:dr\.?\s+)?(?:e2e\s+)?(?:test|dummy|qa|synthetic|demo)\s+(?:doctor|diag|hospital\s+specialist|practitioner|specialist|user)\b|\(demo\)/i;

/**
 * Fail-closed check for isolated university demonstration directory mode.
 * Requires ALL conditions simultaneously:
 *  1. NODE_ENV !== 'production'
 *  2. Automated test mode active (isAutomatedTestEnvironment() === true)
 *  3. Explicit demo-only feature flag ALLOW_SYNTHETIC_DEMO_DIRECTORY === 'true'
 *  4. Active verified Mongoose connection strictly to medisync_automated_test (never production 'test')
 */
const isIsolatedDemoDoctorDirectoryAllowed = () => {
  try {
    if (process.env.NODE_ENV === 'production') return false;
    if (!isAutomatedTestEnvironment()) return false;
    if (process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY !== 'true') return false;
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return false;
    const connectedDbName = String(mongoose.connection.name || '').trim();
    if (connectedDbName !== TEST_DB_NAME || connectedDbName === PROD_DB_NAME) return false;
    return true;
  } catch (_) {
    return false;
  }
};

const isPublicVerifiedDoctor = (doc, bannedDoctorIdSet = new Set(), options = {}) => {
  if (!doc) return false;
  if (doc.role && doc.role !== 'doctor') return false;
  if (doc.isActive !== true) return false;
  if (doc.isVerified !== true) return false;
  if (doc._id && bannedDoctorIdSet.has(String(doc._id))) return false;

  if (
    doc.loginType === 'hospital' &&
    Array.isArray(doc.orgLogins) &&
    doc.orgLogins.length > 0 &&
    doc.orgLogins.every(org => org && org.isActive === false)
  ) {
    return false;
  }

  const email = String(doc.email || '').trim().toLowerCase();
  const fullName = String(doc.fullName || '').trim();
  if (!email || !fullName) return false;

  const isSyntheticOrDemo =
    doc.isSynthetic === true ||
    doc.isDemoAccount === true ||
    doc.isDemoData === true;

  if (isSyntheticOrDemo) {
    const allowDemo =
      options.allowApprovedDemoDataset === true &&
      isIsolatedDemoDoctorDirectoryAllowed();
    if (!allowDemo) return false;
    if (doc.isSynthetic !== true) return false;
    if (doc.datasetVersion !== APPROVED_DEMO_DATASET_VERSION) return false;
    return true;
  }

  if (SYNTHETIC_DOCTOR_EMAIL_REGEX.test(email)) return false;
  if (SYNTHETIC_DOCTOR_NAME_REGEX.test(fullName)) return false;

  return true;
};

exports.isPublicVerifiedDoctor = isPublicVerifiedDoctor;
exports.isIsolatedDemoDoctorDirectoryAllowed = isIsolatedDemoDoctorDirectoryAllowed;
exports.APPROVED_DEMO_DATASET_VERSION = APPROVED_DEMO_DATASET_VERSION;
exports.DEMO_DOCTOR_SYNTHETIC_LABEL = DEMO_DOCTOR_SYNTHETIC_LABEL;

exports.getDoctors = async (req, res) => {
  try {
    const allowApprovedDemoDataset = isIsolatedDemoDoctorDirectoryAllowed();

    const activeBans = await BanRecord.find({
      targetModel: 'Doctor',
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    })
      .select('targetId')
      .lean();

    const bannedDoctorIdSet = new Set(activeBans.map(b => String(b.targetId)));

    const mongoQuery = allowApprovedDemoDataset
      ? {
          role: 'doctor',
          isActive: true,
          isVerified: true,
          $or: [
            { isSynthetic: { $ne: true }, isDemoAccount: { $ne: true }, isDemoData: { $ne: true } },
            {
              isSynthetic: true,
              datasetVersion: APPROVED_DEMO_DATASET_VERSION,
              isActive: true,
              isVerified: true
            }
          ]
        }
      : {
          role: 'doctor',
          isActive: true,
          isVerified: true,
          isSynthetic: { $ne: true },
          isDemoAccount: { $ne: true },
          isDemoData: { $ne: true }
        };

    const rawDoctors = await Doctor.find(mongoQuery)
      .select('doctorId fullName email specialization hospitals role loginType isActive isVerified isSynthetic isDemoAccount isDemoData datasetVersion verificationSource orgLogins contactNumber clinicAddress profilePicture description googleMapsUrl averageRating ratingCount createdAt')
      .populate('hospitals', 'name district address isSynthetic datasetVersion')
      .lean();

    const doctors = rawDoctors.filter(doc =>
      isPublicVerifiedDoctor(doc, bannedDoctorIdSet, { allowApprovedDemoDataset })
    );
    const doctorIds = doctors.map(d => d._id);

    const allRecentReviews = await Review.find({ 
      targetId: { $in: doctorIds }, 
      targetModel: 'Doctor', 
      comment: { $exists: true, $ne: '' } 
    })
      .sort({ createdAt: -1 })
      .select('targetId rating comment createdAt reviewerName')
      .lean();

    const reviewsMap = {};
    allRecentReviews.forEach(review => {
      const dId = review.targetId.toString();
      if (!reviewsMap[dId]) reviewsMap[dId] = [];
      if (reviewsMap[dId].length < 5) {
        reviewsMap[dId].push({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          reviewerName: review.reviewerName
        });
      }
    });

    let enrichedDoctors = doctors.map(doc => {
      const dId = doc._id.toString();
      const isSyntheticDemo = Boolean(doc.isSynthetic === true && doc.datasetVersion === APPROVED_DEMO_DATASET_VERSION);
      return {
        _id: doc._id,
        doctorId: doc.doctorId,
        fullName: doc.fullName,
        email: doc.email,
        specialization: doc.specialization || 'General Practice',
        hospitals: doc.hospitals || [],
        role: 'doctor',
        loginType: doc.loginType || 'personal',
        isActive: doc.isActive === true,
        isVerified: doc.isVerified === true,
        isSynthetic: Boolean(doc.isSynthetic),
        isDemoAccount: Boolean(doc.isDemoAccount),
        isDemoData: Boolean(doc.isDemoData),
        ...(isSyntheticDemo
          ? {
              datasetVersion: doc.datasetVersion,
              syntheticLabel: DEMO_DOCTOR_SYNTHETIC_LABEL,
              verificationNote: 'Synthetic University Demo Profile — Not Real SLMC Registration',
              slmcRegistered: false
            }
          : {}),
        contactNumber: doc.contactNumber || '',
        clinicAddress: doc.clinicAddress || '',
        profilePicture: doc.profilePicture || '',
        description: doc.description || '',
        googleMapsUrl: doc.googleMapsUrl || '',
        averageRating: doc.averageRating || 0,
        ratingCount: doc.ratingCount || 0,
        recentReviews: reviewsMap[dId] || [],
        createdAt: doc.createdAt
      };
    });

    const targetId = String(req.query?.id || req.query?.doctorId || '').trim();
    if (targetId) {
      const matchedDoctor = enrichedDoctors.find(
        d => String(d._id) === targetId || String(d.doctorId || '').toLowerCase() === targetId.toLowerCase()
      );
      if (!matchedDoctor) {
        return res.status(404).json({ error: 'Doctor not found or not publicly available' });
      }
      return res.json({ data: matchedDoctor });
    }

    const searchQuery = String(req.query?.search || req.query?.q || '').trim().toLowerCase();
    if (searchQuery) {
      enrichedDoctors = enrichedDoctors.filter(
        d =>
          String(d.fullName || '').toLowerCase().includes(searchQuery) ||
          String(d.specialization || '').toLowerCase().includes(searchQuery)
      );
    }

    const specializationQuery = String(req.query?.specialization || '').trim().toLowerCase();
    if (specializationQuery) {
      enrichedDoctors = enrichedDoctors.filter(
        d => String(d.specialization || '').toLowerCase().includes(specializationQuery)
      );
    }

    if (req.query?.page !== undefined || req.query?.limit !== undefined) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const total = enrichedDoctors.length;
      const paged = enrichedDoctors.slice((page - 1) * limit, page * limit);
      return res.json({
        data: paged,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    }

    res.json({ data: enrichedDoctors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doctors', details: error.message });
  }
};

exports.getDoctorById = async (req, res) => {
  req.query = { ...(req.query || {}), id: req.params?.id || req.query?.id };
  return exports.getDoctors(req, res);
};

exports.getHospitals = async (req, res) => {
  try {
    const rawHospitals = await Hospital.find().select('-password').lean();
    const hospitals = rawHospitals.map(h => {
      const isSynth = Boolean(h.isSynthetic === true || h.isDemoData === true || h.datasetVersion === APPROVED_DEMO_DATASET_VERSION);
      return {
        ...h,
        isSynthetic: isSynth,
        ...(isSynth ? { syntheticLabel: DEMO_HOSPITAL_SYNTHETIC_LABEL } : {})
      };
    });
    res.json({ data: hospitals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hospitals', details: error.message });
  }
};

exports.getPharmacies = async (req, res) => {
  try {
    const rawPharmacies = await Pharmacy.find().select('-inventory').lean();
    const pharmacies = rawPharmacies.map(p => {
      const isSynth = Boolean(p.isSynthetic === true || p.isDemoData === true || p.datasetVersion === APPROVED_DEMO_DATASET_VERSION);
      return {
        ...p,
        isSynthetic: isSynth,
        ...(isSynth ? { syntheticLabel: DEMO_PHARMACY_SYNTHETIC_LABEL } : {})
      };
    });
    res.json({ data: pharmacies });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pharmacies', details: error.message });
  }
};

exports.searchDiseases = async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.json({ data: [] });
    }
    
    const cacheKey = `search-diseases:${query.toLowerCase()}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({ data: cachedData, cached: true });
    }
    
    const mlEngineUrl = (process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
    const internalToken = internalAuth.generateToken();
    
    const response = await axios.get(`${mlEngineUrl}/api/internal/search-diseases`, {
      params: { q: query },
      headers: {
        'x-internal-key': internalToken
      },
      timeout: 3000
    });
    
    const results = response.data.results || [];
    await setCache(cacheKey, results, 300); // cache for 5 minutes
    
    res.json({ data: results, cached: false });
  } catch (error) {
    console.error('[PublicController] Failed to search diseases:', error.message);
    res.status(500).json({ error: 'Failed to search diseases', details: error.message });
  }
};
