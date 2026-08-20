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

exports.getDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select('-password -otpSecret -orgLogins')
      .populate('hospitals', 'name district address')
      .lean();

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

    const enrichedDoctors = doctors.map(doc => {
      const dId = doc._id.toString();
      doc.averageRating = doc.averageRating || 0;
      doc.ratingCount = doc.ratingCount || 0;
      doc.recentReviews = reviewsMap[dId] || [];
      return doc;
    });

    res.json({ data: enrichedDoctors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doctors', details: error.message });
  }
};

exports.getHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().select('-password').lean();
    res.json({ data: hospitals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch hospitals', details: error.message });
  }
};

exports.getPharmacies = async (req, res) => {
  try {
    const pharmacies = await Pharmacy.find().select('-inventory').lean();
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
