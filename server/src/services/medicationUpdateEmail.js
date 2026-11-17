'use strict';
/**
 * Fix pack 2, B3: patient email after every dispense or "not available" action.
 *
 * Content: medicines released (name, quantity, Sri Lanka date and time), medicines still not released or
 * not available at this pharmacy, the pharmacy name and the pharmacist name (never an id), the consultation
 * reference, and "Items not available here can be collected at another pharmacy."
 * No dosage strengths, no diagnosis, no tracking, no links. Generic subject. Plain text and HTML, EN/SI/TA.
 *
 * PRIVACY FLAG: the earlier dispense email deliberately hid drug names. Names are listed only when
 * DISPENSE_EMAIL_MEDICINE_NAMES is not 'false' (default ON for this deployment). With the flag 'false' the
 * email lists "Medicine 1", "Medicine 2", ... instead.
 * Delivery goes through emailService.sendMail, so the kill switch, allowlist, daily cap and test capture apply.
 */
const TIME_ZONE = 'Asia/Colombo';
const ZONE = 'Sri Lanka time';

const T = {
  en: {
    subject: 'Your medication update',
    hello: n => `Hello ${n},`,
    intro: (ph, who) => `Update from ${ph} (pharmacist: ${who}).`,
    ref: r => `Consultation reference: ${r}`,
    released: 'Released',
    notReleased: 'Not yet released',
    none: 'None',
    notHere: 'not available at this pharmacy',
    pending: 'not yet released',
    qty: q => `quantity ${q}`,
    elsewhere: 'Items not available here can be collected at another pharmacy.',
    portal: 'You can see the full details in your MediSync patient portal.',
  },
  si: {
    subject: 'ඔබගේ ඖෂධ යාවත්කාලීන කිරීම',
    hello: n => `ආයුබෝවන් ${n},`,
    intro: (ph, who) => `${ph} වෙතින් යාවත්කාලීන කිරීමකි (ඖෂධවේදී: ${who}).`,
    ref: r => `උපදේශන යොමුව: ${r}`,
    released: 'නිකුත් කළ ඖෂධ',
    notReleased: 'තවම නිකුත් නොකළ ඖෂධ',
    none: 'නැත',
    notHere: 'මෙම ඔසුසලෙහි නොමැත',
    pending: 'තවම නිකුත් කර නැත',
    qty: q => `ප්‍රමාණය ${q}`,
    elsewhere: 'මෙහි නොමැති ඖෂධ වෙනත් ඔසුසලකින් ලබා ගත හැක.',
    portal: 'සම්පූර්ණ විස්තර ඔබගේ MediSync රෝගී ද්වාරයෙහි ඇත.',
  },
  ta: {
    subject: 'உங்கள் மருந்து புதுப்பிப்பு',
    hello: n => `வணக்கம் ${n},`,
    intro: (ph, who) => `${ph} இலிருந்து புதுப்பிப்பு (மருந்தாளர்: ${who}).`,
    ref: r => `ஆலோசனை குறிப்பு: ${r}`,
    released: 'வழங்கப்பட்டவை',
    notReleased: 'இன்னும் வழங்கப்படாதவை',
    none: 'இல்லை',
    notHere: 'இந்த மருந்தகத்தில் கிடைக்கவில்லை',
    pending: 'இன்னும் வழங்கப்படவில்லை',
    qty: q => `அளவு ${q}`,
    elsewhere: 'இங்கு கிடைக்காத மருந்துகளை வேறு மருந்தகத்தில் பெற்றுக்கொள்ளலாம்.',
    portal: 'முழு விவரங்களை உங்கள் MediSync நோயாளர் தளத்தில் காணலாம்.',
  },
};

const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = d => `${new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d))} (${ZONE})`;
const namesAllowed = () => process.env.DISPENSE_EMAIL_MEDICINE_NAMES !== 'false';

/**
 * released: [{ name, quantity, unit, at }], notReleased: [{ name, notAvailableHere }]
 */
function buildMedicationUpdateEmail({ lang = 'en', patientName, pharmacyName, pharmacistName, consultationRef, released = [], notReleased = [] }) {
  const t = T[lang] || T.en;
  const showNames = namesAllowed();
  let n = 0;
  const label = name => (showNames ? name : `Medicine ${++n}`);
  const rel = released.map(r => ({ text: `${label(r.name)}: ${t.qty(`${r.quantity}${r.unit ? ` ${r.unit}` : ''}`)}, ${when(r.at)}` }));
  const pend = notReleased.map(r => ({ text: `${label(r.name)}: ${r.notAvailableHere ? t.notHere : t.pending}` }));
  const ph = pharmacyName || 'MediSync pharmacy';
  const who = pharmacistName || 'pharmacist on duty';
  const lines = [
    t.hello(patientName || 'Patient'), '', t.intro(ph, who), t.ref(consultationRef || '-'), '',
    `${t.released}:`, ...(rel.length ? rel.map(r => `- ${r.text}`) : [`- ${t.none}`]), '',
    `${t.notReleased}:`, ...(pend.length ? pend.map(r => `- ${r.text}`) : [`- ${t.none}`]), '',
    t.elsewhere, t.portal,
  ];
  const li = list => (list.length ? list.map(r => `<li>${escapeHtml(r.text)}</li>`).join('') : `<li>${escapeHtml(t.none)}</li>`);
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;font-size:14px;line-height:1.5">
<p>${escapeHtml(t.hello(patientName || 'Patient'))}</p>
<p>${escapeHtml(t.intro(ph, who))}<br>${escapeHtml(t.ref(consultationRef || '-'))}</p>
<p style="margin-bottom:4px"><strong>${escapeHtml(t.released)}</strong></p><ul style="margin-top:0">${li(rel)}</ul>
<p style="margin-bottom:4px"><strong>${escapeHtml(t.notReleased)}</strong></p><ul style="margin-top:0">${li(pend)}</ul>
<p>${escapeHtml(t.elsewhere)}</p><p style="color:#4b5563">${escapeHtml(t.portal)}</p></div>`;
  return { subject: t.subject, text: lines.join('\n'), html };
}

/** Collects the consultation's medicines from stored records and sends one email to the patient on record. */
async function notifyMedicationUpdate({ prescriptionId, pharmacyId, pharmacistName, pharmacyName }, deps = {}) {
  const Prescription = deps.Prescription || require('../models/Prescription');
  const Dispensing = deps.Dispensing || require('../models/Dispensing');
  const send = deps.send || require('../utils/emailService').sendMail;
  const recipients = deps.recipients || require('./recipientLanguageService');
  const rx = await Prescription.findById(prescriptionId);
  if (!rx?.patientId) return { sent: false, reason: 'NO_PATIENT' };
  const siblings = rx.consultationRef
    ? await Prescription.find({ consultationRef: rx.consultationRef, patientId: rx.patientId, isOTC: { $ne: true }, status: { $ne: 'cancelled' } })
    : [rx];
  const receipts = await Dispensing.find({ prescriptionId: { $in: siblings.map(s => s._id) } }).lean();
  const released = [], notReleased = [];
  for (const s of siblings) {
    const name = s.drugName || s.medications?.[0]?.name || 'Medicine';
    if (['dispensed', 'partially_dispensed'].includes(s.status)) {
      const rec = receipts.filter(r => String(r.prescriptionId) === String(s._id)).sort((a, b) => new Date(b.dispensedAt) - new Date(a.dispensedAt))[0];
      const item = rec?.items?.[0];
      released.push({ name, quantity: item?.quantityDispensed ?? '-', unit: item?.unit && item.unit !== 'units' ? item.unit : '', at: rec?.dispensedAt || s.dispensedAt });
    } else {
      notReleased.push({ name, notAvailableHere: (s.unavailableAt || []).some(m => String(m.pharmacyId) === String(pharmacyId)) });
    }
  }
  const patientId = String(rx.patientId);
  let captured = null;
  await recipients.email({ model: 'Patient', accountId: patientId }, async ({ to, lang }) => {
    const Patient = deps.Patient || require('../models/Patient');
    const patient = await Patient.findById(patientId);
    patient?.decryptFieldsSync?.();
    const mail = buildMedicationUpdateEmail({ lang, patientName: patient?.fullName, pharmacyName, pharmacistName, consultationRef: rx.consultationRef, released, notReleased });
    captured = await send({ to, subject: mail.subject, text: mail.text, html: mail.html });
    return captured;
  });
  return { sent: Boolean(captured?.success), result: captured, released: released.length, notReleased: notReleased.length };
}

module.exports = { buildMedicationUpdateEmail, notifyMedicationUpdate, T };
