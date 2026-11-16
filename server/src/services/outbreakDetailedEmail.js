'use strict';
/**
 * server/src/services/outbreakDetailedEmail.js
 *
 * Detailed disease notification email for an approved outbreak alert (HTML + plain text, EN/SI/TA).
 * - Every number is passed in by the caller, computed by alertProjection72h.js from verified consultations.
 * - Disease facts come only from server/src/content/diseaseFactSheets.json, each with its public source.
 * - No patient data: the builder never reads names, identity numbers or addresses.
 * - All dynamic values are HTML-escaped; no images, no tracking, no secrets in links.
 *
 * NEEDS NATIVE-SPEAKER REVIEW: every Sinhala (si) and Tamil (ta) string in LABELS below was written without
 * a native-speaker check. Disease facts stay in English in SI/TA emails (see FACTS_IN_ENGLISH_NOTE).
 */
const FACTS = require('../content/diseaseFactSheets.json');

const SYNTHETIC_BANNER = 'SYNTHETIC DEMONSTRATION ALERT. Not an active public health notice.';

// NEEDS NATIVE-SPEAKER REVIEW (si, ta).
const LABELS = {
  en: {
    alertFor: (sev, dis, dist) => `${sev}: ${dis} alert for ${dist}`,
    banner: SYNTHETIC_BANNER,
    summary: 'Alert summary', disease: 'Disease', icd: 'ICD-10 code', district: 'District', severity: 'Severity',
    alertDate: 'Alert date', status: 'Status', approvedBy: 'Approved by', approvedAt: 'Approved at', notApproved: 'Not yet approved',
    numbers: 'Numbers (computed from records)', actual: 'Cases in the actual last 72 hours', previous: 'Cases in the previous 72 hours',
    change: 'Change', projected: 'Projected next 72 hours', range: 'range', noHistory: 'not enough history for a range',
    caveat: 'projection, not a forecast', island: 'Island-wide cases (same disease, last 72 hours)', share: 'Share of district population',
    per100k: 'Rate per 100,000 (district)', daily: 'Daily counts, last 7 complete days', dataNote: 'Data note',
    facts: 'About this disease', whatItIs: 'What it is', howItSpreads: 'How it spreads', symptoms: 'Common symptoms',
    dangerSigns: 'Danger signs and when to seek urgent care', prevention: 'Prevention and what the public can do',
    clinicianNote: 'Note for clinicians (testing and care)', sources: 'Sources',
    meaning: 'What this alert means and does not mean',
    meaningLines: [
      'It is a statistical signal from counts of verified consultations recorded in MediSync.',
      'It needs review by a person before any action is taken.',
      'It is not a medical finding about any individual and it is not a confirmed outbreak.',
      'No patient data is included in this message.',
    ],
    links: 'Links', publicMap: 'Public district map', adminPage: 'Admin alert page', authority: 'Health authority',
    optOut: 'To update your notification preferences or opt out, visit Account Preferences',
    generalInfo: 'General public-health information only, not individual medical advice.',
    accessed: 'accessed', factsNote: '',
  },
  si: {
    alertFor: (sev, dis, dist) => `${sev}: ${dist} සඳහා ${dis} අනතුරු ඇඟවීම`,
    banner: `කෘත්‍රිම නිරූපණ අනතුරු ඇඟවීමකි. සක්‍රීය මහජන සෞඛ්‍ය නිවේදනයක් නොවේ. (${SYNTHETIC_BANNER})`,
    summary: 'අනතුරු ඇඟවීමේ සාරාංශය', disease: 'රෝගය', icd: 'ICD-10 කේතය', district: 'දිස්ත්‍රික්කය', severity: 'බරපතලකම',
    alertDate: 'අනතුරු ඇඟවීමේ දිනය', status: 'තත්ත්වය', approvedBy: 'අනුමත කළේ', approvedAt: 'අනුමත කළ වේලාව', notApproved: 'තවම අනුමත කර නැත',
    numbers: 'සංඛ්‍යා (වාර්තා වලින් ගණනය කළ)', actual: 'පසුගිය පැය 72 තුළ සත්‍ය රෝගීන්', previous: 'ඊට පෙර පැය 72 තුළ රෝගීන්',
    change: 'වෙනස', projected: 'ඊළඟ පැය 72 සඳහා ප්‍රක්ෂේපණය', range: 'පරාසය', noHistory: 'පරාසයක් සඳහා ප්‍රමාණවත් ඉතිහාසයක් නැත',
    caveat: 'ප්‍රක්ෂේපණයකි, පුරෝකථනයක් නොවේ', island: 'දිවයින පුරා රෝගීන් (එකම රෝගය, පසුගිය පැය 72)', share: 'දිස්ත්‍රික් ජනගහනයේ ප්‍රතිශතය',
    per100k: '100,000කට අනුපාතය (දිස්ත්‍රික්කය)', daily: 'දෛනික ගණන්, අවසන් සම්පූර්ණ දින 7', dataNote: 'දත්ත සටහන',
    facts: 'මෙම රෝගය ගැන', whatItIs: 'එය කුමක්ද', howItSpreads: 'පැතිරෙන ආකාරය', symptoms: 'පොදු රෝග ලක්ෂණ',
    dangerSigns: 'අනතුරු සලකුණු සහ හදිසි ප්‍රතිකාර ලබා ගත යුතු අවස්ථා', prevention: 'වැළැක්වීම සහ මහජනතාවට කළ හැකි දේ',
    clinicianNote: 'වෛද්‍යවරුන් සඳහා සටහන (පරීක්ෂණ සහ සත්කාර)', sources: 'මූලාශ්‍ර',
    meaning: 'මෙම අනතුරු ඇඟවීමේ අර්ථය සහ එය නොවන දේ',
    meaningLines: [
      'මෙය MediSync හි සටහන් වූ තහවුරු කළ උපදේශන ගණන් මත පදනම් වූ සංඛ්‍යානමය සංඥාවකි.',
      'ක්‍රියාමාර්ගයකට පෙර පුද්ගලයෙකු විසින් සමාලෝචනය කළ යුතුය.',
      'මෙය කිසිදු පුද්ගලයෙකු පිළිබඳ වෛද්‍ය නිගමනයක් හෝ තහවුරු කළ වසංගතයක් නොවේ.',
      'මෙම පණිවිඩයේ රෝගී දත්ත කිසිවක් ඇතුළත් නොවේ.',
    ],
    links: 'සබැඳි', publicMap: 'මහජන දිස්ත්‍රික් සිතියම', adminPage: 'පරිපාලක අනතුරු ඇඟවීම් පිටුව', authority: 'සෞඛ්‍ය අධිකාරිය',
    optOut: 'දැනුම්දීම් මනාපයන් වෙනස් කිරීමට හෝ ඉවත් වීමට ගිණුම් මනාපයන් වෙත යන්න',
    generalInfo: 'සාමාන්‍ය මහජන සෞඛ්‍ය තොරතුරු පමණි, පුද්ගලික වෛද්‍ය උපදෙස් නොවේ.',
    accessed: 'ප්‍රවේශ වූ දිනය', factsNote: 'රෝග පිළිබඳ කරුණු සමාලෝචිත පරිවර්තනයක් ලැබෙන තුරු මූලාශ්‍රයේ ඇති පරිදි ඉංග්‍රීසියෙන් දක්වා ඇත.',
  },
  ta: {
    alertFor: (sev, dis, dist) => `${sev}: ${dist} மாவட்டத்திற்கான ${dis} எச்சரிக்கை`,
    banner: `செயற்கை செயல்விளக்க எச்சரிக்கை. இது செயலில் உள்ள பொது சுகாதார அறிவிப்பு அல்ல. (${SYNTHETIC_BANNER})`,
    summary: 'எச்சரிக்கை சுருக்கம்', disease: 'நோய்', icd: 'ICD-10 குறியீடு', district: 'மாவட்டம்', severity: 'தீவிரம்',
    alertDate: 'எச்சரிக்கை தேதி', status: 'நிலை', approvedBy: 'அங்கீகரித்தவர்', approvedAt: 'அங்கீகரித்த நேரம்', notApproved: 'இன்னும் அங்கீகரிக்கப்படவில்லை',
    numbers: 'எண்ணிக்கைகள் (பதிவுகளிலிருந்து கணக்கிடப்பட்டவை)', actual: 'கடந்த 72 மணிநேர உண்மையான நோயாளிகள்', previous: 'அதற்கு முந்தைய 72 மணிநேர நோயாளிகள்',
    change: 'மாற்றம்', projected: 'அடுத்த 72 மணிநேர கணிப்பு', range: 'வரம்பு', noHistory: 'வரம்பிற்கு போதுமான வரலாறு இல்லை',
    caveat: 'கணிப்பு மட்டுமே, முன்னறிவிப்பு அல்ல', island: 'நாடு முழுவதும் நோயாளிகள் (அதே நோய், கடந்த 72 மணிநேரம்)', share: 'மாவட்ட மக்கள்தொகையின் பங்கு',
    per100k: '100,000 பேருக்கு விகிதம் (மாவட்டம்)', daily: 'தினசரி எண்ணிக்கை, கடைசி 7 முழு நாட்கள்', dataNote: 'தரவு குறிப்பு',
    facts: 'இந்த நோய் பற்றி', whatItIs: 'இது என்ன', howItSpreads: 'பரவும் முறை', symptoms: 'பொதுவான அறிகுறிகள்',
    dangerSigns: 'அபாய அறிகுறிகள் மற்றும் அவசர சிகிச்சை பெற வேண்டிய நேரம்', prevention: 'தடுப்பு மற்றும் பொதுமக்கள் செய்யக்கூடியவை',
    clinicianNote: 'மருத்துவர்களுக்கான குறிப்பு (பரிசோதனை மற்றும் சிகிச்சை)', sources: 'மூலங்கள்',
    meaning: 'இந்த எச்சரிக்கை என்ன என்பதும் என்ன அல்ல என்பதும்',
    meaningLines: [
      'இது MediSync இல் பதிவான உறுதிப்படுத்தப்பட்ட ஆலோசனை எண்ணிக்கைகளின் புள்ளியியல் சமிக்ஞை.',
      'எந்த நடவடிக்கைக்கும் முன் ஒருவர் இதை மதிப்பாய்வு செய்ய வேண்டும்.',
      'இது எந்த நபரைப் பற்றிய மருத்துவ முடிவும் அல்ல, உறுதிப்படுத்தப்பட்ட நோய்ப் பரவலும் அல்ல.',
      'இந்தச் செய்தியில் நோயாளி தரவு எதுவும் இல்லை.',
    ],
    links: 'இணைப்புகள்', publicMap: 'பொது மாவட்ட வரைபடம்', adminPage: 'நிர்வாக எச்சரிக்கை பக்கம்', authority: 'சுகாதார அதிகாரம்',
    optOut: 'அறிவிப்பு விருப்பங்களை மாற்ற அல்லது விலக, கணக்கு விருப்பங்களுக்குச் செல்லவும்',
    generalInfo: 'பொது சுகாதார தகவல் மட்டுமே, தனிப்பட்ட மருத்துவ ஆலோசனை அல்ல.',
    accessed: 'அணுகிய தேதி', factsNote: 'நோய் பற்றிய தகவல்கள் மதிப்பாய்வு செய்யப்பட்ட மொழிபெயர்ப்பு கிடைக்கும் வரை மூலத்தில் உள்ளபடி ஆங்கிலத்தில் உள்ளன.',
  },
};
const SECTIONS = ['whatItIs', 'howItSpreads', 'symptoms', 'dangerSigns', 'prevention', 'clinicianNote'];

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const safeUrl = u => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : null);

function icdFromAlert(disease) {
  const raw = String(disease || '').replace(/^ICD1[01]:/i, '').toUpperCase();
  return raw.length > 3 && !raw.includes('.') ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

function factSheetFor(disease) {
  const code = String(disease || '').replace(/^ICD1[01]:/i, '').replace('.', '').toUpperCase();
  const sheet = FACTS.sheets[code] || FACTS.sheets[code.slice(0, 3)] || null;
  return { sheet: sheet || FACTS.sheets.generic, generic: !sheet };
}

function displayName(alert, fact) {
  if (!fact.generic && fact.sheet.name) return fact.sheet.name;
  try { return require('./publicHealthStats').diseaseLabel(alert.disease) || alert.disease; } catch (_) { return alert.disease; }
}

const fmtDate = d => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (Asia/Colombo)' : null);
const fmtPct = p => (p === 'new' ? 'new' : `${p > 0 ? '+' : ''}${p}%`);

/**
 * @param alert   OutbreakAlert (disease, location/district, severity, status, createdAt, approvedAt, syntheticSeedBatch ...)
 * @param numbers { previous72h, actual72h, change, percentChange, projected, low, high, enoughHistory, islandActual72h,
 *                  sharePct, per100k, dailyCounts7d, dataNote }  (all computed from records by the caller)
 * @param options { language, isSynthetic, isTest, approverRole, frontendUrl }
 */
function buildDetailedOutbreakEmail(alert = {}, numbers = {}, options = {}) {
  const language = LABELS[options.language] ? options.language : 'en';
  const L = LABELS[language];
  const fact = factSheetFor(alert.disease);
  const name = displayName(alert, fact);
  const district = alert.location || alert.district || 'National';
  const severity = String(alert.severity || 'Moderate');
  const icd = icdFromAlert(alert.disease);
  const frontend = safeUrl(options.frontendUrl || process.env.FRONTEND_URL) || 'https://medisync.chamodtharusha.com.lk';
  const links = { publicMap: `${frontend}/public-health`, adminPage: `${frontend}/admin/dashboard/outbreak`, settings: `${frontend}/settings` };
  const isSynthetic = Boolean(options.isSynthetic);
  // [TEST] for the administrator test email; [DEMONSTRATION] for synthetic alerts (existing subject convention).
  const subject = `${options.isTest ? '[TEST] ' : isSynthetic ? '[DEMONSTRATION] ' : ''}[MediSync] ${L.alertFor(severity, name, district)}`;
  const n = { available: numbers && Number.isFinite(numbers.actual72h), ...numbers };
  const range = n.available && n.enoughHistory ? `${L.range} ${n.low}–${n.high}` : L.noHistory;

  const summaryRows = [
    [L.disease, name], [L.icd, icd], [L.district, district], [L.severity, severity],
    [L.alertDate, fmtDate(alert.createdAt) || 'n/a'], [L.status, alert.status || 'n/a'],
    [L.approvedBy, alert.approvedAt ? (options.approverRole || 'Administrator') : L.notApproved],
    [L.approvedAt, fmtDate(alert.approvedAt) || L.notApproved],
  ];
  const na = 'not available';
  const numberRows = !n.available ? [[L.numbers, na]] : [
    [L.actual, String(n.actual72h)], [L.previous, String(n.previous72h)],
    [L.change, `${n.change >= 0 ? '+' : ''}${n.change} (${fmtPct(n.percentChange)})`],
    [L.projected, `${n.projected} (${range}; ${L.caveat})`],
    [L.island, String(n.islandActual72h)],
    [L.share, n.sharePct === null || n.sharePct === undefined ? 'n/a' : `${n.sharePct}%`],
    [L.per100k, n.per100k === null || n.per100k === undefined ? 'n/a' : String(n.per100k)],
    [L.daily, (n.dailyCounts7d || []).join(', ')],
    [L.dataNote, n.dataNote || 'verified MediSync consultations only (lower bound)'],
  ];
  const factSections = SECTIONS.map(key => ({ key, title: L[key], items: fact.sheet[key] || [] })).filter(s => s.items.length);
  const sourceIds = [...new Set([...(fact.sheet.links || []), ...factSections.flatMap(s => s.items.flatMap(i => i.sources))])];
  const sources = sourceIds.map(id => ({ id, ...FACTS.sources[id] })).filter(s => safeUrl(s.url));
  const contact = FACTS.authorityContact;

  // ---- plain text
  const t = [];
  if (isSynthetic) t.push('='.repeat(64), L.banner, '='.repeat(64), '');
  t.push(subject, '', `${L.summary}:`, ...summaryRows.map(([k, v]) => `- ${k}: ${v}`), '', `${L.numbers}:`, ...numberRows.map(([k, v]) => `- ${k}: ${v}`), '');
  t.push(`${L.facts}: ${name}`);
  if (L.factsNote) t.push(L.factsNote);
  for (const s of factSections) t.push(`${s.title}:`, ...s.items.map(i => `- ${i.text}`));
  t.push(`${L.sources}:`, ...sources.map(s => `- ${s.publisher}, ${s.title}: ${s.url} (${L.accessed} ${s.accessed})`), L.generalInfo, '');
  t.push(`${L.meaning}:`, ...L.meaningLines.map(l => `- ${l}`), '');
  t.push(`${L.links}:`, `- ${L.publicMap}: ${links.publicMap}`, `- ${L.adminPage}: ${links.adminPage}`, `- ${L.authority}: ${contact.label}, ${contact.url}`, '', `${L.optOut}: ${links.settings}`);
  const text = t.join('\n');

  // ---- HTML (inline styles, no images, everything escaped)
  const e = escapeHtml;
  const table = rows => `<table role="presentation" cellpadding="4" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px;">${rows.map(([k, v]) => `<tr><td style="color:#475569;padding-right:12px;vertical-align:top;">${e(k)}</td><td style="color:#0f172a;font-weight:bold;">${e(v)}</td></tr>`).join('')}</table>`;
  const h2 = s => `<h2 style="font-size:16px;color:#0f172a;margin:20px 0 8px;">${e(s)}</h2>`;
  const a = (href, label) => `<a href="${e(href)}" style="color:#1d4ed8;">${e(label)}</a>`;
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:24px;">',
    isSynthetic ? `<div data-demo-banner="true" style="padding:12px;margin-bottom:16px;background:#FFEBEE;border:2px solid #D32F2F;color:#B71C1C;font-weight:bold;">${e(L.banner)}</div>` : '',
    `<h1 style="font-size:20px;color:#0f172a;margin:0 0 12px;">${e(subject)}</h1>`,
    h2(L.summary), table(summaryRows),
    h2(L.numbers), table(numberRows),
    h2(`${L.facts}: ${name}`),
    L.factsNote ? `<p style="font-size:12px;color:#64748b;">${e(L.factsNote)}</p>` : '',
    ...factSections.map(s => `<h3 style="font-size:14px;color:#334155;margin:12px 0 4px;">${e(s.title)}</h3><ul style="margin:0;padding-left:20px;font-size:14px;color:#1e293b;">${s.items.map(i => `<li>${e(i.text)}</li>`).join('')}</ul>`),
    `<h3 style="font-size:14px;color:#334155;margin:12px 0 4px;">${e(L.sources)}</h3><ul style="margin:0;padding-left:20px;font-size:13px;">${sources.map(s => `<li>${e(s.publisher)}, ${a(s.url, s.title)} (${e(L.accessed)} ${e(s.accessed)})</li>`).join('')}</ul>`,
    `<p style="font-size:12px;color:#64748b;">${e(L.generalInfo)}</p>`,
    h2(L.meaning), `<ul style="margin:0;padding-left:20px;font-size:14px;color:#1e293b;">${L.meaningLines.map(l => `<li>${e(l)}</li>`).join('')}</ul>`,
    h2(L.links), `<ul style="margin:0;padding-left:20px;font-size:14px;"><li>${a(links.publicMap, L.publicMap)}</li><li>${a(links.adminPage, L.adminPage)}</li><li>${e(L.authority)}: ${a(contact.url, contact.label)}</li></ul>`,
    `<p style="font-size:12px;color:#64748b;margin-top:20px;">${e(L.optOut)}: ${a(links.settings, links.settings)}</p>`,
    '</div></body></html>',
  ].join('');
  return { subject, html, text, language };
}

module.exports = { buildDetailedOutbreakEmail, factSheetFor, escapeHtml, LABELS, SYNTHETIC_BANNER, SECTIONS };
