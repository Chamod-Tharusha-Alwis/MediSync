const who = require('../src/services/whoIcd11Service');
const { icd10 } = require('../src/utils/loadDatasets');

async function testAllCategories() {
  const categories = [
    { domain: 'Infectious', q: 'dengue' },
    { domain: 'Respiratory', q: 'asthma' },
    { domain: 'Cardiovascular', q: 'hypertension' },
    { domain: 'Endocrine', q: 'diabetes' },
    { domain: 'Neurological', q: 'migraine' },
    { domain: 'Rare Genetic', q: 'thalassaemia' },
    { domain: 'Mental Health', q: 'depressive' },
    { domain: 'Autoimmune', q: 'rheumatoid' },
    { domain: 'Kidney', q: 'kidney' },
    { domain: 'Cancer / Oncology', q: 'neoplasm' },
    { domain: 'Gastrointestinal', q: 'ulcer' },
    { domain: 'Tropical', q: 'cholera' },
    { domain: 'Musculoskeletal', q: 'osteoarthritis' },
    { domain: 'Skin / Dermatology', q: 'varicella' },
    { domain: 'Obstetric / Perinatal', q: 'pregnancy' }
  ];

  console.log('=== Stage 3 Coverage Verification Across 15 Clinical Domains ===');
  for (const cat of categories) {
    const icd10Hits = icd10.filter(i => i.description.toLowerCase().includes(cat.q) || i.code.toLowerCase().includes(cat.q)).slice(0, 2);
    const icd11Hits = await who.searchIcd11(cat.q, 2);
    console.log(`\n[Domain: ${cat.domain}] Query: "${cat.q}"`);
    console.log(`  ICD-10 hits: ${icd10Hits.length > 0 ? icd10Hits.map(h => h.code + ' ' + h.description.slice(0, 35)).join(' | ') : 'None'}`);
    console.log(`  ICD-11 hits: ${icd11Hits.length > 0 ? icd11Hits.map(h => h.code + ' ' + h.description.slice(0, 35)).join(' | ') : 'None'}`);
  }
}
testAllCategories().then(() => console.log('\nVerification complete.'));
