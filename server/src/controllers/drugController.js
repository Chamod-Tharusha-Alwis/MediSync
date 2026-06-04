const Drug = require('../models/Drug');
const { interactions, icd10, symptomMap } = require('../utils/loadDatasets');

const COMMON_DRUGS = [
  { name: 'Paracetamol', genericName: 'Acetaminophen', category: 'Analgesic', commonDosages: ['500mg', '1000mg'] },
  { name: 'Amoxicillin', genericName: 'Amoxicillin', category: 'Antibiotic', commonDosages: ['250mg', '500mg'] },
  { name: 'Ibuprofen', genericName: 'Ibuprofen', category: 'NSAID', commonDosages: ['200mg', '400mg'] },
  { name: 'Omeprazole', genericName: 'Omeprazole', category: 'PPI', commonDosages: ['20mg', '40mg'] },
  { name: 'Metformin', genericName: 'Metformin', category: 'Antidiabetic', commonDosages: ['500mg', '850mg'] },
  { name: 'Atorvastatin', genericName: 'Atorvastatin', category: 'Statin', commonDosages: ['10mg', '20mg'] },
  { name: 'Amlodipine', genericName: 'Amlodipine', category: 'Calcium Channel Blocker', commonDosages: ['5mg', '10mg'] },
  { name: 'Loratadine', genericName: 'Loratadine', category: 'Antihistamine', commonDosages: ['10mg'] },
  { name: 'Salbutamol', genericName: 'Albuterol', category: 'Bronchodilator', commonDosages: ['100mcg/dose'] },
  { name: 'Losartan', genericName: 'Losartan', category: 'ARB', commonDosages: ['50mg', '100mg'] },
  { name: 'Aspirin', genericName: 'Acetylsalicylic Acid', category: 'Antiplatelet', commonDosages: ['75mg', '150mg', '300mg'] },
  { name: 'Warfarin', genericName: 'Warfarin', category: 'Anticoagulant', commonDosages: ['1mg', '2mg', '5mg'] },
  { name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', category: 'Antibiotic', commonDosages: ['250mg', '500mg'] },
  { name: 'Clopidogrel', genericName: 'Clopidogrel', category: 'Antiplatelet', commonDosages: ['75mg'] },
  { name: 'Gabapentin', genericName: 'Gabapentin', category: 'Anticonvulsant', commonDosages: ['100mg', '300mg', '400mg'] },
  { name: 'Prednisolone', genericName: 'Prednisolone', category: 'Corticosteroid', commonDosages: ['5mg', '25mg'] },
  { name: 'Clindamycin', genericName: 'Clindamycin', category: 'Lincosamide Antibiotic', commonDosages: ['150mg', '300mg'] },
  { name: 'Caffeine', genericName: 'Caffeine', category: 'Stimulant', commonDosages: ['20mg'] }
];

exports.searchDrugs = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ data: [] });

    const regex = new RegExp(q, 'i');
    let drugs = await Drug.find({
      $or: [{ name: regex }, { genericName: regex }]
    }).limit(10).select('_id name genericName category commonDosages');

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

exports.getICDCodes = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ data: [] });

    const searchStr = q.toLowerCase();
    const results = icd10.filter(item => 
      item.code.toLowerCase().includes(searchStr) || 
      item.description.toLowerCase().includes(searchStr)
    ).slice(0, 10);

    return res.json({ data: results });
  } catch (error) {
    return res.status(500).json({ error: 'Error searching ICD', details: error.message });
  }
};

/**
 * GET /api/drugs/symptoms
 * Returns a deduplicated, sorted list of all valid symptom strings
 * read from the ML engine's symptom_map.json so the frontend can
 * provide an autocomplete that always matches what the ML expects.
 */
exports.getSymptoms = async (req, res) => {
  try {
    const symptomSet = new Set();
    if (Array.isArray(symptomMap)) {
      for (const disease of symptomMap) {
        const symptoms = disease.symptoms || disease.Symptoms || [];
        for (const s of symptoms) {
          if (s && s.trim()) {
            // Normalize internal whitespace (e.g. "Dischromic  Patches" → "Dischromic Patches")
            symptomSet.add(s.trim().replace(/\s+/g, ' '));
          }
        }
      }
    }
    const sorted = Array.from(symptomSet).sort();
    return res.json({ data: sorted });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching symptoms', details: error.message });
  }
};

/**
 * POST /api/drugs/interactions
 * Accepts an array of drug names (brand OR generic).
 * 1. Resolves each name to its generic name via the Drug collection or COMMON_DRUGS array.
 * 2. Checks the interactions dataset using generic names.
 * 3. Returns warnings with the original brand name labels the doctor used.
 */
exports.checkInteraction = async (req, res) => {
  try {
    const { drugs } = req.body; // array of drug names
    if (!drugs || drugs.length < 2) {
      return res.json({ data: { hasInteraction: false, warnings: [] } });
    }

    // Step 1: Resolve brand → generic for each drug
    // Batch query the database
    const regexps = drugs.map(name => new RegExp(`^${name}$`, 'i'));
    const foundDrugs = await Drug.find({
      $or: [
        { name: { $in: regexps } },
        { genericName: { $in: regexps } }
      ]
    }).select('name genericName').lean();

    const dbMap = {};
    foundDrugs.forEach(d => {
      if (d.name) dbMap[d.name.toLowerCase()] = d.genericName;
      if (d.genericName) dbMap[d.genericName.toLowerCase()] = d.genericName;
    });

    const resolvedDrugs = drugs.map((name) => {
      const lower = name.toLowerCase();
      let generic = dbMap[lower];

      // Fallback to COMMON_DRUGS if not found in Mongoose
      if (!generic) {
        const matched = COMMON_DRUGS.find(d => 
          d.name.toLowerCase() === lower ||
          d.genericName.toLowerCase() === lower
        );
        if (matched) {
          generic = matched.genericName;
        }
      }

      return {
        original: name,                          // label shown to doctor
        generic: generic || name                 // what we search in interactions_clean.json
      };
    });

    // Step 2: Check every pair using generic names
    const warnings = [];
    for (let i = 0; i < resolvedDrugs.length; i++) {
      for (let j = i + 1; j < resolvedDrugs.length; j++) {
        const drugA = resolvedDrugs[i].generic.toLowerCase();
        const drugB = resolvedDrugs[j].generic.toLowerCase();

        const interaction = interactions.find(entry => {
          const id1 = (entry.drug1 || '').toLowerCase();
          const id2 = (entry.drug2 || '').toLowerCase();
          return (
            (id1.includes(drugA) && id2.includes(drugB)) ||
            (id1.includes(drugB) && id2.includes(drugA))
          );
        });

        if (interaction) {
          warnings.push({
            // Use the brand names the doctor selected for the UI label
            drug1: resolvedDrugs[i].original,
            drug2: resolvedDrugs[j].original,
            severity: interaction.severity,
            message: interaction.description ||
              `Potential ${interaction.severity} interaction between ${resolvedDrugs[i].original} and ${resolvedDrugs[j].original}.`
          });
        }
      }
    }

    return res.json({
      data: {
        hasInteraction: warnings.length > 0,
        warnings
      }
    });
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
