const path = require('path');
const fs = require('fs');

let drugs = [];
let interactions = [];
let icd10 = [];
let symptomMap = [];

const loadData = () => {
  try {
    const drugsPath = path.join(__dirname, '../../../ml-engine/data/drugs_clean.json');
    if (fs.existsSync(drugsPath)) {
      drugs = require(drugsPath);
    }
  } catch (error) {
    console.error('Error loading drugs_clean.json:', error.message);
  }

  try {
    const interactionsPath = path.join(__dirname, '../../../ml-engine/data/interactions_clean.json');
    if (fs.existsSync(interactionsPath)) {
      interactions = require(interactionsPath);
    }
  } catch (error) {
    console.error('Error loading interactions_clean.json:', error.message);
  }

  try {
    const icd10Path = path.join(__dirname, '../../../ml-engine/data/icd10_clean.json');
    if (fs.existsSync(icd10Path)) {
      icd10 = require(icd10Path);
    }
  } catch (error) {
    console.error('Error loading icd10_clean.json:', error.message);
  }

  try {
    const symptomMapPath = path.join(__dirname, '../../../ml-engine/data/symptom_map.json');
    if (fs.existsSync(symptomMapPath)) {
      symptomMap = require(symptomMapPath);
      console.log(`Loaded symptom_map.json — ${symptomMap.length} diseases`);
    }
  } catch (error) {
    console.error('Error loading symptom_map.json:', error.message);
  }
};

loadData();

module.exports = {
  drugs,
  interactions,
  icd10,
  symptomMap,
};
