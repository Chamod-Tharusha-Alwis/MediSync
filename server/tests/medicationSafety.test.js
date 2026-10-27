const fs = require('fs');
const path = require('path');
const {
  NO_INTERACTION_MESSAGE,
  analyzeMedicationSafety
} = require('../src/utils/ingredientResolver');
const { COMMON_DRUGS } = require('../src/controllers/drugController');

describe('Phase 3.5 — Deterministic Medication Interaction & Ingredient Safety Suite', () => {
  test('1. Brand-to-generic matching resolves branded catalog drug and retains strength & formulation', () => {
    const res = analyzeMedicationSafety(["ALMOX DT 250 Tablet 15's", 'Warfarin'], [], COMMON_DRUGS);
    expect(res.hasInteraction).toBe(true);
    expect(res.verificationIncomplete).toBe(false);
    expect(res.unresolvedIngredients).toEqual([]);
    expect(res.warnings.length).toBeGreaterThanOrEqual(1);

    const w = res.warnings.find(item => item.type === 'drug_interaction');
    expect(w).toBeDefined();
    expect(w.drug1).toBe("ALMOX DT 250 Tablet 15's");
    expect(w.drug1Strength).toBe('250 mg');
    expect(w.drug1Formulation).toBe('Dispersible Tablet');
    expect(w.drug2).toBe('Warfarin');
    expect(w.interactingIngredients.map(s => s.toLowerCase()).sort()).toEqual(['amoxicillin', 'warfarin']);
    expect(w.message).toContain("ALMOX DT 250 Tablet 15's [250 mg, Dispersible Tablet]");
  });

  test('2. Generic-to-generic matching detects interaction directly', () => {
    const res = analyzeMedicationSafety(['Amoxicillin', 'Warfarin'], [], COMMON_DRUGS);
    expect(res.hasInteraction).toBe(true);
    expect(res.verificationIncomplete).toBe(false);
    expect(res.warnings[0].interactingIngredients.map(s => s.toLowerCase()).sort()).toEqual(['amoxicillin', 'warfarin']);
  });

  test('3. Dosage-strength variations resolve to the same active ingredient while preserving distinct strengths', () => {
    const res250 = analyzeMedicationSafety(["ALMOX DT 250 Tablet 15's", 'Probenecid'], [], COMMON_DRUGS);
    const res500 = analyzeMedicationSafety(["Cipmox Capsule 15'S", 'Probenecid'], [], COMMON_DRUGS);

    expect(res250.hasInteraction).toBe(true);
    expect(res500.hasInteraction).toBe(true);
    expect(res250.warnings[0].drug1Strength).toBe('250 mg');
    expect(res500.warnings[0].drug1Strength).toBe('500 mg');
    expect(res250.warnings[0].drug1Formulation).toBe('Dispersible Tablet');
    expect(res500.warnings[0].drug1Formulation).toBe('Capsule');
  });

  test('4. Alternative ingredient spellings (BAN/BP <-> INN/USAN) resolve via reviewed synonyms', () => {
    const pairs = [
      ['Paracetamol', 'Warfarin', ['acetaminophen', 'warfarin']],
      ['Frusemide', 'Digoxin', ['digoxin', 'furosemide']],
      ['Lignocaine', 'Amiodarone', ['amiodarone', 'lidocaine']],
      ['Sulphamethoxazole', 'Phenytoin', ['phenytoin', 'sulfamethoxazole']],
      ['Adrenaline', 'Furosemide', ['epinephrine', 'furosemide']],
      ['Salbutamol', 'Furosemide', ['furosemide', 'salbutamol']]
    ];

    for (const [drugA, drugB, expectedIngs] of pairs) {
      const res = analyzeMedicationSafety([drugA, drugB], [], COMMON_DRUGS);
      expect(res.hasInteraction).toBe(true);
      expect(res.verificationIncomplete).toBe(false);
      expect(res.warnings[0].interactingIngredients.map(s => s.toLowerCase()).sort()).toEqual(expectedIngs);
    }
  });

  test('5. Multi-ingredient medicines check all constituent active-ingredient pairs', () => {
    // CLAVAM Tablet 10's = Amoxycillin 875 mg + Clavulanic Acid 125 mg
    const clavamRes = analyzeMedicationSafety(["CLAVAM Tablet 10's", 'Methotrexate'], [], COMMON_DRUGS);
    expect(clavamRes.hasInteraction).toBe(true);
    expect(clavamRes.verificationIncomplete).toBe(false);
    expect(clavamRes.warnings[0].drug1Strength).toBe('875 mg + 125 mg');
    expect(clavamRes.warnings[0].interactingIngredients.map(s => s.toLowerCase()).sort()).toEqual(['amoxicillin', 'methotrexate']);

    // Cotrimoxazole = Sulfamethoxazole + Trimethoprim; both interact with Warfarin
    const cotrimRes = analyzeMedicationSafety(['Cotrimoxazole', 'Warfarin'], [], COMMON_DRUGS);
    expect(cotrimRes.hasInteraction).toBe(true);
    expect(cotrimRes.verificationIncomplete).toBe(false);
    expect(cotrimRes.warnings.length).toBe(2);
  });

  test('6. Different salt, ester, or release formulations are NOT indiscriminately stripped', () => {
    // Betamethasone Dipropionate is a distinct ester not present in interactions_clean.json
    const betaRes = analyzeMedicationSafety(
      ['Betamethasone Dipropionate Ointment', 'Warfarin'],
      [],
      COMMON_DRUGS
    );
    expect(betaRes.verificationIncomplete).toBe(true);
    expect(betaRes.unresolvedIngredients).toContain('betamethasone dipropionate');

    // Diclofenac Potassium is a distinct salt not present in interactions_clean.json
    const dicloSaltRes = analyzeMedicationSafety(
      ['Diclofenac Potassium 50 mg Tablet', 'Warfarin'],
      [],
      COMMON_DRUGS
    );
    expect(dicloSaltRes.verificationIncomplete).toBe(true);
    expect(dicloSaltRes.unresolvedIngredients).toContain('diclofenac potassium');

    // COBASWIFT NS Nasal Spray has "Methylcobalamin (Vitamin B12) 250 mcg Also Known As: Mecobalamin, Cyanocobalamin, Vitamin B12"
    // Must NOT silently map Methylcobalamin to Cyanocobalamin
    const b12Res = analyzeMedicationSafety(
      ['COBASWIFT NS Nasal Spray', 'Chloramphenicol'],
      [],
      COMMON_DRUGS
    );
    expect(b12Res.verificationIncomplete).toBe(true);
    expect(b12Res.unresolvedIngredients).toContain('methylcobalamin (vitamin b12)');
  });

  test('7. Substring false-positive cases do NOT trigger bogus interactions', () => {
    // Cholic Acid interacts with Cyclosporine in reference data, but Ursodeoxycholic Acid and Deoxycholic Acid do NOT
    const cholicRes = analyzeMedicationSafety(['Cholic Acid', 'Cyclosporine'], [], COMMON_DRUGS);
    expect(cholicRes.hasInteraction).toBe(true);

    const ursoRes = analyzeMedicationSafety(['Ursodeoxycholic Acid', 'Cyclosporine'], [], COMMON_DRUGS);
    expect(ursoRes.hasInteraction).toBe(false);
    expect(ursoRes.verificationIncomplete).toBe(false);

    const deoxyRes = analyzeMedicationSafety(['Deoxycholic Acid', 'Cyclosporine'], [], COMMON_DRUGS);
    expect(deoxyRes.hasInteraction).toBe(false);
    expect(deoxyRes.verificationIncomplete).toBe(false);

    // Salbutamol and Levosalbutamol are distinct canonical ingredients and must not substring-collide
    const salbLevoRes = analyzeMedicationSafety(['Salbutamol', 'Levosalbutamol'], [], COMMON_DRUGS);
    expect(salbLevoRes.hasInteraction).toBe(false);
    expect(salbLevoRes.duplicateIngredients).toEqual([]);
    expect(salbLevoRes.verificationIncomplete).toBe(false);

    // Dexchlorpheniramine contains "chlorpheniramine" as a substring, is absent from reference data,
    // and must NOT substring-match Chlorpheniramine
    const dexChlorRes = analyzeMedicationSafety(['Dexchlorpheniramine 2 mg Tablet', 'Phenytoin'], [], COMMON_DRUGS);
    expect(dexChlorRes.hasInteraction).toBe(false);
    expect(dexChlorRes.verificationIncomplete).toBe(true);
    expect(dexChlorRes.unresolvedIngredients).toContain('dexchlorpheniramine');
  });

  test('8. Known interaction pairs report accurate reference severity and descriptions', () => {
    const pairs = [
      ['Metronidazole', 'Warfarin'],
      ['Clarithromycin', 'Simvastatin'],
      ['Ciprofloxacin', 'Digoxin'],
      ['Spironolactone', 'Digitoxin']
    ];
    for (const [d1, d2] of pairs) {
      const res = analyzeMedicationSafety([d1, d2], [], COMMON_DRUGS);
      expect(res.hasInteraction).toBe(true);
      expect(res.verificationIncomplete).toBe(false);
      expect(res.warnings.length).toBe(1);
      expect(res.warnings[0].description.length).toBeGreaterThan(10);
    }
  });

  test('9. Unmapped catalog medicines return verificationIncomplete: true and unresolvedIngredients', () => {
    // Cognistar Injection 1'S -> Cerebroprotein Hydrolysate 30 mg (absent from interactions_clean.json)
    const res = analyzeMedicationSafety(["Cognistar Injection 1'S", 'Warfarin'], [], COMMON_DRUGS);
    expect(res.hasInteraction).toBe(false);
    expect(res.verificationIncomplete).toBe(true);
    expect(res.unresolvedIngredients).toEqual(['cerebroprotein hydrolysate']);
    expect(res.unresolvedDrugs[0].drug).toBe("Cognistar Injection 1'S");
    expect(res.unresolvedDrugs[0].strength).toBe('30 mg');
    expect(res.unresolvedDrugs[0].formulation).toBe('Injection');
    expect(res.statusMessage).toContain('Automated interaction checking is incomplete');
  });

  test('10. Unknown free-text medicines return verificationIncomplete: true', () => {
    const res = analyzeMedicationSafety(['Experimental Herbal Tonic 250mg Syrup', 'Warfarin'], [], COMMON_DRUGS);
    expect(res.hasInteraction).toBe(false);
    expect(res.verificationIncomplete).toBe(true);
    expect(res.unresolvedIngredients).toEqual(['experimental herbal tonic']);
    expect(res.statusMessage).toContain('Automated interaction checking is incomplete');
  });

  test('11. Incomplete or malformed inputs return verificationIncomplete: true', () => {
    const emptyRes = analyzeMedicationSafety([], [], COMMON_DRUGS);
    expect(emptyRes.verificationIncomplete).toBe(true);

    const singleRes = analyzeMedicationSafety(['Warfarin'], [], COMMON_DRUGS);
    expect(singleRes.verificationIncomplete).toBe(true);
    expect(singleRes.statusMessage).toContain('at least two valid medications');

    const malformedRes = analyzeMedicationSafety(['Warfarin', '   ', '12345'], [], COMMON_DRUGS);
    expect(malformedRes.verificationIncomplete).toBe(true);
    expect(malformedRes.unresolvedIngredients).toContain('<malformed_or_empty_input>');
  });

  test('12. Duplicate active ingredients across prescriptions are flagged with high severity', () => {
    // ALMOX DT 250 Tablet 15's (Amoxycillin 250 mg) + CLAVAM Tablet 10's (Amoxycillin 875 mg + Clavulanic Acid 125 mg)
    const res = analyzeMedicationSafety(
      ["ALMOX DT 250 Tablet 15's", "CLAVAM Tablet 10's"],
      [],
      COMMON_DRUGS
    );
    expect(res.hasInteraction).toBe(true);
    expect(res.duplicateIngredients.length).toBe(1);
    expect(res.duplicateIngredients[0].type).toBe('duplicate_ingredient');
    expect(res.duplicateIngredients[0].severity).toBe('high');
    expect(res.duplicateIngredients[0].ingredient.toLowerCase()).toBe('amoxicillin');
    expect(res.duplicateIngredients[0].message).toContain('"ALMOX DT 250 Tablet 15\'s" [250 mg, Dispersible Tablet]');
    expect(res.duplicateIngredients[0].message).toContain('"CLAVAM Tablet 10\'s" [875 mg + 125 mg, Tablet]');
  });

  test('13. Neutral reference message and frontend display contract when no interaction is found', () => {
    const res = analyzeMedicationSafety(['Paracetamol', 'Amoxicillin'], [], COMMON_DRUGS);
    expect(res.hasInteraction).toBe(false);
    expect(res.verificationIncomplete).toBe(false);
    expect(res.statusMessage).toBe(NO_INTERACTION_MESSAGE);
    expect(res.statusMessage).toBe('No interaction found in the available reference dataset.');
    expect(res.statusMessage.toLowerCase()).not.toContain('safe');

    // Verify NewConsultation.jsx and DrugSearchInput.jsx source contract
    const newConsultationSrc = fs.readFileSync(
      path.join(__dirname, '../../client/src/pages/doctor/NewConsultation.jsx'),
      'utf-8'
    );
    expect(newConsultationSrc).toContain('No interaction found in the available reference dataset.');
    expect(newConsultationSrc).toContain('Automated Interaction Checking Incomplete');
    expect(newConsultationSrc).toContain('Medication Interaction / Duplicate Active Ingredient Alert');
  });
});
