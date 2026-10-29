'use strict';

const mlPredictionService = require('../services/mlPredictionService');

exports.predictDisease = async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms || (!Array.isArray(symptoms) && typeof symptoms !== 'string') || (Array.isArray(symptoms) && symptoms.length === 0)) {
      return res.status(400).json({
        availability: 'unavailable',
        predictions: [],
        error: 'Invalid symptoms payload. Expected non-empty array of strings.',
      });
    }

    const result = await mlPredictionService.predictDiseaseResilient(symptoms);
    return res.status(result.statusCode).json(result.data);
  } catch (_) {
    return res.status(503).json({
      availability: 'unavailable',
      predictions: [],
      error: 'AI suggestions unavailable. Please use the existing manual diagnosis option.',
    });
  }
};

exports.getHealth = async (req, res) => {
  try {
    const health = await mlPredictionService.checkMlHealth();
    const statusCode = health.availability === 'available' ? 200 : 503;
    return res.status(statusCode).json(health);
  } catch (_) {
    return res.status(503).json({
      availability: 'unavailable',
      status: 'unavailable',
      error: 'ML service probe unavailable',
    });
  }
};
