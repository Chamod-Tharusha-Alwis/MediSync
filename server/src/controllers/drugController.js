const Drug = require('../models/Drug');
const { interactions, icd10, symptomMap } = require('../utils/loadDatasets');

exports.searchDrugs = async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ data: [] });

    const regex = new RegExp(q, 'i');
    const drugs = await Drug.find({
      $or: [{ name: regex }, { genericName: regex }]
    }).limit(10).select('_id name genericName category commonDosages');

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
 * 1. Resolves each name to its generic name via the Drug collection.
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
    const resolvedDrugs = await Promise.all(
      drugs.map(async (name) => {
        const found = await Drug.findOne({
          $or: [
            { name: new RegExp(`^${name}$`, 'i') },
            { genericName: new RegExp(`^${name}$`, 'i') }
          ]
        }).select('name genericName');

        return {
          original: name,                          // label shown to doctor
          generic: found?.genericName || name      // what we search in interactions_clean.json
        };
      })
    );

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

    const recommendations = await Drug.find({ icdCodes: icdCode })
      .limit(5)
      .select('_id name genericName category commonDosages');

    return res.json({ data: recommendations });
  } catch (error) {
    return res.status(500).json({ error: 'Error getting recommendations', details: error.message });
  }
};
