const mongoose = require('mongoose');

const drugSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  genericName: {
    type: String,
    trim: true
  },
  brand: {
    type: String,
    trim: true
  },
  category: {
  type: String,
  enum: [
    'antibiotic', 'antiviral', 'antifungal', 'antiparasitic', 
    'antihypertensive', 'antidiabetic', 'analgesic', 'antipyretic', 
    'antidepressant', 'antihistamine', 'antacid', 'anticoagulant', 
    'vitamin', 'respiratory', 'other'
  ],
  default: 'other'
},
  commonDosages: [{
    type: String
  }],
  interactions: [{
    type: String // array of drug names it interacts with
  }],
  sideEffects: [{
    type: String
  }],
  icdCodes: [{
    type: String // ICD-10 codes this drug is commonly used for
  }]
}, { timestamps: true });

module.exports = mongoose.model('Drug', drugSchema);
