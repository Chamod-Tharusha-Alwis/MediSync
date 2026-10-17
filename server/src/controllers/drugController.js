const Drug = require('../models/Drug');
const { icd10 } = require('../utils/loadDatasets');
const { escapeRegex, analyzeMedicationSafety } = require('../utils/ingredientResolver');
const whoIcd11Service = require('../services/whoIcd11Service');

const COMMON_DRUGS = [
  { name: 'Fluconazole', genericName: 'Fluconazole', category: 'Antifungal', commonDosages: ['150mg'] },
  { name: 'Clotrimazole Cream', genericName: 'Clotrimazole', category: 'Topical Antifungal', commonDosages: ['1%'] },
  { name: 'Cetirizine', genericName: 'Cetirizine', category: 'Antihistamine', commonDosages: ['10mg'] },
  { name: 'Loratadine', genericName: 'Loratadine', category: 'Antihistamine', commonDosages: ['10mg'] },
  { name: 'Omeprazole', genericName: 'Omeprazole', category: 'PPI', commonDosages: ['20mg', '40mg'] },
  { name: 'Ranitidine', genericName: 'Ranitidine', category: 'H2 Blocker', commonDosages: ['150mg', '300mg'] },
  { name: 'Ursodeoxycholic Acid', genericName: 'Ursodeoxycholic acid', category: 'Biliary Agent', commonDosages: ['300mg'] },
  { name: 'Cholestyramine', genericName: 'Cholestyramine', category: 'Bile Acid Sequestrant', commonDosages: ['4g'] },
  { name: 'Chlorpheniramine', genericName: 'Chlorpheniramine', category: 'Antihistamine', commonDosages: ['4mg'] },
  { name: 'Prednisolone', genericName: 'Prednisolone', category: 'Corticosteroid', commonDosages: ['5mg', '20mg'] },
  { name: 'Amoxicillin', genericName: 'Amoxicillin', category: 'Antibiotic', commonDosages: ['500mg', '1000mg'] },
  { name: 'Tenofovir Disoproxil', genericName: 'Tenofovir disoproxil', category: 'Antiretroviral', commonDosages: ['300mg'] },
  { name: 'Cotrimoxazole', genericName: 'Trimethoprim + Sulfamethoxazole', category: 'Antibacterial', commonDosages: ['960mg'] },
  { name: 'Metformin', genericName: 'Metformin', category: 'Antidiabetic', commonDosages: ['500mg', '850mg'] },
  { name: 'Gliclazide', genericName: 'Gliclazide', category: 'Antidiabetic', commonDosages: ['80mg'] },
  { name: 'Oral Rehydration Salts (ORS)', genericName: 'Sodium chloride + Potassium chloride + Sodium citrate + Dextrose', category: 'Electrolyte', commonDosages: ['1 sachet'] },
  { name: 'Zinc Sulfate', genericName: 'Zinc sulfate', category: 'Mineral Supplement', commonDosages: ['20mg'] },
  { name: 'Salbutamol Inhaler', genericName: 'Albuterol', category: 'Bronchodilator', commonDosages: ['100mcg/dose'] },
  { name: 'Fluticasone Inhaler', genericName: 'Fluticasone', category: 'Corticosteroid Inhaler', commonDosages: ['110mcg'] },
  { name: 'Amlodipine', genericName: 'Amlodipine', category: 'Calcium Channel Blocker', commonDosages: ['5mg', '10mg'] },
  { name: 'Enalapril', genericName: 'Enalapril', category: 'ACE Inhibitor', commonDosages: ['5mg', '10mg'] },
  { name: 'Sumatriptan', genericName: 'Sumatriptan', category: 'Antimigraine', commonDosages: ['50mg'] },
  { name: 'Naproxen', genericName: 'Naproxen', category: 'NSAID', commonDosages: ['250mg', '500mg'] },
  { name: 'Ibuprofen', genericName: 'Ibuprofen', category: 'NSAID', commonDosages: ['200mg', '400mg'] },
  { name: 'Pregabalin', genericName: 'Pregabalin', category: 'Neuropathic Analgesic', commonDosages: ['75mg', '150mg'] },
  { name: 'Mannitol', genericName: 'Mannitol', category: 'Osmotic Diuretic', commonDosages: ['20%'] },
  { name: 'Silymarin', genericName: 'Silymarin', category: 'Hepatoprotectant', commonDosages: ['140mg'] },
  { name: 'Artemether + Lumefantrine', genericName: 'Artemether + Lumefantrine', category: 'Antimalarial', commonDosages: ['80/480mg'] },
  { name: 'Chloroquine', genericName: 'Chloroquine', category: 'Antimalarial', commonDosages: ['250mg', '500mg'] },
  { name: 'Acyclovir', genericName: 'Acyclovir', category: 'Antiviral', commonDosages: ['400mg', '800mg'] },
  { name: 'Calamine Lotion', genericName: 'Calamine', category: 'Topical Antipruritic', commonDosages: ['Topical'] },
  { name: 'Paracetamol', genericName: 'Acetaminophen', category: 'Analgesic', commonDosages: ['500mg', '1000mg'] },
  { name: 'Paracetamol (Low Dose)', genericName: 'Acetaminophen', category: 'Analgesic', commonDosages: ['500mg'] },
  { name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', category: 'Antibiotic', commonDosages: ['250mg', '500mg'] },
  { name: 'Ceftriaxone', genericName: 'Ceftriaxone', category: 'Cephalosporin Antibiotic', commonDosages: ['1g', '2g'] },
  { name: 'Metoclopramide', genericName: 'Metoclopramide', category: 'Antiemetic', commonDosages: ['10mg'] },
  { name: 'Tenofovir Alafenamide', genericName: 'Tenofovir alafenamide', category: 'Antiviral', commonDosages: ['25mg'] },
  { name: 'Entecavir', genericName: 'Entecavir', category: 'Antiviral', commonDosages: ['0.5mg'] },
  { name: 'Sofosbuvir + Velpatasvir', genericName: 'Sofosbuvir + Velpatasvir', category: 'Antiviral', commonDosages: ['400/100mg'] },
  { name: 'Pegylated Interferon Alfa-2a', genericName: 'Peginterferon alfa-2a', category: 'Antiviral', commonDosages: ['180mcg'] },
  { name: 'Ribavirin', genericName: 'Ribavirin', category: 'Antiviral', commonDosages: ['200mg', '400mg'] },
  { name: 'Pentoxifylline', genericName: 'Pentoxifylline', category: 'Hemorheologic Agent', commonDosages: ['400mg'] },
  { name: 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol (RHZE)', genericName: 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol', category: 'Antitubercular', commonDosages: ['FDC'] },
  { name: 'Pyridoxine (Vitamin B6)', genericName: 'Pyridoxine', category: 'Vitamin Supplement', commonDosages: ['25mg'] },
  { name: 'Pseudoephedrine', genericName: 'Pseudoephedrine', category: 'Decongestant', commonDosages: ['60mg'] },
  { name: 'Amoxicillin + Clavulanate', genericName: 'Amoxicillin + Clavulanate', category: 'Antibiotic', commonDosages: ['625mg'] },
  { name: 'Azithromycin', genericName: 'Azithromycin', category: 'Macrolide Antibiotic', commonDosages: ['250mg', '500mg'] },
  { name: 'Flavonoid (Micronized Purified Flavonoid Fraction)', genericName: 'Diosmin', category: 'Phlebotonic', commonDosages: ['500mg'] },
  { name: 'Hydrocortisone Suppository', genericName: 'Hydrocortisone', category: 'Topical Steroid', commonDosages: ['25mg'] },
  { name: 'Aspirin', genericName: 'Acetylsalicylic acid', category: 'Antiplatelet', commonDosages: ['75mg', '300mg'] },
  { name: 'Warfarin', genericName: 'Warfarin', category: 'Anticoagulant', commonDosages: ['1mg', '2mg', '5mg'] },
  { name: 'Clopidogrel', genericName: 'Clopidogrel', category: 'Antiplatelet', commonDosages: ['75mg'] },
  { name: 'Diosmin + Hesperidin', genericName: 'Diosmin + Hesperidin', category: 'Phlebotonic', commonDosages: ['500mg'] },
  { name: 'Levothyroxine', genericName: 'Levothyroxine', category: 'Thyroid Hormone', commonDosages: ['50mcg', '100mcg'] },
  { name: 'Carbimazole', genericName: 'Carbimazole', category: 'Antithyroid Agent', commonDosages: ['15mg'] },
  { name: 'Propranolol', genericName: 'Propranolol', category: 'Beta Blocker', commonDosages: ['40mg'] },
  { name: 'Glucose Tablets', genericName: 'Dextrose', category: 'Carbohydrate', commonDosages: ['15g'] },
  { name: 'Meloxicam', genericName: 'Meloxicam', category: 'NSAID', commonDosages: ['7.5mg', '15mg'] },
  { name: 'Methotrexate', genericName: 'Methotrexate', category: 'DMARD', commonDosages: ['2.5mg', '10mg'] },
  { name: 'Betahistine', genericName: 'Betahistine', category: 'Antivertigo Agent', commonDosages: ['16mg'] },
  { name: 'Cinnarizine', genericName: 'Cinnarizine', category: 'Vestibular Suppressant', commonDosages: ['25mg'] },
  { name: 'Benzoyl Peroxide Gel', genericName: 'Benzoyl peroxide', category: 'Topical Acne Agent', commonDosages: ['5%'] },
  { name: 'Doxycycline', genericName: 'Doxycycline', category: 'Tetracycline Antibiotic', commonDosages: ['100mg'] },
  { name: 'Nitrofurantoin', genericName: 'Nitrofurantoin', category: 'Urinary Antibacterial', commonDosages: ['100mg'] },
  { name: 'Betamethasone Dipropionate Ointment', genericName: 'Betamethasone dipropionate', category: 'Topical Corticosteroid', commonDosages: ['0.05%'] },
  { name: 'Coal Tar Ointment', genericName: 'Coal tar', category: 'Keratolytic', commonDosages: ['5%'] },
  { name: 'Mupirocin Ointment', genericName: 'Mupirocin', category: 'Topical Antibiotic', commonDosages: ['2%'] },
  { name: 'Flucloxacillin', genericName: 'Flucloxacillin', category: 'Penicillin Antibiotic', commonDosages: ['500mg'] }
];

exports.COMMON_DRUGS = COMMON_DRUGS;

exports.searchDrugs = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || q.trim().length < 2) return res.json({ data: [] });

    const regex = new RegExp(escapeRegex(q.trim()), 'i');
    let drugs = await Drug.find({
      $or: [{ name: regex }, { genericName: regex }, { brand: regex }]
    }).limit(10).select('_id name genericName brand category commonDosages');

    // Fallback if Mongoose collection is empty (e.g. 0 documents)
    if (!drugs || drugs.length === 0) {
      drugs = COMMON_DRUGS.filter(d => 
        regex.test(d.name) || regex.test(d.genericName)
      ).map((d, index) => ({
        _id: `hc-${index}-${d.name.toLowerCase()}`,
        ...d
      }));
    }

    return res.json({ data: drugs });
  } catch (error) {
    return res.status(500).json({ error: 'Error searching drugs', details: error.message });
  }
};

/**
 * GET /api/drugs/icd/search
 * Searches internationally recognized disease and medical reference concepts.
 * Supports:
 * - ICD-10 (71,704 Clinical Modification concepts)
 * - WHO ICD-11 (MMS 2024-01 live API with offline curated core catalog fallback)
 * Query parameters:
 * - q: Search query (minimum 2 characters, matches code or description)
 * - version: 'all' | 'icd10' | 'icd11' (default: 'all')
 * - limit: Maximum results per version (default: 15)
 */
exports.getICDCodes = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.trim().length < 2) return res.json({ data: [] });

    const searchStr = q.trim().toLowerCase();
    const version = (req.query.version || 'all').toLowerCase();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));

    let combinedResults = [];

    // 1. ICD-10 Search (if version === 'all' or 'icd10')
    if (version === 'all' || version === 'icd10') {
      const icd10Matches = icd10.filter(item =>
        item.code.toLowerCase().includes(searchStr) ||
        item.description.toLowerCase().includes(searchStr)
      ).slice(0, limit).map(item => ({
        code: item.code,
        description: item.description,
        version: 'ICD-10',
        standard: 'ICD-10-CM',
        source: 'ICD-10 Reference'
      }));
      combinedResults.push(...icd10Matches);
    }

    // 2. WHO ICD-11 Search (if version === 'all' or 'icd11')
    if (version === 'all' || version === 'icd11') {
      try {
        const icd11Matches = await whoIcd11Service.searchIcd11(searchStr, limit);
        combinedResults.push(...icd11Matches);
      } catch (icd11Err) {
        console.warn('[ICD-11] Search failed, continuing with ICD-10 results:', icd11Err.message);
      }
    }

    // Sort: exact code matches first, then exact description startsWith, then general substring
    combinedResults.sort((a, b) => {
      const aCode = a.code.toLowerCase();
      const bCode = b.code.toLowerCase();
      const aDesc = a.description.toLowerCase();
      const bDesc = b.description.toLowerCase();

      if (aCode === searchStr && bCode !== searchStr) return -1;
      if (bCode === searchStr && aCode !== searchStr) return 1;
      if (aDesc.startsWith(searchStr) && !bDesc.startsWith(searchStr)) return -1;
      if (bDesc.startsWith(searchStr) && !aDesc.startsWith(searchStr)) return 1;
      return 0;
    });

    return res.json({
      data: combinedResults.slice(0, limit * 2),
      query: q,
      versionRequested: version,
      totalMatched: combinedResults.length
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error searching ICD', details: error.message });
  }
};

/**
 * GET /api/drugs/icd/status
 * Exposes WHO ICD-11 API status, cache count, and configuration instructions.
 */
exports.getWhoIcdStatus = async (req, res) => {
  try {
    const status = whoIcd11Service.getWhoApiStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve WHO ICD status', details: error.message });
  }
};

/**
 * GET /api/drugs/symptoms
 * Legacy endpoint previously returned valid symptom strings from symptom_map.json.
 * Since switching to the 71k database without symptom mappings, this now returns
 * a static baseline of generic symptoms so the frontend autocomplete doesn't break.
 */
exports.getSymptoms = async (req, res) => {
  try {
    const fallbackSymptoms = [
      'Abdominal Pain', 'Back Pain', 'Breathlessness', 'Chills', 'Chest Pain',
      'Cough', 'Diarrhoea', 'Dizziness', 'Fatigue', 'Fever', 'Headache',
      'High Fever', 'Itching', 'Joint Pain', 'Loss of Appetite', 'Muscle Pain',
      'Nausea', 'Rash', 'Runny Nose', 'Skin Rash', 'Sneezing', 'Sweating',
      'Vomiting', 'Weakness', 'Weight Loss', 'Yellow Skin', 'Yellow Urine'
    ];
    return res.json({ data: fallbackSymptoms });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching symptoms', details: error.message });
  }
};

/**
 * POST /api/drugs/interactions
 * Deterministic active-ingredient resolution and interaction checker.
 * - Parses branded names and formatted genericName strings without mutating stored records.
 * - Checks all active-ingredient pairs for multi-ingredient combination products.
 * - Uses exact normalized ingredient identities and reviewed 1-to-1 pharmacopoeial synonyms only.
 * - Flags unresolved ingredients with verificationIncomplete: true instead of silently assuming safety.
 */
exports.checkInteraction = async (req, res) => {
  try {
    const drugs = req.body?.drugs;
    if (!Array.isArray(drugs)) {
      const result = analyzeMedicationSafety(drugs, [], COMMON_DRUGS);
      return res.status(400).json({ error: result.statusMessage, data: result });
    }

    const stringNames = drugs
      .map(item => (typeof item === 'string' ? item.trim() : (item && typeof item === 'object' ? String(item.name || item.drugName || '').trim() : '')))
      .filter(Boolean);

    let foundDrugs = [];
    if (stringNames.length > 0) {
      const regexps = stringNames.map(name => new RegExp(`^${escapeRegex(name)}$`, 'i'));
      foundDrugs = await Drug.find({
        $or: [
          { name: { $in: regexps } },
          { brand: { $in: regexps } },
          { genericName: { $in: regexps } }
        ]
      }).select('name brand genericName category commonDosages').lean();
    }

    const safetyResult = analyzeMedicationSafety(drugs, foundDrugs, COMMON_DRUGS);
    return res.json({ data: safetyResult });
  } catch (error) {
    return res.status(500).json({ error: 'Error checking interactions', details: error.message });
  }
};

exports.recommendDrugs = async (req, res) => {
  try {
    const { icdCode } = req.body;
    if (!icdCode) return res.json({ data: [] });

    let recommendations = await Drug.find({ icdCodes: icdCode })
      .limit(5)
      .select('_id name genericName category commonDosages');

    // Fallback if Mongoose collection is empty
    if (!recommendations || recommendations.length === 0) {
      const lowerCode = icdCode.toLowerCase();
      if (lowerCode.includes('a90') || lowerCode.includes('dengue')) {
        recommendations = [
          { _id: 'hc-rec-para', name: 'Paracetamol', genericName: 'Acetaminophen', category: 'Analgesic', commonDosages: ['500mg'] }
        ];
      } else {
        // Return first 3 common drugs
        recommendations = COMMON_DRUGS.slice(0, 3).map((d, index) => ({
          _id: `hc-rec-${index}-${d.name.toLowerCase()}`,
          ...d
        }));
      }
    }

    return res.json({ data: recommendations });
  } catch (error) {
    return res.status(500).json({ error: 'Error getting recommendations', details: error.message });
  }
};

/**
 * GET /api/drugs/suggestions?disease=Dengue
 * Legacy endpoint previously used disease_medications.json.
 * Currently disabled for 71k scale-up, safely returning an empty array.
 */
exports.getMedicationSuggestions = async (req, res) => {
  try {
    return res.json({ data: [] });
  } catch (error) {
    return res.status(500).json({ error: 'Error getting medication suggestions', details: error.message });
  }
};
