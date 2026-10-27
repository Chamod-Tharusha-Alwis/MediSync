const { drugs: catalogDrugs, interactions: rawInteractions } = require('./loadDatasets');

/**
 * Reviewed, explicit 1-to-1 chemical-identity synonym mappings (BAN/BP <-> INN/USAN).
 *
 * SAFETY POLICY:
 * - Only true chemical-identity synonyms of the exact same molecule are listed here.
 * - Pharmaceutical salts, esters, vitamers, and modified-release formulations are NOT
 *   indiscriminately stripped or conflated.
 * - Any ingredient not matching the reference interaction dataset directly or via this
 *   reviewed dictionary is treated as unresolved (setting verificationIncomplete: true).
 */
const REVIEWED_SYNONYMS = Object.freeze({
  'amoxycillin': 'amoxicillin',
  'amoxicillin': 'amoxicillin',
  'paracetamol': 'acetaminophen',
  'acetaminophen': 'acetaminophen',
  'salbutamol': 'salbutamol',
  'albuterol': 'salbutamol',
  'levosalbutamol': 'levosalbutamol',
  'levalbuterol': 'levosalbutamol',
  'frusemide': 'furosemide',
  'furosemide': 'furosemide',
  'lignocaine': 'lidocaine',
  'lidocaine': 'lidocaine',
  'adrenaline': 'epinephrine',
  'epinephrine': 'epinephrine',
  'noradrenaline': 'norepinephrine',
  'norepinephrine': 'norepinephrine',
  'cyclosporin': 'cyclosporine',
  'ciclosporin': 'cyclosporine',
  'cyclosporine': 'cyclosporine',
  'cephalexin': 'cephalexin',
  'cefalexin': 'cephalexin',
  'cephradine': 'cefradine',
  'cefradine': 'cefradine',
  'indomethacin': 'indomethacin',
  'indometacin': 'indomethacin',
  'glibenclamide': 'glyburide',
  'glyburide': 'glyburide',
  'pethidine': 'meperidine',
  'meperidine': 'meperidine',
  'bendrofluazide': 'bendroflumethiazide',
  'bendroflumethiazide': 'bendroflumethiazide',
  'chlorphenamine': 'chlorpheniramine',
  'chlorpheniramine': 'chlorpheniramine',
  'dicyclomine': 'dicyclomine',
  'dicycloverine': 'dicyclomine',
  'dosulepin': 'dosulepin',
  'dothiepin': 'dosulepin',
  'hydroxyurea': 'hydroxyurea',
  'hydroxycarbamide': 'hydroxyurea',
  'mitozantrone': 'mitoxantrone',
  'mitoxantrone': 'mitoxantrone',
  'nicoumalone': 'acenocoumarol',
  'acenocoumarol': 'acenocoumarol',
  'phenobarbitone': 'phenobarbital',
  'phenobarbital': 'phenobarbital',
  'sulphamethoxazole': 'sulfamethoxazole',
  'sulfamethoxazole': 'sulfamethoxazole',
  'sulphasalazine': 'sulfasalazine',
  'sulfasalazine': 'sulfasalazine',
  'thyroxine': 'levothyroxine',
  'levothyroxine': 'levothyroxine',
  'trimeprazine': 'alimemazine',
  'alimemazine': 'alimemazine',
  'cholecalciferol': 'cholecalciferol',
  'colecalciferol': 'cholecalciferol',
  'aspirin': 'acetylsalicylic acid',
  'acetylsalicylic acid': 'acetylsalicylic acid',
  'doxofylline': 'doxofylline',
  'doxophylline': 'doxofylline',
  'isosorbide-5-mononitrate': 'isosorbide mononitrate',
  'isosorbide mononitrate': 'isosorbide mononitrate',
  'glyceryl trinitrate': 'nitroglycerin',
  'nitroglycerin': 'nitroglycerin',
  'rifampicin': 'rifampicin',
  'rifampin': 'rifampicin',
  'oestradiol': 'estradiol',
  'estradiol': 'estradiol',
  'norethisterone': 'norethisterone',
  'norethindrone': 'norethisterone',
  'vitamin b1 (thiamine)': 'thiamine',
  'thiamine': 'thiamine',
  'vitamin b6 (pyridoxine)': 'pyridoxine',
  'pyridoxine': 'pyridoxine',
  'vitamin c': 'ascorbic acid',
  'ascorbic acid': 'ascorbic acid'
});

const FORMULATION_PATTERNS = [
  [/\bdry\s+syrup\b/i, 'Dry Syrup'],
  [/\boral\s+drops\b/i, 'Oral Drops'],
  [/\beye\s+drops\b/i, 'Eye Drops'],
  [/\bear\s+drops\b/i, 'Ear Drops'],
  [/\bnasal\s+spray\b/i, 'Nasal Spray'],
  [/\bnasal\s+drops\b/i, 'Nasal Drops'],
  [/\b(?:dt|dispersible\s+tablets?)\b/i, 'Dispersible Tablet'],
  [/\bfilm-coated\s+tablets?\b/i, 'Film-Coated Tablet'],
  [/\bchewable\s+tablets?\b/i, 'Chewable Tablet'],
  [/\beffervescent\s+tablets?\b/i, 'Effervescent Tablet'],
  [/\btablets?\b/i, 'Tablet'],
  [/\bcapsules?\b/i, 'Capsule'],
  [/\brotacaps?\b/i, 'Rotacap'],
  [/\bsmartules?\b/i, 'Smartule'],
  [/\brespules?\b/i, 'Respules'],
  [/\binhalers?\b/i, 'Inhaler'],
  [/\bexpectorants?\b/i, 'Expectorant'],
  [/\bsuspensions?\b/i, 'Suspension'],
  [/\bsyrups?\b/i, 'Syrup'],
  [/\binjections?\b/i, 'Injection'],
  [/\binfusions?\b/i, 'Infusion'],
  [/\bointments?\b/i, 'Ointment'],
  [/\bcreams?\b/i, 'Cream'],
  [/\blotions?\b/i, 'Lotion'],
  [/\bgels?\b/i, 'Gel'],
  [/\bsuppositor(?:y|ies)\b/i, 'Suppository'],
  [/\bsachets?\b/i, 'Sachet'],
  [/\bpowders?\b/i, 'Powder'],
  [/\bsolutions?\b/i, 'Solution'],
  [/\bdrops\b/i, 'Drops'],
  [/\bsprays?\b/i, 'Spray'],
  [/\bpatches\b|\bpatch\b/i, 'Patch']
];

const STRENGTH_TOKEN_REGEX = /\b\d+(?:\.\d+)?\s*(?:mg|gm|g|mcg|ug|ml|l|%|iu|units|meq|mmol|million\s+spores|spores|billions|lac|lakh)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|gm|g|mcg|ug|ml|l|dose))?/gi;

const FORM_STRIP_REGEX = /\b(?:dispersible\s+tablets?|film-coated\s+tablets?|chewable\s+tablets?|effervescent\s+tablets?|dry\s+syrup|oral\s+drops|eye\s+drops|ear\s+drops|nasal\s+spray|nasal\s+drops|tablets?|capsules?|rotacaps?|smartules?|respules?|inhalers?|expectorants?|suspensions?|syrups?|injections?|infusions?|ointments?|creams?|lotions?|gels?|suppositor(?:y|ies)|sachets?|powders?|solutions?|drops|sprays?|patches|\d+\s*'\s*s)\b/gi;

const NO_INTERACTION_MESSAGE = 'No interaction found in the available reference dataset.';

// Build O(1) lookup structures from interactions_clean.json and drugs_clean.json
const canonicalDrugSet = new Set();
const canonicalDisplayMap = new Map();
const interactionPairMap = new Map();

function initReferenceIndex() {
  if (canonicalDrugSet.size > 0) return;
  for (const entry of (rawInteractions || [])) {
    const raw1 = (entry.drug1 || '').trim();
    const raw2 = (entry.drug2 || '').trim();
    if (!raw1 || !raw2) continue;
    const k1 = raw1.toLowerCase();
    const k2 = raw2.toLowerCase();
    canonicalDrugSet.add(k1);
    canonicalDrugSet.add(k2);
    if (!canonicalDisplayMap.has(k1)) canonicalDisplayMap.set(k1, raw1);
    if (!canonicalDisplayMap.has(k2)) canonicalDisplayMap.set(k2, raw2);

    const pairKey = k1 < k2 ? `${k1}||${k2}` : `${k2}||${k1}`;
    if (!interactionPairMap.has(pairKey)) {
      interactionPairMap.set(pairKey, {
        drug1: raw1,
        drug2: raw2,
        severity: entry.severity || 'moderate',
        description: entry.description || ''
      });
    }
  }
}

initReferenceIndex();

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFormulation(text) {
  if (!text || typeof text !== 'string') return 'Unspecified';
  for (const [pattern, label] of FORMULATION_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return 'Unspecified';
}

function extractStrengthTokens(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(STRENGTH_TOKEN_REGEX) || [];
  return matches.map(m => m.replace(/\s+/g, ' ').trim());
}

/**
 * Strips ONLY the "Generic Name" prefix, "Also Known As: ..." tail, numeric dosage
 * strength tokens, and non-chemical dosage-form/pack words from a single ingredient slot.
 * Does NOT strip pharmaceutical salts, esters, or release-form qualifiers.
 */
function parseSingleIngredientSlot(slotText) {
  if (!slotText || typeof slotText !== 'string') {
    return { rawIngredient: '', strengths: [] };
  }
  const strengths = extractStrengthTokens(slotText);
  let withoutStrengths = slotText.replace(STRENGTH_TOKEN_REGEX, ' ');
  const prelim = withoutStrengths.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!canonicalDrugSet.has(prelim) && !REVIEWED_SYNONYMS[prelim]) {
    withoutStrengths = withoutStrengths.replace(FORM_STRIP_REGEX, ' ');
  }
  const cleaned = withoutStrengths
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-/,.:;]+|[\s\-/,.:;]+$/g, '')
    .trim();
  return {
    rawIngredient: cleaned.toLowerCase(),
    displayIngredient: cleaned,
    strengths
  };
}

/**
 * Resolves a single normalized active ingredient string against the reference dataset
 * using exact identity or reviewed 1-to-1 pharmacopoeial synonym mapping.
 */
function resolveSingleIngredient(rawIngredient) {
  if (!rawIngredient || !/[a-z]/i.test(rawIngredient)) {
    return { resolved: false, canonical: null, display: null };
  }
  const norm = rawIngredient.trim().toLowerCase();
  if (canonicalDrugSet.has(norm)) {
    return {
      resolved: true,
      canonical: norm,
      display: canonicalDisplayMap.get(norm) || norm
    };
  }
  const mapped = REVIEWED_SYNONYMS[norm];
  if (mapped && canonicalDrugSet.has(mapped)) {
    return {
      resolved: true,
      canonical: mapped,
      display: canonicalDisplayMap.get(mapped) || mapped
    };
  }
  return { resolved: false, canonical: null, display: null };
}

/**
 * Extracts active ingredients, strengths, and formulation for a single medication entry.
 */
function parseMedicationEntry(rawInput, catalogDoc = null) {
  let originalName = '';
  let inputDosage = '';

  if (typeof rawInput === 'string') {
    originalName = rawInput.trim();
  } else if (rawInput && typeof rawInput === 'object') {
    originalName = String(rawInput.name || rawInput.drugName || '').trim();
    inputDosage = String(rawInput.dosage || rawInput.strength || '').trim();
  }

  if (!originalName || !/[a-z]/i.test(originalName)) {
    return {
      valid: false,
      originalName: originalName || String(rawInput ?? ''),
      brand: '',
      strength: inputDosage || 'Unspecified',
      formulation: 'Unspecified',
      resolvedIngredients: [],
      unresolvedIngredients: ['<malformed_or_empty_input>'],
      allIngredientsNormalized: []
    };
  }

  const brandLabel = catalogDoc?.brand || catalogDoc?.name || originalName;
  const genericSource = catalogDoc?.genericName || originalName;

  // Strip leading "Generic Name" and trailing "Also Known As: ..."
  let primarySegment = String(genericSource).replace(/^Generic\s+Name\s+/i, '').trim();
  if (/\bAlso\s+Known\s+As\s*:/i.test(primarySegment)) {
    primarySegment = primarySegment.split(/\bAlso\s+Known\s+As\s*:/i)[0].trim();
  }

  // If the medication was not found in the catalog and does not start with "Generic Name",
  // only strip trailing pack/formulation words if the raw string itself isn't already a known ingredient
  const rawSlots = primarySegment.split('+').map(s => s.trim()).filter(Boolean);

  const resolvedIngredients = [];
  const unresolvedIngredients = [];
  const allIngredientsNormalized = [];
  const extractedStrengths = [];

  for (const slot of rawSlots) {
    const { rawIngredient, strengths } = parseSingleIngredientSlot(slot);
    if (strengths.length > 0) {
      extractedStrengths.push(...strengths);
    }
    if (!rawIngredient || !/[a-z]/i.test(rawIngredient)) {
      unresolvedIngredients.push(slot || originalName);
      continue;
    }

    const res = resolveSingleIngredient(rawIngredient);
    if (res.resolved) {
      if (!resolvedIngredients.some(r => r.canonical === res.canonical)) {
        resolvedIngredients.push({
          raw: rawIngredient,
          canonical: res.canonical,
          display: res.display
        });
      }
      if (!allIngredientsNormalized.includes(res.canonical)) {
        allIngredientsNormalized.push(res.canonical);
      }
    } else {
      if (!unresolvedIngredients.includes(rawIngredient)) {
        unresolvedIngredients.push(rawIngredient);
      }
      if (!allIngredientsNormalized.includes(rawIngredient)) {
        allIngredientsNormalized.push(rawIngredient);
      }
    }
  }

  if (rawSlots.length === 0) {
    unresolvedIngredients.push(originalName.toLowerCase());
  }

  // Determine retained strength and formulation without mutating stored data
  const catalogDosages = Array.isArray(catalogDoc?.commonDosages) && catalogDoc.commonDosages.length > 0
    ? catalogDoc.commonDosages.join(', ')
    : '';
  const nameStrengths = extractStrengthTokens(brandLabel).join(' + ');
  const strength = extractedStrengths.join(' + ') || catalogDosages || nameStrengths || inputDosage || 'Unspecified';
  const formulation = extractFormulation(brandLabel) !== 'Unspecified'
    ? extractFormulation(brandLabel)
    : extractFormulation(originalName);

  return {
    valid: true,
    originalName,
    brand: brandLabel,
    genericName: catalogDoc?.genericName || genericSource,
    strength,
    formulation,
    catalogMatched: Boolean(catalogDoc),
    resolvedIngredients,
    unresolvedIngredients,
    allIngredientsNormalized
  };
}

/**
 * Finds the best matching catalog document for an input medication name,
 * preferring exact case-sensitive match first (to preserve the 24 collision pairs),
 * then exact case-insensitive match on name, brand, or genericName.
 */
function findCatalogMatch(inputName, dbDrugs = [], fallbackDrugs = []) {
  if (!inputName || typeof inputName !== 'string') return null;
  const trimmed = inputName.trim();
  const lower = trimmed.toLowerCase();

  const pools = [dbDrugs, catalogDrugs || [], fallbackDrugs];

  // Pass 1: Exact case-sensitive match on name or brand
  for (const pool of pools) {
    const exact = pool.find(d => d && (d.name === trimmed || d.brand === trimmed));
    if (exact) return exact;
  }

  // Pass 2: Case-insensitive match on name, brand, or genericName
  for (const pool of pools) {
    const ci = pool.find(d =>
      d && (
        (d.name && d.name.toLowerCase() === lower) ||
        (d.brand && d.brand.toLowerCase() === lower) ||
        (d.genericName && d.genericName.toLowerCase() === lower)
      )
    );
    if (ci) return ci;
  }

  return null;
}

/**
 * Deterministic medication interaction & ingredient-resolution analyzer.
 */
function analyzeMedicationSafety(drugInputs, dbDrugs = [], fallbackDrugs = []) {
  initReferenceIndex();

  if (!Array.isArray(drugInputs)) {
    return {
      hasInteraction: false,
      verificationIncomplete: true,
      statusMessage: 'Automated interaction checking is incomplete: medication list is missing or malformed.',
      referenceDisclaimer: NO_INTERACTION_MESSAGE,
      warnings: [],
      duplicateIngredients: [],
      unresolvedDrugs: [],
      unresolvedIngredients: ['<malformed_input>'],
      resolvedMedications: []
    };
  }

  const parsedMeds = drugInputs.map(item => {
    const lookupName = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? (item.name || item.drugName || '') : '');
    const catalogDoc = findCatalogMatch(lookupName, dbDrugs, fallbackDrugs);
    return parseMedicationEntry(item, catalogDoc);
  });

  const validMeds = parsedMeds.filter(m => m.valid);
  const malformedCount = parsedMeds.length - validMeds.length;

  const unresolvedDrugs = [];
  const unresolvedIngredientsSet = new Set();

  for (const med of parsedMeds) {
    if (!med.valid || med.unresolvedIngredients.length > 0) {
      med.unresolvedIngredients.forEach(u => unresolvedIngredientsSet.add(u));
      unresolvedDrugs.push({
        drug: med.originalName || '<malformed_input>',
        brand: med.brand || med.originalName || '<malformed_input>',
        strength: med.strength,
        formulation: med.formulation,
        unresolvedIngredients: med.unresolvedIngredients,
        message: `Automated interaction checking is incomplete for "${med.originalName || '<malformed_input>'}" (unresolved ingredient(s): ${med.unresolvedIngredients.join(', ')}).`
      });
    }
  }

  const warnings = [];
  const duplicateIngredients = [];

  // Pairwise analysis across all valid medications
  for (let i = 0; i < validMeds.length; i++) {
    for (let j = i + 1; j < validMeds.length; j++) {
      const medA = validMeds[i];
      const medB = validMeds[j];

      // 1. Check for duplicate active ingredients across the two prescribed medications
      const sharedIngredients = medA.allIngredientsNormalized.filter(ing =>
        medB.allIngredientsNormalized.includes(ing)
      );

      for (const shared of sharedIngredients) {
        const displayShared = canonicalDisplayMap.get(shared) || shared;
        const dupDesc = `Duplicate active ingredient (${displayShared}) present in both "${medA.originalName}" [${medA.strength}, ${medA.formulation}] and "${medB.originalName}" [${medB.strength}, ${medB.formulation}].`;
        const dupEntry = {
          type: 'duplicate_ingredient',
          drug1: medA.originalName,
          drug1Brand: medA.brand,
          drug1Strength: medA.strength,
          drug1Formulation: medA.formulation,
          drug2: medB.originalName,
          drug2Brand: medB.brand,
          drug2Strength: medB.strength,
          drug2Formulation: medB.formulation,
          interactingIngredients: [displayShared, displayShared],
          ingredient: displayShared,
          severity: 'high',
          description: dupDesc,
          message: dupDesc
        };
        duplicateIngredients.push(dupEntry);
        warnings.push(dupEntry);
      }

      // 2. Check all pairs of resolved active ingredients against interactions_clean.json
      const seenPairKeysForMedPair = new Set();
      for (const ingA of medA.resolvedIngredients) {
        for (const ingB of medB.resolvedIngredients) {
          if (ingA.canonical === ingB.canonical) continue;
          const pairKey = ingA.canonical < ingB.canonical
            ? `${ingA.canonical}||${ingB.canonical}`
            : `${ingB.canonical}||${ingA.canonical}`;
          if (seenPairKeysForMedPair.has(pairKey)) continue;
          seenPairKeysForMedPair.add(pairKey);

          const refHit = interactionPairMap.get(pairKey);
          if (refHit) {
            const formattedMsg = `${medA.originalName} [${medA.strength}, ${medA.formulation}] + ${medB.originalName} [${medB.strength}, ${medB.formulation}] (${refHit.drug1} + ${refHit.drug2}): ${refHit.description}`;
            warnings.push({
              type: 'drug_interaction',
              drug1: medA.originalName,
              drug1Brand: medA.brand,
              drug1Strength: medA.strength,
              drug1Formulation: medA.formulation,
              drug2: medB.originalName,
              drug2Brand: medB.brand,
              drug2Strength: medB.strength,
              drug2Formulation: medB.formulation,
              interactingIngredients: [refHit.drug1, refHit.drug2],
              severity: refHit.severity,
              description: refHit.description,
              message: formattedMsg
            });
          }
        }
      }
    }
  }

  const unresolvedIngredients = Array.from(unresolvedIngredientsSet);
  const insufficientMedications = validMeds.length < 2;
  const verificationIncomplete = unresolvedIngredients.length > 0 || malformedCount > 0 || insufficientMedications;

  let statusMessage = NO_INTERACTION_MESSAGE;
  if (warnings.length > 0 && verificationIncomplete) {
    statusMessage = `Interaction or duplicate-ingredient warnings detected. Automated interaction checking is also incomplete for unresolved ingredient(s): ${unresolvedIngredients.join(', ') || 'malformed/insufficient input'}.`;
  } else if (warnings.length > 0) {
    statusMessage = 'Interaction or duplicate-ingredient warnings found in the available reference dataset.';
  } else if (verificationIncomplete) {
    if (unresolvedIngredients.length > 0) {
      statusMessage = `Automated interaction checking is incomplete. Unresolved ingredient(s): ${unresolvedIngredients.join(', ')}. Do not assume this combination is safe.`;
    } else {
      statusMessage = 'Automated interaction checking is incomplete: at least two valid medications are required for pairwise interaction checking.';
    }
  }

  return {
    hasInteraction: warnings.length > 0,
    verificationIncomplete,
    statusMessage,
    referenceDisclaimer: NO_INTERACTION_MESSAGE,
    warnings,
    duplicateIngredients,
    unresolvedDrugs,
    unresolvedIngredients,
    resolvedMedications: parsedMeds.map(m => ({
      originalName: m.originalName,
      brand: m.brand,
      strength: m.strength,
      formulation: m.formulation,
      catalogMatched: Boolean(m.catalogMatched),
      resolvedIngredients: m.resolvedIngredients.map(r => r.canonical),
      unresolvedIngredients: m.unresolvedIngredients
    }))
  };
}

/**
 * Standard pharmacological allergy classes for cross-reactivity checks.
 */
const DRUG_ALLERGY_CLASSES = Object.freeze({
  penicillin: {
    label: 'Penicillins (Beta-Lactams)',
    members: [
      'penicillin', 'amoxicillin', 'ampicillin', 'flucloxacillin', 'cloxacillin',
      'piperacillin', 'augmentin', 'amoxycillin', 'co-amoxiclav', 'ticarcillin',
      'benzylpenicillin', 'phenoxymethylpenicillin'
    ]
  },
  cephalosporin: {
    label: 'Cephalosporins',
    members: [
      'cephalosporin', 'cephalexin', 'cefalexin', 'ceftriaxone', 'cefuroxime',
      'cefotaxime', 'cefixime', 'cefaclor', 'cefazolin', 'cefradine', 'cephradine'
    ]
  },
  sulfonamide: {
    label: 'Sulfonamides (Sulfa drugs)',
    members: [
      'sulfa', 'sulfonamide', 'sulfamethoxazole', 'sulphamethoxazole',
      'cotrimoxazole', 'bactrim', 'sulfasalazine', 'sulphasalazine', 'dapsone'
    ]
  },
  nsaid: {
    label: 'NSAIDs (Nonsteroidal Anti-inflammatory Drugs)',
    members: [
      'nsaid', 'aspirin', 'acetylsalicylic acid', 'ibuprofen', 'naproxen',
      'diclofenac', 'meloxicam', 'celecoxib', 'indomethacin', 'indometacin',
      'mefenamic acid', 'piroxicam', 'ketoprofen'
    ]
  },
  macrolide: {
    label: 'Macrolide Antibiotics',
    members: [
      'macrolide', 'erythromycin', 'azithromycin', 'clarithromycin', 'roxithromycin'
    ]
  },
  fluoroquinolone: {
    label: 'Fluoroquinolones',
    members: [
      'fluoroquinolone', 'quinolone', 'ciprofloxacin', 'levofloxacin',
      'moxifloxacin', 'norfloxacin', 'ofloxacin'
    ]
  },
  opioid: {
    label: 'Opioid Analgesics',
    members: [
      'opioid', 'opiate', 'morphine', 'codeine', 'tramadol', 'fentanyl',
      'oxycodone', 'pethidine', 'meperidine', 'buprenorphine', 'methadone'
    ]
  },
  statin: {
    label: 'Statins (HMG-CoA Reductase Inhibitors)',
    members: [
      'statin', 'atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'fluvastatin'
    ]
  }
});

/**
 * Checks for patient drug allergy conflicts including direct name matches,
 * active ingredient matches, and pharmacological class cross-reactivities.
 */
function checkAllergyConflict(drugName, patientAllergies = []) {
  if (!drugName || !Array.isArray(patientAllergies) || patientAllergies.length === 0) {
    return { hasConflict: false, conflicts: [] };
  }

  const cleanDrugName = String(drugName).trim().toLowerCase();
  const conflicts = [];

  const { resolvedIngredients, allIngredientsNormalized } = parseMedicationEntry(drugName);
  const drugTokens = new Set([
    cleanDrugName,
    ...allIngredientsNormalized.map(i => i.toLowerCase()),
    ...resolvedIngredients.map(r => r.canonical.toLowerCase())
  ]);

  for (const rawAllergy of patientAllergies) {
    if (!rawAllergy || typeof rawAllergy !== 'string') continue;
    const allergy = rawAllergy.trim().toLowerCase();

    // 1. Direct or substring match
    if (cleanDrugName.includes(allergy) || allergy.includes(cleanDrugName)) {
      conflicts.push({
        type: 'direct_match',
        allergen: rawAllergy,
        drug: drugName,
        severity: 'critical',
        message: `Direct allergy match: patient is documented allergic to "${rawAllergy}".`
      });
      continue;
    }

    // 2. Active ingredient match
    let matchedIng = null;
    for (const token of drugTokens) {
      if (token.includes(allergy) || allergy.includes(token)) {
        matchedIng = token;
        break;
      }
    }
    if (matchedIng) {
      conflicts.push({
        type: 'ingredient_match',
        allergen: rawAllergy,
        drug: drugName,
        matchedIngredient: matchedIng,
        severity: 'critical',
        message: `Active ingredient conflict: prescribed "${drugName}" contains "${matchedIng}", which matches patient allergy "${rawAllergy}".`
      });
      continue;
    }

    // 3. Class cross-reactivity match
    for (const [classKey, classDef] of Object.entries(DRUG_ALLERGY_CLASSES)) {
      const allergyMatchesClass = classDef.members.some(m => allergy.includes(m) || m.includes(allergy));
      if (!allergyMatchesClass) continue;

      const drugMatchesClass = classDef.members.some(m => {
        if (cleanDrugName.includes(m)) return true;
        for (const token of drugTokens) {
          if (token.includes(m)) return true;
        }
        return false;
      });

      if (drugMatchesClass) {
        conflicts.push({
          type: 'class_cross_reactivity',
          allergen: rawAllergy,
          drug: drugName,
          drugClass: classDef.label,
          severity: 'critical',
          message: `Class cross-reactivity warning: patient is allergic to "${rawAllergy}" (${classDef.label}), and prescribed "${drugName}" belongs to this medication class.`
        });
        break;
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts
  };
}

module.exports = {
  REVIEWED_SYNONYMS,
  DRUG_ALLERGY_CLASSES,
  NO_INTERACTION_MESSAGE,
  escapeRegex,
  parseSingleIngredientSlot,
  resolveSingleIngredient,
  parseMedicationEntry,
  findCatalogMatch,
  analyzeMedicationSafety,
  checkAllergyConflict
};
