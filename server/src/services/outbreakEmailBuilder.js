'use strict';

/**
 * server/src/services/outbreakEmailBuilder.js
 *
 * Constructs professional, responsive, inline-styled trilingual public health
 * outbreak alert emails with identical plain-text fallbacks.
 * Review status: Curated for viva demonstration; pending human clinical review.
 */

const { resolveDiseaseDetails, CLINICAL_REVIEW_STATUS } = require('./outbreakDiseaseLibrary');

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds subject, HTML body, and plain-text fallback for an outbreak advisory email.
 *
 * @param {Object} alert - OutbreakAlert document or object
 * @param {Object} options - Optional configuration { isDemo, isTest, approverRole, frontendUrl }
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildOutbreakAdvisoryEmail(alert = {}, options = {}) {
  const diseaseRaw = alert.disease || 'Communicable Disease';
  const district = alert.location || alert.district || 'National';
  const severity = (alert.severity || 'High').toUpperCase();
  const frontendUrl = options.frontendUrl || process.env.FRONTEND_URL || 'https://medisync.chamodtharusha.com.lk';
  const approverRole = options.approverRole || alert.approvedByRole || 'Ministry of Health Authorized Epidemiologist';

  const isDemo = options.isDemo !== undefined
    ? Boolean(options.isDemo)
    : Boolean(alert.isSimulation || alert.isSynthetic || alert.isDemoData || alert.syntheticSeedBatch);
  const isTest = Boolean(options.isTest);

  const diseaseData = resolveDiseaseDetails(diseaseRaw);
  const canonicalName = diseaseData.canonicalName || diseaseRaw;

  // Derive metrics (falling back to alert fields)
  const m = alert.metrics72h || {};
  const currentCases = m.currentCases !== undefined ? m.currentCases : (alert.caseCount || alert.affectedCount || 0);
  const previousCases = m.previousCases !== undefined ? m.previousCases : 0;
  const netChange = m.absoluteChange !== undefined ? m.absoluteChange : (currentCases - previousCases);
  const percentChange = m.percentChange !== undefined
    ? (m.percentChange === 'new' ? 'new' : `${m.percentChange > 0 ? '+' : ''}${m.percentChange}%`)
    : (previousCases === 0 && currentCases > 0 ? 'new' : '0%');
  const formattedShare = m.formattedShare || 'N/A';
  const incidencePer100k = m.incidencePer100k !== undefined ? m.incidencePer100k : 'N/A';
  const islandCases = m.islandCases !== undefined ? m.islandCases : currentCases;

  // Subject line
  let subjectPrefix = '';
  if (isTest) {
    subjectPrefix = '[TEST] ';
  } else if (isDemo) {
    subjectPrefix = '[DEMONSTRATION] ';
  }
  const subject = `${subjectPrefix}MediSync Health Alert: ${canonicalName} in ${district} (${severity})`;

  // Severity coloring
  const isCritical = severity.includes('CRITICAL');
  const badgeBg = isCritical ? '#D32F2F' : '#F57C00';
  const badgeBorder = isCritical ? '#B71C1C' : '#E65100';

  // Demo Banner HTML & Text
  const demoBannerHtml = isDemo ? `
    <tr>
      <td data-demo-banner="true" style="padding: 16px 24px; background-color: #FFEBEE; border-top: 4px solid #D32F2F; border-bottom: 4px solid #D32F2F;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: #B71C1C; text-transform: uppercase; letter-spacing: 0.5px;">
              ⚠ DEMONSTRATION ALERT: Generated from synthetic test data. Not an active public health notice.
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  const demoBannerText = isDemo ? `
================================================================================
⚠ DEMONSTRATION ALERT: Generated from synthetic test data.
Not an active public health notice.
================================================================================
` : '';

  // Render language block helper for HTML
  const renderLangBlockHtml = (langCode, langTitle, content) => `
    <tr>
      <td style="padding: 24px; background-color: #ffffff; border-bottom: 1px solid #E0E0E0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <span style="display: inline-block; padding: 3px 8px; background-color: #F0F4F8; color: #2C3E50; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 4px; letter-spacing: 0.5px; margin-bottom: 12px;">
                ${escapeHtml(langTitle)}
              </span>
              <h3 style="margin: 8px 0 12px 0; font-family: Arial, sans-serif; font-size: 18px; color: #1E293B; line-height: 1.3;">
                ${escapeHtml(canonicalName)} — ${escapeHtml(district)}
              </h3>
              <p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
                ${escapeHtml(content.about)}
              </p>

              <h4 style="margin: 16px 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">
                ${langCode === 'en' ? 'Common Symptoms' : (langCode === 'si' ? 'පොදු රෝග ලක්ෂණ' : 'பொதுவான அறிகுறிகள்')}
              </h4>
              <ul style="margin: 0 0 16px 0; padding-left: 20px; font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
                ${content.symptoms.map(s => `<li style="margin-bottom: 6px;">${escapeHtml(s)}</li>`).join('')}
              </ul>

              <h4 style="margin: 16px 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">
                ${langCode === 'en' ? 'How It Spreads' : (langCode === 'si' ? 'රෝගය බෝවන ආකාරය' : 'பரவும் முறை')}
              </h4>
              <p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
                ${escapeHtml(content.transmission)}
              </p>

              <h4 style="margin: 16px 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">
                ${langCode === 'en' ? 'Protective Measures & Prevention' : (langCode === 'si' ? 'ආරක්ෂිත පියවර සහ වැළැක්වීම' : 'பாதுகாப்பு நடவடிக்கைகள்')}
              </h4>
              <ul style="margin: 0 0 16px 0; padding-left: 20px; font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
                ${content.prevention.map(p => `<li style="margin-bottom: 6px;">${escapeHtml(p)}</li>`).join('')}
              </ul>

              <h4 style="margin: 16px 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; color: #64748B; letter-spacing: 0.5px;">
                ${langCode === 'en' ? 'High-Risk Populations' : (langCode === 'si' ? 'වැඩි අවදානමක් සහිත පුද්ගලයින්' : 'அதிக ஆபத்துள்ளவர்கள்')}
              </h4>
              <p style="margin: 0 0 16px 0; font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
                ${escapeHtml(content.highRisk)}
              </p>

              <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 4px; margin-top: 16px;">
                <h5 style="margin: 0 0 6px 0; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; color: #991B1B; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${langCode === 'en' ? 'When to Seek Medical Care (Red Flag Symptoms)' : (langCode === 'si' ? 'වහාම රෝහල්ගත විය යුතු අනතුරුදායක ලක්ෂණ' : 'மருத்துவ உதவியை நாட வேண்டிய தருணங்கள்')}
                </h5>
                <p style="margin: 0; font-family: Arial, sans-serif; font-size: 13px; color: #7F1D1D; line-height: 1.5;">
                  ${escapeHtml(content.whenToSeekCare)}
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  // HTML Template
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #F1F5F9; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <!-- Main Container (max-width 600px) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #CBD5E1;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 24px; background-color: #0F172A; text-align: left;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #94A3B8; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 4px;">
                      MEDISYNC PUBLIC HEALTH OBSERVATORY
                    </span>
                    <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: 22px; font-weight: 800; color: #FFFFFF; line-height: 1.2;">
                      Epidemiological Health Alert
                    </h1>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; padding: 6px 14px; background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-radius: 4px;">
                      ${escapeHtml(severity)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${demoBannerHtml}

          <!-- Read-time 72h Metrics Card -->
          <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <span style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">
                      SURVEILLANCE WINDOW: LAST 72 HOURS
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style="background-color: #ffffff; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin-bottom: 8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="50%" valign="top" style="padding-right: 12px;">
                            <span style="font-family: Arial, sans-serif; font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: bold;">Verified Cases (72h)</span>
                            <div style="font-family: Arial, sans-serif; font-size: 26px; font-weight: 900; color: #0F172A; margin: 4px 0;">
                              ${currentCases}
                            </div>
                            <span style="font-family: Arial, sans-serif; font-size: 12px; color: #475569;">
                              Previous 72h: ${previousCases} (${netChange >= 0 ? '+' : ''}${netChange}, ${percentChange})
                            </span>
                          </td>
                          <td width="50%" valign="top" style="border-left: 1px solid #E2E8F0; padding-left: 16px;">
                            <span style="font-family: Arial, sans-serif; font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: bold;">District Impact</span>
                            <div style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #0F172A; margin: 6px 0 2px 0;">
                              ${formattedShare} of population
                            </div>
                            <span style="font-family: Arial, sans-serif; font-size: 12px; color: #475569;">
                              ${incidencePer100k} per 100,000 | Island: ${islandCases} cases
                            </span>
                          </td>
                        </tr>
                      </table>
                    </div>
                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 11px; color: #94A3B8; text-align: right;">
                      Population baseline: Department of Census and Statistics (DCS)
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Trilingual Advisory Sections -->
          ${renderLangBlockHtml('en', 'English Notice', diseaseData.en)}
          ${renderLangBlockHtml('si', 'සිංහල නිවේදනය', diseaseData.si)}
          ${renderLangBlockHtml('ta', 'தமிழ் அறிவித்தல்', diseaseData.ta)}

          <!-- Official Resources Section -->
          <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <h4 style="margin: 0 0 10px 0; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                      Official Health Authority Resources
                    </h4>
                    <p style="margin: 0 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; color: #1E293B;">
                      • <strong>Epidemiology Unit, Ministry of Health Sri Lanka:</strong><br/>
                      <a href="http://www.epid.gov.lk" style="color: #2563EB; text-decoration: underline;" target="_blank">www.epid.gov.lk</a>
                    </p>
                    <p style="margin: 0 0 8px 0; font-family: Arial, sans-serif; font-size: 13px; color: #1E293B;">
                      • <strong>Health Promotion Bureau Sri Lanka:</strong><br/>
                      <a href="https://hpb.health.gov.lk" style="color: #2563EB; text-decoration: underline;" target="_blank">hpb.health.gov.lk</a>
                    </p>
                    <p style="margin: 0 0 12px 0; font-family: Arial, sans-serif; font-size: 13px; color: #1E293B;">
                      • <strong>World Health Organization (WHO):</strong><br/>
                      <a href="https://www.who.int" style="color: #2563EB; text-decoration: underline;" target="_blank">www.who.int</a>
                    </p>
                    <div style="text-align: center; margin-top: 16px;">
                      <a href="${frontendUrl}/public-health" style="display: inline-block; padding: 10px 20px; background-color: #0F172A; color: #ffffff; font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px;">
                        View Live Public Health Dashboard →
                      </a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background-color: #0F172A; color: #94A3B8; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 10px 0; color: #CBD5E1;">
                This alert was generated by MediSync Automated Surveillance and verified by ${escapeHtml(approverRole)}. You received this because you are registered as a healthcare provider or patient in ${escapeHtml(district)}.
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; color: #94A3B8;">
                ${escapeHtml(CLINICAL_REVIEW_STATUS)}.
              </p>
              <p style="margin: 0; font-size: 11px; color: #64748B;">
                To update your notification preferences or opt out, visit <a href="${frontendUrl}/settings" style="color: #60A5FA; text-decoration: underline;">Account Preferences</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Render language block helper for Plain Text
  const renderLangBlockText = (langTitle, content) => `
--------------------------------------------------------------------------------
${langTitle.toUpperCase()}: ${canonicalName} in ${district}
--------------------------------------------------------------------------------
${content.about}

COMMON SYMPTOMS:
${content.symptoms.map(s => `  * ${s}`).join('\n')}

HOW IT SPREADS:
  ${content.transmission}

PROTECTIVE MEASURES & PREVENTION:
${content.prevention.map(p => `  * ${p}`).join('\n')}

HIGH-RISK POPULATIONS:
  ${content.highRisk}

WHEN TO SEEK MEDICAL CARE (RED FLAGS):
  ${content.whenToSeekCare}
`;

  // Plain Text Fallback
  const text = `
${demoBannerText}
MEDISYNC PUBLIC HEALTH OBSERVATORY
EPIDEMIOLOGICAL HEALTH ALERT: ${severity}
Disease: ${canonicalName}
District/Region: ${district}

SURVEILLANCE WINDOW: LAST 72 HOURS
- Verified Cases (72h): ${currentCases}
- Previous 72h: ${previousCases} (${netChange >= 0 ? '+' : ''}${netChange}, ${percentChange})
- District Share: ${formattedShare} of population (${incidencePer100k} per 100,000)
- Island-wide Cases: ${islandCases}
(Population baseline: Department of Census and Statistics DCS)

${renderLangBlockText('English Notice', diseaseData.en)}
${renderLangBlockText('Sinhala Notice (සිංහල)', diseaseData.si)}
${renderLangBlockText('Tamil Notice (தமிழ்)', diseaseData.ta)}

OFFICIAL RESOURCES:
- Epidemiology Unit, Ministry of Health Sri Lanka: http://www.epid.gov.lk
- Health Promotion Bureau Sri Lanka: https://hpb.health.gov.lk
- World Health Organization: https://www.who.int
- Live Observatory: ${frontendUrl}/public-health

FOOTER:
This alert was generated by MediSync Automated Surveillance and verified by ${approverRole}. You received this because you are registered as a healthcare provider or patient in ${district}.
Status: ${CLINICAL_REVIEW_STATUS}.
To manage preferences or opt out: ${frontendUrl}/settings
`.trim();

  return {
    subject,
    html,
    text,
    canonicalName,
    district,
    severity,
    isDemo,
    isTest
  };
}

module.exports = {
  buildOutbreakAdvisoryEmail,
  escapeHtml,
};