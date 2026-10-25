
function resolveLang(options, fallback = 'en') {
  if (options && typeof options === 'object') {
    const candidate = options.lang || options.preferredLanguage;
    if (typeof candidate === 'string') {
      const l = candidate.trim().toLowerCase();
      if (['en', 'si', 'ta'].includes(l)) return l;
    }
  } else if (typeof options === 'string') {
    const l = options.trim().toLowerCase();
    if (['en', 'si', 'ta'].includes(l)) return l;
  }
  return fallback;
}

const axios = require('axios');
const {
  getDailyEmailCount,
  incrementDailyEmailCount,
  reserveDailyEmailSlot,
  releaseDailyEmailSlot,
  setDailyEmailCount,
  isUsingPersistentRedis,
} = require('../config/redis');

const BREVO_HTTPS_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SENDERS_ENDPOINT = 'https://api.brevo.com/v3/senders';
const BREVO_DOMAINS_ENDPOINT = 'https://api.brevo.com/v3/senders/domains';
const BREVO_ACCOUNT_ENDPOINT = 'https://api.brevo.com/v3/account';
const RESEND_HTTPS_ENDPOINT = 'https://api.resend.com/emails';

const getResendApiKey = () =>
  (
    process.env.RESEND_API_KEY ||
    process.env.RESEND_SMTP_PASS ||
    process.env.RESEND_KEY ||
    process.env.RESEND_APIKEY ||
    ''
  ).trim();

const getResendFromAddress = () =>
  (process.env.RESEND_FROM_ADDRESS || 'MediSync System <onboarding@resend.dev>').trim();

const getBackupProviderName = () =>
  (process.env.EMAIL_BACKUP_PROVIDER || 'brevo').trim().toLowerCase();

const getBrevoDailyLimit = () => {
  const parsed = Number(process.env.BREVO_DAILY_FREE_LIMIT ?? 300);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
};

/**
 * Parse a "Display Name <email@domain.com>" or "email@domain.com" string into { name, email }.
 */
const parseSenderIdentity = (rawFrom, defaultName = 'MediSync System') => {
  const fallbackEmail = 'noreply@chamodtharusha.com.lk';
  if (!rawFrom || typeof rawFrom !== 'string') {
    return { name: defaultName, email: fallbackEmail };
  }
  const trimmed = rawFrom.trim().replace(/^["']|["']$/g, '');
  const angleMatch = trimmed.match(/^(.*?)<([^>]+)>$/);
  if (angleMatch) {
    const cleanName = angleMatch[1].trim().replace(/^["']|["']$/g, '') || defaultName;
    const cleanEmail = angleMatch[2].trim();
    return { name: cleanName, email: cleanEmail || fallbackEmail };
  }
  return { name: defaultName, email: trimmed || fallbackEmail };
};

const getBrevoConfig = () => {
  const provider = getBackupProviderName();
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const rawFrom = (
    process.env.BREVO_FROM_ADDRESS ||
    'MediSync System <noreply@chamodtharusha.com.lk>'
  ).trim();
  const sender = parseSenderIdentity(rawFrom, 'MediSync System');
  const dailyLimit = getBrevoDailyLimit();

  return {
    enabled: provider === 'brevo',
    provider,
    configured: provider === 'brevo' && Boolean(apiKey && sender.email),
    apiKey,
    sender,
    rawFrom,
    dailyLimit,
    endpoint: BREVO_HTTPS_ENDPOINT,
  };
};

// Mask email addresses for log hygiene (Rule 10: never log raw patient emails)
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '[redacted]';
  const [local, domain] = email.trim().split('@');
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  const domainParts = (domain || '').split('.');
  const maskedDomain =
    domainParts.length >= 2
      ? `${domainParts[0][0] || '*'}***.${domainParts.slice(1).join('.')}`
      : '***';
  return `${maskedLocal}@${maskedDomain}`;
};

// Strip any 6-digit OTPs, API keys, or sensitive tokens if they ever appear in subjects/errors before logging
const sanitizeSubjectForLog = (subject) => {
  if (!subject || typeof subject !== 'string') return 'MediSync Notification';
  return subject
    .replace(/\b\d{6}\b/g, '[REDACTED-OTP]')
    .replace(/\b(re_|xkeysib-|xsmtpsib-)[A-Za-z0-9_-]+\b/gi, '[REDACTED-KEY]');
};

const sanitizeErrorForLog = (msg) => {
  if (!msg || typeof msg !== 'string') return 'Unknown provider error';
  return msg
    .replace(/\b\d{6}\b/g, '[REDACTED-OTP]')
    .replace(/\b(re_|xkeysib-|xsmtpsib-)[A-Za-z0-9_-]+\b/gi, '[REDACTED-KEY]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m));
};

// Strict RFC-style recipient syntax & domain validation (Rule 5)
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const isValidEmailAddress = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (trimmed.includes('..') || trimmed.includes(' ')) return false;
  if (!EMAIL_REGEX.test(trimmed)) return false;
  const domain = trimmed.split('@')[1]?.toLowerCase() || '';
  if (domain.startsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return false;
  // RFC 2606 .invalid is permanently undeliverable
  if (domain === 'invalid' || domain.endsWith('.invalid')) return false;
  return true;
};

// Detect whether an email is a time-sensitive OTP / verification code
const isTimeSensitiveOtpMail = (options = {}) => {
  if (options.timeSensitive === true || options.isOtp === true) return true;
  if (options.timeSensitive === false || options.isOtp === false) return false;
  const subject = String(options.subject || '');
  return /\botp\b|verification code|one-time password|step-up| requesting access to your lab report/i.test(
    subject
  );
};

// Injectable transport hooks for deterministic automated testing (Task 5)
let customTransports = null;

exports.__setTransportsForTesting = (transports) => {
  customTransports = transports;
};

exports.__resetTransportsForTesting = () => {
  customTransports = null;
};

exports.__setBrevoDailyCountForTesting = async (count = 0) => {
  await setDailyEmailCount('brevo', count);
};

exports.__getBrevoDailyCountForTesting = async () => {
  return getDailyEmailCount('brevo');
};

exports.isValidEmailAddress = isValidEmailAddress;
exports.maskEmail = maskEmail;
exports.getBrevoConfig = () => {
  const cfg = getBrevoConfig();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    configured: cfg.configured,
    dailyLimit: cfg.dailyLimit,
     quotaPersistence: isUsingPersistentRedis() ? 'redis_persistent' : 'in_memory_ephemeral',
    endpoint: cfg.endpoint,
    senderName: cfg.sender.name,
    senderEmailMasked: maskEmail(cfg.sender.email),
  };
};

exports.verifyBackupProviderConfig = async () => {
  const cfg = getBrevoConfig();
  return {
    configured: cfg.configured,
    enabled: cfg.enabled,
    provider: cfg.provider,
    protocol: 'https',
    port: 443,
    endpoint: cfg.endpoint,
    dailyFreeLimit: cfg.dailyLimit,
    quotaPersistence: isUsingPersistentRedis() ? 'redis_persistent' : 'in_memory_ephemeral',
    senderName: cfg.sender.name,
    senderEmailMasked: maskEmail(cfg.sender.email),
  };
};

/**
 * Read-only Brevo sender, domain, and account quota verification over HTTPS (Port 443).
 * Never sends any email and never logs or exposes API keys.
 */
exports.verifyBrevoSenderAndDomainStatus = async () => {
  const cfg = getBrevoConfig();
  const senderDomain = (cfg.sender.email.split('@')[1] || '').toLowerCase();
  if (!cfg.enabled || !cfg.configured) {
    return {
      configured: false,
      transactionalEnabled: false,
      senderVerified: false,
      domainAuthenticated: false,
      senderEmailMasked: maskEmail(cfg.sender.email),
      senderDomain,
      reason: !cfg.enabled ? 'backup_provider_not_brevo' : 'brevo_api_key_missing',
    };
  }

  const reqHeaders = {
    'api-key': cfg.apiKey,
    Accept: 'application/json',
  };

  try {
    const [acctRes, sendersRes, domainsRes] = await Promise.all([
      axios.get(BREVO_ACCOUNT_ENDPOINT, { headers: reqHeaders, timeout: 10000 }),
      axios.get(BREVO_SENDERS_ENDPOINT, { headers: reqHeaders, timeout: 10000 }),
      axios.get(BREVO_DOMAINS_ENDPOINT, { headers: reqHeaders, timeout: 10000 }).catch(() => ({ data: { domains: [] } })),
    ]);

    const relayEnabled = acctRes?.data?.relay?.enabled !== false;
    const freePlan = Array.isArray(acctRes?.data?.plan)
      ? acctRes.data.plan.find((p) => p.type === 'free' || p.creditsType === 'sendLimit')
      : null;
    const remainingCredits = typeof freePlan?.credits === 'number' ? freePlan.credits : null;

    const senders = Array.isArray(sendersRes?.data?.senders) ? sendersRes.data.senders : [];
    const matchedSender = senders.find(
      (s) => String(s.email || '').toLowerCase() === cfg.sender.email.toLowerCase()
    );
    const senderVerified = Boolean(matchedSender && matchedSender.active === true);

    const domains = Array.isArray(domainsRes?.data?.domains) ? domainsRes.data.domains : [];
    const exactMatchedDomain = domains.find(
      (d) => String(d.domain_name || d.domain || '').toLowerCase() === senderDomain
    );
    const parentMatchedDomain = domains.find(
      (d) =>
        String(d.domain_name || d.domain || '').toLowerCase() !== senderDomain &&
        senderDomain.endsWith('.' + String(d.domain_name || d.domain || '').toLowerCase())
    );
    const domainAuthenticated = Boolean(
      exactMatchedDomain && (exactMatchedDomain.authenticated === true || exactMatchedDomain.verified === true)
    );
    const parentDomainAuthenticated = Boolean(
      parentMatchedDomain && (parentMatchedDomain.authenticated === true || parentMatchedDomain.verified === true)
    );

    return {
      configured: true,
      transactionalEnabled: relayEnabled,
      senderVerified,
      domainAuthenticated,
      parentDomainAuthenticated,
      authenticatedDomains: domains
        .filter((d) => d.authenticated === true || d.verified === true)
        .map((d) => d.domain_name || d.domain),
      activeSenders: senders.filter((s) => s.active === true).map((s) => s.email),
      remainingCredits,
      senderEmailMasked: maskEmail(cfg.sender.email),
      senderDomain,
    };
  } catch (err) {
    return {
      configured: true,
      transactionalEnabled: false,
      senderVerified: false,
      domainAuthenticated: false,
      senderEmailMasked: maskEmail(cfg.sender.email),
      senderDomain,
      errorStatus: err?.response?.status || null,
      reason: sanitizeErrorForLog(err?.response?.data?.message || err?.message || 'brevo_verification_failed'),
    };
  }
};

// Startup verification log (zero credentials or PII logged)
const initResendPresent = Boolean(getResendApiKey());
const initBrevoCfg = getBrevoConfig();
console.log(
  `[EMAIL SERVICE INIT] Primary: Resend HTTPS:443 (Key Present: ${initResendPresent}) | Backup: Brevo HTTPS:443 (Enabled: ${initBrevoCfg.enabled}, Configured: ${initBrevoCfg.configured}, DailyCap: ${initBrevoCfg.dailyLimit})`
);

/**
 * Classify a Resend error into:
 * - 'ambiguous_timeout' (fallback prohibited — Rule 4)
 * - 'permanent_validation_failure' (fallback prohibited — Rule 5)
 * - 'provider_auth_configuration_error' / 'sender_domain_configuration_error' (401/403 — fallback prohibited — Rule 5)
 * - 'daily_quota_exceeded' (fallback eligible — Rule 2)
 * - 'temporary_provider_failure' (5xx / network refusal — fallback eligible — Rule 2)
 */
function classifyResendError(apiErr) {
  const status = apiErr?.response?.status || apiErr?.statusCode || null;
  const data = apiErr?.response?.data || {};
  const errName = String(data?.name || apiErr?.code || '').toLowerCase();
  const rawMsg = String(data?.message || apiErr?.message || 'Unknown Resend error');
  const errMsg = sanitizeErrorForLog(rawMsg);

  // Rule 4: Ambiguous timeout where request may have reached Resend and acceptance is unknown
  const isTimeout =
    !apiErr?.response &&
    (apiErr?.code === 'ECONNABORTED' ||
      apiErr?.code === 'ETIMEDOUT' ||
      apiErr?.code === 'ERR_CANCELED' ||
      /timeout|timed out/i.test(rawMsg));

  if (isTimeout) {
    return {
      eligibleForFallback: false,
      statusCode: 504,
      errorCode: 'ambiguous_timeout',
      error:
        'Ambiguous Resend timeout: provider acceptance is unknown; Brevo HTTPS fallback suppressed to prevent duplicate dispatch.',
    };
  }

  // Rule 2: Explicit quota / rate-limit rejection -> eligible for Brevo HTTPS fallback
  const isQuotaOrRateLimit =
    status === 429 ||
    errName.includes('quota') ||
    errName.includes('rate_limit') ||
    /quota|rate limit|too many requests/i.test(rawMsg);

  if (isQuotaOrRateLimit) {
    return {
      eligibleForFallback: true,
      statusCode: 429,
      errorCode: errName.includes('quota') ? errName : 'daily_quota_exceeded',
      error: `Resend quota or rate limit exceeded (${errMsg})`,
    };
  }

  // Rule 5b: Resend 401/403 authentication or sender-domain configuration errors -> NO fallback
  if (status === 401 || status === 403 || errName === 'invalid_api_key' || errName === 'restricted_api_key') {
    const configErrorCode =
      status === 401 || errName.includes('api_key')
        ? 'provider_auth_configuration_error'
        : 'sender_domain_configuration_error';
    console.error(
      `[EMAIL CONFIG ALERT] Resend returned HTTP ${status || 403} (${configErrorCode}): ${errMsg}. Check RESEND_API_KEY and RESEND_FROM_ADDRESS domain verification.`
    );
    return {
      eligibleForFallback: false,
      statusCode: 502,
      errorCode: configErrorCode,
      error: `Resend configuration error (${configErrorCode}): ${errMsg}`,
    };
  }

  // Rule 5a: Permanent validation / invalid recipient / bad parameter -> NO fallback
  if (
    status === 400 ||
    status === 422 ||
    errName === 'validation_error' ||
    errName === 'missing_required_field' ||
    errName === 'invalid_parameter' ||
    errName === 'invalid_to_address'
  ) {
    return {
      eligibleForFallback: false,
      statusCode: status || 422,
      errorCode: 'permanent_validation_failure',
      error: `Resend permanent validation failure: ${errMsg}`,
    };
  }

  // Rule 2: 5xx server errors or pre-connection DNS/refusal errors -> eligible for Brevo HTTPS fallback
  const isServerOrConnectError =
    (status >= 500 && status <= 599) ||
    (!apiErr?.response &&
      ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ENETUNREACH'].includes(apiErr?.code));

  if (isServerOrConnectError) {
    return {
      eligibleForFallback: true,
      statusCode: status || 503,
      errorCode: 'temporary_provider_failure',
      error: `Resend temporary provider failure: ${errMsg}`,
    };
  }

  return {
    eligibleForFallback: false,
    statusCode: status || 500,
    errorCode: 'unclassified_provider_error',
    error: `Resend error: ${errMsg}`,
  };
}

let lastSyncedBrevoUtcDay = null;
let brevoQuotaSyncPromise = null;

/**
 * Render Restart Mitigation:
 * When running without persistent Redis (`SINGLE_INSTANCE_DEV_MODE=true` on Render Free),
 * in-memory quota counters reset on container restart. Before the first live Brevo fallback
 * on a given UTC day, query Brevo's read-only GET /v3/account endpoint once to seed the
 * local counter from Brevo's authoritative remaining free-tier credits (`300 - remainingCredits`).
 */
async function syncBrevoDailyQuotaFromAccountApi(brevoCfg) {
  if (
    isUsingPersistentRedis() ||
    customTransports ||
    !brevoCfg.configured ||
    brevoCfg.dailyLimit <= 0
  ) {
    return;
  }
  const utcDay = new Date().toISOString().slice(0, 10);
  if (lastSyncedBrevoUtcDay === utcDay) {
    return;
  }
  if (!brevoQuotaSyncPromise) {
    brevoQuotaSyncPromise = (async () => {
      try {
        const acctRes = await axios.get(BREVO_ACCOUNT_ENDPOINT, {
          headers: { 'api-key': brevoCfg.apiKey, Accept: 'application/json' },
          timeout: 5000,
        });
        const freePlan = Array.isArray(acctRes?.data?.plan)
          ? acctRes.data.plan.find((p) => p.type === 'free' || p.creditsType === 'sendLimit')
          : null;
        if (typeof freePlan?.credits === 'number' && freePlan.credits >= 0) {
          const impliedUsed = Math.max(0, brevoCfg.dailyLimit - freePlan.credits);
          const currentLocal = await getDailyEmailCount('brevo');
          if (impliedUsed > currentLocal) {
            await setDailyEmailCount('brevo', impliedUsed);
          }
          lastSyncedBrevoUtcDay = utcDay;
        }
      } catch (err) {
        // Non-fatal: continue with local counter + response-header / 402 quota sync
      } finally {
        brevoQuotaSyncPromise = null;
      }
    })();
  }
  await brevoQuotaSyncPromise;
}

/**
 * Send email via Brevo Transactional HTTPS API (POST https://api.brevo.com/v3/smtp/email over Port 443).
 * Attempted at most ONCE per eligible Resend failure.
 *
 * Implements Requirement 2.11 & 2.12:
 * - Distinguishes `providerAccepted`, `deliveryQueued`, and `deliveryConfirmed: false`.
 * - Prevents time-sensitive OTPs from entering Brevo's Free-tier 1,000-email 24-hour retry queue
 *   when the 300/day immediate-send allowance is exhausted or when Brevo reports queued/deferred status.
 */
async function sendViaBrevoHttps(options, primaryErrorCode) {
  const brevoCfg = getBrevoConfig();
  const brevoCaller = customTransports?.brevoPost || customTransports?.brevoFn;
  const timeSensitive = isTimeSensitiveOtpMail(options);

  if (!brevoCfg.enabled) {
    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: brevoCfg.provider || 'none',
      fallbackUsed: false,
      primaryErrorCode,
      backupErrorCode: 'backup_provider_disabled',
      messageId: null,
      id: null,
      statusCode: 503,
      errorCode: 'both_providers_failed',
      error: `Primary provider failed (${primaryErrorCode}) and EMAIL_BACKUP_PROVIDER is not set to 'brevo'.`,
      info: null,
    };
  }

  if (!brevoCfg.configured && !brevoCaller) {
    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'brevo',
      fallbackUsed: true,
      primaryErrorCode,
      backupErrorCode: 'brevo_not_configured',
      messageId: null,
      id: null,
      statusCode: 503,
      errorCode: 'both_providers_failed',
      error: `Primary provider failed (${primaryErrorCode}) and Brevo HTTPS backup credentials (BREVO_API_KEY / BREVO_FROM_ADDRESS) are not configured.`,
      info: null,
    };
  }

  // Synchronize daily counter from Brevo /v3/account once per UTC day after a Render restart
  await syncBrevoDailyQuotaFromAccountApi(brevoCfg);

  // Requirement 2.12 & Task 3: Atomically reserve 1 slot in Brevo's 300/day immediate-send allowance
  // BEFORE calling Brevo so concurrent requests cannot race past 300/day into Brevo's 24h retry queue.
  // Because MediSync rejects locally before sending, deliveryQueued MUST be false (nothing was queued at Brevo).
  const slot = await reserveDailyEmailSlot('brevo', brevoCfg.dailyLimit);
  if (brevoCfg.dailyLimit > 0 && !slot.reserved) {
    console.warn(
      `[EMAIL SERVICE] Brevo daily immediate-send allowance exhausted (${slot.count}/${brevoCfg.dailyLimit}) | TimeSensitive: ${timeSensitive} | Rejected locally before send (deliveryQueued: false).`
    );
    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'brevo',
      fallbackUsed: true,
      primaryErrorCode,
      backupErrorCode: 'brevo_daily_allowance_exhausted',
      messageId: null,
      id: null,
      statusCode: 503,
      errorCode: 'brevo_daily_allowance_exhausted',
      error: `Brevo daily immediate-send allowance (${brevoCfg.dailyLimit}/day) is exhausted; rejected locally before sending so time-sensitive OTP does not enter Brevo's 24-hour retry queue.`,
      info: null,
    };
  }

  const toList = options.to
    ? (Array.isArray(options.to) ? options.to : [options.to]).filter(Boolean)
    : [];
  const bccList = options.bcc
    ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).filter(Boolean)
    : [];

  const sender = options.brevoFrom
    ? parseSenderIdentity(options.brevoFrom, brevoCfg.sender.name)
    : brevoCfg.sender;

  const brevoPayload = {
    sender: {
      name: sender.name || 'MediSync System',
      email: sender.email,
    },
    to: toList.map((addr) => ({ email: String(addr).trim() })),
    subject: options.subject,
    htmlContent: options.html,
  };

  if (options.text) {
    brevoPayload.textContent = options.text;
  }

  if (bccList.length > 0) {
    brevoPayload.bcc = bccList.map((addr) => ({ email: String(addr).trim() }));
  }

  if (options.attachments && options.attachments.length > 0) {
    brevoPayload.attachment = options.attachments.map((att) => ({
      name: att.filename || att.name || 'attachment.pdf',
      content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : String(att.content),
    }));
  }

  const requestConfig = {
    headers: {
      'api-key': brevoCfg.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 15000,
  };

  try {
    const res = brevoCaller
      ? await brevoCaller(BREVO_HTTPS_ENDPOINT, brevoPayload, requestConfig)
      : await axios.post(BREVO_HTTPS_ENDPOINT, brevoPayload, requestConfig);

    const status = res?.status || 201;
    const headers = res?.headers || {};
    const data = res?.data || {};
    const messageId =
      data.messageId ||
      (Array.isArray(data.messageIds) && data.messageIds.length > 0 ? data.messageIds[0] : null) ||
      null;

    // Sync local counter upward if Brevo reports remaining daily credits in headers (handles Render container restarts)
    const dailyRemainingHeader = headers['x-sib-daily-remaining'] ?? headers['x-brevo-daily-remaining'];
    let updatedDailyCount = slot.count;
    if (dailyRemainingHeader !== undefined && brevoCfg.dailyLimit > 0) {
      const remaining = Number(dailyRemainingHeader);
      if (Number.isFinite(remaining) && remaining >= 0) {
        const impliedUsed = Math.max(0, brevoCfg.dailyLimit - remaining);
        if (impliedUsed > updatedDailyCount) {
          await setDailyEmailCount('brevo', impliedUsed);
          updatedDailyCount = impliedUsed;
        }
      }
    }

    // Requirement 2.11 & 2.12: Detect deferred / retry-queued responses from Brevo
    const sendStatusHeader = String(
      headers['x-sib-send-status'] || headers['x-brevo-delivery-status'] || ''
    ).toLowerCase();
    const isQueuedOrDeferred =
      status === 202 ||
      data.queued === true ||
      data.deferred === true ||
      String(data.status || '').toLowerCase() === 'queued' ||
      String(data.code || '').toLowerCase() === 'queued' ||
      sendStatusHeader === 'queued' ||
      sendStatusHeader === 'deferred' ||
      (dailyRemainingHeader !== undefined && Number(dailyRemainingHeader) <= 0 && status === 202);

    if (isQueuedOrDeferred) {
      console.warn(
        `[EMAIL SERVICE] Brevo Deferred/Queued Delivery Detected | PrimaryError: ${primaryErrorCode} | TimeSensitive: ${timeSensitive} | Subject: "${sanitizeSubjectForLog(options.subject)}"`
      );
      if (timeSensitive) {
        return {
          success: false,
          providerAccepted: false,
          deliveryQueued: true,
          deliveryConfirmed: false,
          provider: 'brevo',
          fallbackUsed: true,
          primaryErrorCode,
          backupErrorCode: 'delivery_deferred_or_queued',
          messageId,
          id: null,
          statusCode: 503,
          errorCode: 'delivery_deferred_or_queued',
          error:
            'Brevo placed the message into its deferred retry queue instead of dispatching immediately; time-sensitive OTP rejected.',
          info: null,
        };
      }
      return {
        success: true,
        providerAccepted: true,
        deliveryQueued: true,
        deliveryConfirmed: false,
        provider: 'brevo',
        fallbackUsed: true,
        primaryErrorCode,
        backupErrorCode: null,
        messageId,
        id: messageId,
        statusCode: 202,
        errorCode: null,
        error: null,
        info: {
          id: messageId,
          messageId,
          provider: 'brevo',
          fallbackUsed: true,
          deliveryQueued: true,
          deliveryConfirmed: false,
        },
      };
    }

    if (status < 200 || status >= 300 || !messageId) {
      await releaseDailyEmailSlot('brevo');
      return {
        success: false,
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
        provider: 'brevo',
        fallbackUsed: true,
        primaryErrorCode,
        backupErrorCode: 'brevo_missing_message_id',
        messageId: null,
        id: null,
        statusCode: 503,
        errorCode: 'both_providers_failed',
        error: 'Brevo HTTPS backup did not return a valid acceptance messageId.',
        info: null,
      };
    }

    // Note: HTTP 201 + messageId means Brevo accepted the request for outbound dispatch (providerAccepted: true).
    // It does NOT confirm inbox arrival or guarantee delivery within the 10-minute OTP validity window (deliveryConfirmed: false).
    console.log(
      `[EMAIL SERVICE] Provider Accepted via Brevo HTTPS Fallback | PrimaryError: ${primaryErrorCode} | DeliveryQueued: false | DeliveryConfirmed: false | DailyCount: ${updatedDailyCount}/${brevoCfg.dailyLimit} | Subject: "${sanitizeSubjectForLog(options.subject)}" | MessageID: ${messageId}`
    );

    return {
      success: true,
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'brevo',
      fallbackUsed: true,
      primaryErrorCode,
      backupErrorCode: null,
      messageId,
      id: messageId,
      statusCode: status,
      errorCode: null,
      error: null,
      info: {
        id: messageId,
        messageId,
        provider: 'brevo',
        fallbackUsed: true,
        deliveryQueued: false,
        deliveryConfirmed: false,
      },
    };
  } catch (brevoErr) {
    const status = brevoErr?.response?.status || brevoErr?.statusCode || null;
    const data = brevoErr?.response?.data || {};
    const headers = brevoErr?.response?.headers || {};
    const rawCode = String(data?.code || brevoErr?.code || 'BREVO_ERROR');
    const safeMsg = sanitizeErrorForLog(String(data?.message || brevoErr?.message || 'Brevo request failed'));
    const rateLimitReset = headers['x-sib-ratelimit-reset']
      ? Number(headers['x-sib-ratelimit-reset'])
      : undefined;

    const isTimeout =
      !brevoErr?.response &&
      (brevoErr?.code === 'ECONNABORTED' ||
        brevoErr?.code === 'ETIMEDOUT' ||
        brevoErr?.code === 'ERR_CANCELED' ||
        /timeout|timed out/i.test(String(brevoErr?.message || '')));

    let backupErrorCode = 'brevo_provider_rejected';
    let responseStatus = 503;

    if (isTimeout) {
      backupErrorCode = 'brevo_ambiguous_timeout';
      responseStatus = 504;
    } else if (status === 429 || rawCode.toLowerCase().includes('too_many_requests')) {
      backupErrorCode = 'brevo_rate_limited';
      responseStatus = 503;
    } else if (
      status === 402 ||
      /not_enough_credits|quota|daily limit/i.test(rawCode) ||
      /not enough credits|quota|daily limit/i.test(safeMsg)
    ) {
      backupErrorCode = 'brevo_quota_exceeded';
      responseStatus = 503;
    } else if (status === 401 || status === 403) {
      backupErrorCode = 'brevo_configuration_error';
      responseStatus = 503;
    }

    // If Brevo explicitly reported quota exhaustion (402 / daily limit), sync local counter to dailyLimit
    // so subsequent requests after a Render restart know the daily allowance is exhausted;
    // otherwise release the reserved slot since Brevo did not accept the message.
    if (backupErrorCode === 'brevo_quota_exceeded' && brevoCfg.dailyLimit > 0) {
      await setDailyEmailCount('brevo', brevoCfg.dailyLimit);
    } else if (!isTimeout) {
      await releaseDailyEmailSlot('brevo');
    }

    console.error(
      `[EMAIL SERVICE] Brevo HTTPS Fallback Rejected (${backupErrorCode}, HTTP ${status || 'N/A'}) after Primary (${primaryErrorCode}) | Subject: "${sanitizeSubjectForLog(options.subject)}"`
    );

    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'brevo',
      fallbackUsed: true,
      primaryErrorCode,
      backupErrorCode,
      retryAfterSeconds: Number.isFinite(rateLimitReset) ? rateLimitReset : undefined,
      messageId: null,
      id: null,
      statusCode: responseStatus,
      errorCode: 'both_providers_failed',
      error: `Email delivery rejected by both primary (${primaryErrorCode}) and Brevo HTTPS backup (${backupErrorCode}: ${safeMsg}).`,
      info: null,
    };
  }
}

/**
 * sendMail — Core email dispatch function with Resend HTTPS Primary + Brevo HTTPS Backup (Port 443)
 *
 * Contract:
 * - Never throws unhandled exceptions to callers; always returns a structured contract.
 * - `providerAccepted: true` ONLY when Resend or Brevo explicitly accepts the message for dispatch.
 * - `deliveryQueued: boolean` indicates whether the message entered a deferred retry queue.
 *   For time-sensitive OTPs, queued delivery is rejected (`providerAccepted: false, deliveryQueued: true`).
 * - `deliveryConfirmed: false` ALWAYS (provider acceptance !== confirmed inbox arrival).
 * - Never retries Brevo after an ambiguous timeout (`ambiguous_timeout`).
 * - Never falls back to Brevo for invalid recipients (`invalid_recipient` / `permanent_validation_failure`)
 *   or Resend 401/403 configuration errors (`provider_auth_configuration_error` / `sender_domain_configuration_error`).
 * - Never falls back to Brevo for bulk/outbreak emails (`allowFallback: false`).
 */
const sendMail = async (options = {}) => {
  const toList = options.to
    ? (Array.isArray(options.to) ? options.to : [options.to]).filter(Boolean)
    : [];
  const bccList = options.bcc
    ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).filter(Boolean)
    : [];

  // Rule 5: Validate recipient addresses before contacting any provider
  if (toList.length === 0 && bccList.length === 0) {
    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: null,
      fallbackUsed: false,
      primaryErrorCode: null,
      backupErrorCode: null,
      messageId: null,
      id: null,
      statusCode: 400,
      errorCode: 'invalid_recipient',
      error: 'Missing recipient email address',
      info: null,
    };
  }

  const allRecipients = [...toList, ...bccList];
  const invalidRecipient = allRecipients.find((addr) => !isValidEmailAddress(addr));
  if (invalidRecipient) {
    console.warn(
      `[EMAIL SERVICE] Rejected invalid recipient format (${maskEmail(String(invalidRecipient))}) — no provider contacted.`
    );
    return {
      success: false,
      providerAccepted: false,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: null,
      fallbackUsed: false,
      primaryErrorCode: null,
      backupErrorCode: null,
      messageId: null,
      id: null,
      statusCode: 400,
      errorCode: 'invalid_recipient',
      error: 'Invalid or malformed recipient email address',
      info: null,
    };
  }

  // Task 5 & IR-04 Control: In automated test environment (NODE_ENV=test or MEDISYNC_TEST_MODE=true)
  // or when addressing synthetic .local test/demo domains, prevent external Resend/Brevo delivery
  // and capture payloads in-memory for deterministic test assertions.
  const isSyntheticLocalRecipient =
    allRecipients.length > 0 &&
    allRecipients.every((addr) => /\.local$/i.test(String(addr).trim()));
  if (
    process.env.MEDISYNC_TEST_MODE === 'true' ||
    ((process.env.NODE_ENV === 'test' ||
      process.env.MEDISYNC_TEST_MODE === 'true' ||
      isSyntheticLocalRecipient) &&
      !customTransports &&
      process.env.EMAIL_SERVICE_LIVE_TEST !== 'true')
  ) {
    const mockId = `test-accepted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const htmlWithoutHexColors = String(options.html || options.text || '').replace(/#[0-9a-fA-F]{3,8}\b/g, '');
    const otpMatch = htmlWithoutHexColors.match(/\b(\d{6})\b/);
    if (!global.__MEDISYNC_CAPTURED_TEST_EMAILS) {
      global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
    }
    global.__MEDISYNC_CAPTURED_TEST_EMAILS.push({
      id: mockId,
      to: toList,
      bcc: bccList,
      subject: options.subject,
      html: options.html,
      text: options.text,
      otp: options.otpCode || (otpMatch ? otpMatch[1] : null),
      hasAttachment: Boolean(options.attachments && options.attachments.length > 0),
      capturedAt: new Date().toISOString(),
    });
    if (global.__MEDISYNC_CAPTURED_TEST_EMAILS.length > 200) {
      global.__MEDISYNC_CAPTURED_TEST_EMAILS.shift();
    }
    return {
      success: true,
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'resend',
      fallbackUsed: false,
      primaryErrorCode: null,
      backupErrorCode: null,
      messageId: mockId,
      id: mockId,
      statusCode: 200,
      errorCode: null,
      error: null,
      info: {
        id: mockId,
        messageId: mockId,
        provider: 'resend',
        fallbackUsed: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
        mockedInTestMode: true,
      },
    };
  }

  const allowFallback = options.allowFallback !== false;
  const resendApiKey = getResendApiKey();
  const fromAddress = getResendFromAddress();

  // Step 1: Attempt Resend Primary
  const resendCaller = customTransports?.resendPost || customTransports?.resendFn;
  if (!resendApiKey && !resendCaller) {
    if (!allowFallback) {
      return {
        success: false,
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
        provider: 'resend',
        fallbackUsed: false,
        primaryErrorCode: 'resend_not_configured',
        backupErrorCode: null,
        messageId: null,
        id: null,
        statusCode: 503,
        errorCode: 'bulk_fallback_prohibited',
        error: 'Resend API key is not configured and bulk fallback to Brevo is prohibited.',
        info: null,
      };
    }
    return sendViaBrevoHttps(options, 'resend_not_configured');
  }

  try {
    const fromFormatted = (options.from || fromAddress).includes('<')
      ? (options.from || fromAddress).match(/<([^>]+)>/)[1]
      : options.from || fromAddress;

    const payload = {
      from: `MediSync System <${fromFormatted}>`,
      to: toList,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    if (bccList.length > 0) {
      payload.bcc = bccList;
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
      }));
    }

    let res;
    if (resendCaller) {
      res = await resendCaller(RESEND_HTTPS_ENDPOINT, payload, {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
    } else {
      res = await axios.post(RESEND_HTTPS_ENDPOINT, payload, {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
    }

    const messageId = res?.data?.id || null;
    if (!messageId) {
      throw new Error('Resend returned HTTP 2xx without a valid message ID');
    }

    console.log(
      `[EMAIL SERVICE] Provider Accepted via Resend Primary | DeliveryQueued: false | DeliveryConfirmed: false | Subject: "${sanitizeSubjectForLog(options.subject)}" | MessageID: ${messageId}`
    );

    // Rule 3: Resend accepted -> return immediately, never duplicate via Brevo
    return {
      success: true,
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: 'resend',
      fallbackUsed: false,
      primaryErrorCode: null,
      backupErrorCode: null,
      messageId,
      id: messageId,
      statusCode: res.status || 200,
      errorCode: null,
      error: null,
      info: {
        id: messageId,
        messageId,
        provider: 'resend',
        fallbackUsed: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
      },
    };
  } catch (apiErr) {
    const classification = classifyResendError(apiErr);

    console.warn(
      `[EMAIL SERVICE] Resend Primary Rejected | Code: ${classification.errorCode} | Status: ${classification.statusCode} | FallbackEligible: ${classification.eligibleForFallback && allowFallback} | Subject: "${sanitizeSubjectForLog(options.subject)}"`
    );

    // Rule 4 & Rule 5: Do NOT fallback on ambiguous timeout, permanent validation failure, or 401/403 config error
    if (!classification.eligibleForFallback) {
      return {
        success: false,
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
        provider: 'resend',
        fallbackUsed: false,
        primaryErrorCode: classification.errorCode,
        backupErrorCode: null,
        messageId: null,
        id: null,
        statusCode: classification.statusCode,
        errorCode: classification.errorCode,
        error: classification.error,
        info: null,
      };
    }

    // Rule 9: Do NOT use Brevo backup for bulk/mass outbreak emails
    if (!allowFallback) {
      return {
        success: false,
        providerAccepted: false,
        deliveryQueued: false,
        deliveryConfirmed: false,
        provider: 'resend',
        fallbackUsed: false,
        primaryErrorCode: classification.errorCode,
        backupErrorCode: null,
        messageId: null,
        id: null,
        statusCode: classification.statusCode,
        errorCode: 'bulk_fallback_prohibited',
        error: `Resend rejected bulk email (${classification.errorCode}) and Brevo backup fallback is prohibited for mass broadcasts.`,
        info: null,
      };
    }

    // Rule 2: Attempt Brevo HTTPS backup once
    return sendViaBrevoHttps(options, classification.errorCode);
  }
};

exports.sendMail = sendMail;

// -----------------------------------------------------------------------------
// 1. ONE-TIME PASSWORD (OTP) EMAIL
// -----------------------------------------------------------------------------
exports.sendOTPEmail = async (to, name, otp, options = {}) => {
  const lang = resolveLang(options);
  const subjects = {
    en: 'MediSync — Your Secure Login OTP',
    si: 'MediSync — ඔබගේ ආරක්ෂිත පිවිසුම් එක්වරක් භාවිත මුරපදය (OTP)',
    ta: 'MediSync — உங்கள் பாதுகாப்பான உள்நுழைவு ஒருமுறை கடவுச்சொல் (OTP)'
  };
  const headings = {
    en: 'Your secure One-Time Password (OTP) is:',
    si: 'ඔබගේ ආරක්ෂිත එක්වරක් භාවිත මුරපදය (OTP):',
    ta: 'உங்கள் பாதுகாப்பான ஒருமுறை கடவுச்சொல் (OTP):'
  };
  const expiries = {
    en: 'Valid for 10 minutes',
    si: 'විනාඩි 10ක් සඳහා වලංගු වේ',
    ta: '10 நிமிடங்களுக்கு செல்லුපடியாகும்'
  };
  const disclaimers = {
    en: "Never share this OTP with anyone. If you didn't request this, please contact support immediately.",
    si: 'මෙම මුරපදය කිසිවෙකු සමඟ බෙදා නොගන්න. ඔබ මෙය ඉල්ලා නොසිටියේ නම්, වහාම සහය අංශය අමතන්න.',
    ta: 'இந்த ஒருமுறை கடவுச்சொல்லை யாருடனும் பகிர வேண்டாம். நீங்கள் இதைக் கோரவில்லை என்றால், உடனடியாக ஆதரவைத் தொடர்பு கொள்ளவும்.'
  };

  return sendMail({
    from: getResendFromAddress(),
    to,
    timeSensitive: true,
    isOtp: true,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name || 'User'},</p>
          <p style="font-size: 16px; color: #333333;">${headings[lang] || headings.en}</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px; text-align: center;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0D3B66;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold;">${expiries[lang] || expiries.en}</p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">${disclaimers[lang] || disclaimers.en}</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 2. TEMPORARY PASSWORD EMAIL
// -----------------------------------------------------------------------------
exports.sendTempPasswordEmail = async (to, name, tempPassword, loginUrl, hospitalName, options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeHospitalName = escapeHtml(hospitalName);
  const safeLoginUrl = sanitizeActionUrl(loginUrl);
  const plainLoginUrl = safeLoginUrl === '#' ? '#' : safeLoginUrl;

  const subjects = {
    en: 'MediSync — Your Hospital Account Access',
    si: 'MediSync — ඔබගේ රෝහල් ගිණුම් ප්‍රවේශය',
    ta: 'MediSync — உங்கள் மருத்துவமனை கணக்கு அணுகல்'
  };
  const intros = {
    en: `An account has been created or updated for you to access ${safeHospitalName} via the MediSync platform. Your temporary credentials are:`,
    si: `MediSync පද්ධතිය හරහා ${safeHospitalName} වෙත පිවිසීමට ඔබට ගිණුමක් සකසා ඇත. ඔබගේ තාවකාලික පිවිසුම් තොරතුරු පහත පරිදි වේ:`,
    ta: `MediSync தளம் மூலம் ${safeHospitalName} ஐ அணுக உங்களுக்கான கணக்கு உருவாக்கப்பட்டுள்ளது. உங்கள் தற்காலிக உள்நுழைவு விவரங்கள்:`
  };
  const warnings = {
    en: 'You must change your password on first login.',
    si: 'පළමු වරට පද්ධතියට පිවිසීමේදී ඔබගේ මුරපදය අනිවාර්යයෙන්ම වෙනස් කළ යුතුය.',
    ta: 'முதல் முறை உள்நுழையும்போது உங்கள் கடவுச்சொல்லை மாற்ற வேண்டும்.'
  };
  const buttons = {
    en: 'Log In Now',
    si: 'දැන්ම පිවිසෙන්න',
    ta: 'இப்போது உள்நுழையவும்'
  };

  const plainTexts = {
    en: `Hello ${name},\n\nAn account has been created or updated for you to access ${hospitalName} via the MediSync platform.\n\nEmail / Login ID: ${to}\nTemporary Password: ${tempPassword}\n\nLog in: ${plainLoginUrl}\n\nYou must change your password on first login.`,
    si: `ආයුබෝවන් ${name},\n\nMediSync පද්ධතිය හරහා ${hospitalName} වෙත පිවිසීමට ඔබට ගිණුමක් සකසා ඇත.\n\nවිද්‍යුත් තැපෑල / පිවිසුම් අංකය: ${to}\nතාවකාලික මුරපදය: ${tempPassword}\n\nපිවිසෙන්න: ${plainLoginUrl}\n\nපළමු වරට පද්ධතියට පිවිසීමේදී ඔබගේ මුරපදය අනිවාර්යයෙන්ම වෙනස් කළ යුතුය.`,
    ta: `வணக்கம் ${name},\n\nMediSync தளம் மூலம் ${hospitalName} ஐ அணுக உங்களுக்கான கணக்கு உருவாக்கப்பட்டுள்ளது.\n\nமின்னஞ்சல் / உள்நுழைவு ஐடி: ${to}\nதற்காலிக கடவுச்சொல்: ${tempPassword}\n\nஉள்நுழையவும்: ${plainLoginUrl}\n\nமுதல் முறை உள்நுழையும்போது உங்கள் கடவுச்சொல்லை மாற்ற வேண்டும்.`
  };

  return sendMail({
    from: getResendFromAddress(),
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${safeHospitalName} - MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${safeName},</p>
          <p style="font-size: 16px; color: #333333;">${intros[lang] || intros.en}</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #555555;">Email / Login ID: <strong>${escapeHtml(to)}</strong></p>
            <p style="margin: 0; font-size: 14px; color: #555555;">Temporary Password: <strong style="font-family: monospace; font-size: 16px;">${escapeHtml(tempPassword)}</strong></p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(safeLoginUrl)}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">${buttons[lang] || buttons.en}</a>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold; text-align: center;">${warnings[lang] || warnings.en}</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 3. WELCOME EMAIL
// -----------------------------------------------------------------------------
exports.sendWelcomeEmail = async (to, name, role, options = {}) => {
  const lang = resolveLang(options);
  const subjects = {
    en: 'Welcome to MediSync',
    si: 'MediSync වෙත සාදරයෙන් පිළිගනිමු',
    ta: 'MediSync தளத்திற்கு உங்களை வரவேற்கிறோம்'
  };
  const greetings = {
    en: "Welcome to Sri Lanka's Digital Health Platform.",
    si: 'ශ්‍රී ලංකාවේ ජාතික ඩිජිටල් සෞඛ්‍ය වේදිකාව වෙත ඔබව සාදරයෙන් පිළිගනිමු.',
    ta: 'இலங்கையின் தேசிய டிஜிட்டல் சுகாதார தளத்திற்கு உங்களை வரவேற்கிறோம்.'
  };
  const buttons = {
    en: 'Access Your Portal',
    si: 'ඔබගේ පිවිසුම් පුවරුවට යන්න',
    ta: 'உங்கள் போர்ட்டலை அணுகவும்'
  };

  return sendMail({
    from: getResendFromAddress(),
    to,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${subjects[lang] || subjects.en}</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name},</p>
          <p style="font-size: 16px; color: #333333;">${greetings[lang] || greetings.en}</p>
          <div style="margin: 20px 0; text-align: center;">
            <span style="display: inline-block; padding: 6px 12px; background-color: #e3f2fd; color: #1565C0; border-radius: 16px; font-size: 14px; font-weight: bold; text-transform: uppercase;">Role: ${String(role || 'user').replace('_', ' ')}</span>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk'}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">${buttons[lang] || buttons.en}</a>
          </div>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 4. FOLLOW-UP REMINDER EMAIL
// -----------------------------------------------------------------------------
exports.sendFollowUpReminder = async (to, patientName, doctorName, date) => {
  return sendMail({
    from: getResendFromAddress(),
    to,
    subject: 'MediSync — Follow-up Reminder',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${patientName},</p>
          <p style="font-size: 16px; color: #333333;">This is a friendly reminder for your upcoming medical follow-up.</p>
          <div style="margin: 30px 0; padding: 20px; border-left: 4px solid #3B82F6; background-color: #f4f7f6;">
            <p style="margin: 0 0 10px 0; font-size: 16px; color: #333333;"><strong>Doctor:</strong> ${doctorName}</p>
            <p style="margin: 0; font-size: 16px; color: #333333;"><strong>Date:</strong> ${date}</p>
          </div>
          <p style="font-size: 14px; color: #777777;">Please contact the clinic if you need to reschedule.</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 5. PUBLIC HEALTH OUTBREAK ALERTS (Bulk — Gmail SMTP Fallback Prohibited)
// -----------------------------------------------------------------------------
exports.sendOutbreakAlert = async (emailList, district, message, zScore) => {
  if (!emailList || emailList.length === 0) {
    return { success: true, providerAccepted: false, deliveryConfirmed: false };
  }

  const mailOptions = {
    from: getResendFromAddress(),
    allowFallback: false, // Rule: Never use Gmail as unrestricted fallback for mass outbreak broadcasts
    subject: `⚠ MediSync Public Health Alert — ${district}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcdd2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #C62828; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">⚠ Public Health Alert</h1>
        </div>
        <div style="padding: 30px; background-color: #fff8f8;">
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; padding: 4px 10px; background-color: #ffebee; color: #c62828; border-radius: 4px; font-weight: bold; font-size: 14px;">District: ${district}</span>
            <span style="display: inline-block; padding: 4px 10px; background-color: #ffebee; color: #c62828; border-radius: 4px; font-weight: bold; font-size: 14px; margin-left: 10px;">Z-Score: ${zScore}</span>
          </div>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">${message}</p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">This is an automated alert from the MediSync AI Engine.</p>
        </div>
      </div>
    `,
  };

  const recipients = Array.isArray(emailList) ? emailList : [emailList].filter(Boolean);
  const results = await Promise.all(
    recipients.map((email) => sendMail({ ...mailOptions, to: email }))
  );
  const acceptedCount = results.filter((r) => r.providerAccepted).length;
  return {
    success: acceptedCount > 0,
    providerAccepted: acceptedCount > 0,
    deliveryConfirmed: false,
    fallbackUsed: false,
    errorCode: acceptedCount > 0 ? null : (results[0]?.errorCode || 'bulk_fallback_prohibited'),
    acceptedCount,
    totalCount: recipients.length,
  };
};

exports.sendMassOutbreakAlert = async (emailArray, disease, district, riskLevel, spikePct) => {
  if (!emailArray || emailArray.length === 0) {
    return { success: true, providerAccepted: false, deliveryConfirmed: false };
  }

  return sendMail({
    from: getResendFromAddress(),
    to: 'no-reply@medisync.lk',
    bcc: emailArray,
    allowFallback: false, // Rule: Never use Gmail as unrestricted fallback for mass outbreak broadcasts
    subject: `🚨 CRITICAL: ${riskLevel} Risk ${disease} Outbreak Detected`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcdd2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: ${riskLevel === 'High' ? '#B91C1C' : '#D97706'}; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🚨 URGENT PUBLIC HEALTH ALERT</h1>
        </div>
        <div style="padding: 30px; background-color: #fff8f8;">
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">
            A <strong>${riskLevel} Risk</strong> outbreak of <strong>${disease}</strong> has been detected in <strong>${district}</strong>${spikePct ? (typeof spikePct === 'number' ? ` (+${spikePct}% spike).` : '.') : '.'}
          </p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5; font-weight: bold;">
            Please take immediate precautions.
          </p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">This is an automated mass alert from the MediSync AI Engine.</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 6. E-PRESCRIPTION EMAIL
// -----------------------------------------------------------------------------
exports.sendPrescriptionEmail = async (patientEmail, patientName, pdfBuffer, securePassword, options = {}) => {
  if (!patientEmail || !pdfBuffer) {
    return {
      success: false,
      providerAccepted: false,
      deliveryConfirmed: false,
      errorCode: 'missing_parameters',
      error: 'Missing recipient email or PDF buffer',
    };
  }

  const lang = resolveLang(options);
  const subjects = {
    en: 'MediSync — Your Secure E-Prescription',
    si: 'MediSync — ඔබගේ ආරක්ෂිත ඊ-බෙහෙත් වට්ටෝරුව',
    ta: 'MediSync — உங்கள் பாதுகாப்பான மின்னணு மருந்துச்சீட்டு'
  };
  const bodies = {
    en: 'Your recent E-Prescription is attached. Confidential medical document. Handle according to privacy policy.',
    si: 'ඔබගේ මෑතකාලීන ඊ-බෙහෙත් වට්ටෝරුව මෙහි අමුණා ඇත. රහස්‍ය වෛද්‍ය ලේඛනයකි. පුද්ගලිකත්ව ප්‍රතිපත්තියට අනුකූලව පරිහරණය කරන්න.',
    ta: 'உங்கள் சமீபத்திய மின்னணு மருந்துச்சீட்டு இணைக்கப்பட்டுள்ளது. இரகசிய மருத்துவ ஆவணம். தனியுரிமைக் கொள்கையின்படி கையாளவும்.'
  };

  return sendMail({
    from: getResendFromAddress(),
    to: patientEmail,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${patientName || 'Patient'},</p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">
            ${bodies[lang] || bodies.en}
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'MediSync_Prescription.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
};

// -----------------------------------------------------------------------------
// 7. APPOINTMENT REMINDER EMAIL
// -----------------------------------------------------------------------------
exports.sendReminderEmail = async (patientEmail, patientName, formattedDate, doctorName, options = {}) => {
  if (!patientEmail) {
    return {
      success: false,
      providerAccepted: false,
      deliveryConfirmed: false,
      errorCode: 'invalid_recipient',
      error: 'No email address',
    };
  }

  const lang = resolveLang(options);
  const safePatientName = escapeHtml(patientName || 'Patient');
  const safeDoctorName = escapeHtml(doctorName || 'Your Doctor');
  const safeDate = escapeHtml(formattedDate);
  const subjects = {
    en: `MediSync — Appointment Reminder: ${formattedDate}`,
    si: `MediSync — සායනික හමුව පිළිබඳ සිහිකැඳවීම: ${formattedDate}`,
    ta: `MediSync — சந்திப்பு நினைவூட்டல்: ${formattedDate}`
  };
  const notices = {
    en: `This is a reminder that you have a scheduled consultation with <strong>Dr. ${safeDoctorName}</strong> on <strong>${safeDate}</strong>.`,
    si: `ඔබ වෙනුවෙන් <strong>දොස්තර ${safeDoctorName}</strong> සමඟ <strong>${safeDate}</strong> දින වෛද්‍ය හමුවක් නියමිත බව කරුණාවෙන් සිහිපත් කරමු.`,
    ta: `<strong>மருத்துவர் ${safeDoctorName}</strong> உடன் <strong>${safeDate}</strong> அன்று உங்களுக்கு ஆலோசனை சந்திப்பு திட்டமிடப்பட்டுள்ளது என்பதை நினைவூட்டுகிறோம்.`
  };

  return sendMail({
    ...(options.allowFallback === false ? { allowFallback: false } : {}),
    from: getResendFromAddress(),
    to: patientEmail,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0D3B66 0%, #1a5fa8 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${safePatientName}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">${notices[lang] || notices.en}</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 8. DISPENSE NOTIFICATION EMAIL
// -----------------------------------------------------------------------------
exports.sendDispenseNotificationEmail = async (
  patientEmail,
  patientName,
  pharmacyName,
  dispenserName,
  medications,
  dispensedAt,
  options = {}
) => {
  if (!patientEmail) {
    return {
      success: false,
      providerAccepted: false,
      deliveryConfirmed: false,
      errorCode: 'invalid_recipient',
      error: 'No email address',
    };
  }

  const lang = resolveLang(options);
  const subjects = {
    en: 'MediSync — Your Medication Has Been Dispensed',
    si: 'MediSync — ඔබගේ ඖෂධ නිකුත් කර ඇත',
    ta: 'MediSync — உங்கள் மருந்துகள் வழங்கப்பட்டுள்ளன'
  };
  const notices = {
    en: `Your medication has been dispensed at <strong>${pharmacyName || 'a MediSync Pharmacy'}</strong> by <strong>${dispenserName || 'Pharmacist'}</strong> at ${dispensedAt}.`,
    si: `ඔබගේ ඖෂධ <strong>${pharmacyName || 'MediSync ඔසුසල'}</strong> වෙතින් <strong>${dispenserName || 'ඖෂධවේදී'}</strong> විසින් ${dispensedAt} වේලාවේදී නිකුත් කරන ලදී.`,
    ta: `உங்கள் மருந்துகள் <strong>${pharmacyName || 'MediSync மருந்தகம்'}</strong> இல் <strong>${dispenserName || 'மருந்தாளர்'}</strong> மூலம் ${dispensedAt} மணிக்கு வழங்கப்பட்டன.`
  };

  return sendMail({
    from: getResendFromAddress(),
    to: patientEmail,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${patientName || 'Patient'}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">${notices[lang] || notices.en}</p>
          <p>Medications: <strong>${medications}</strong></p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 9. SECURITY ANOMALY & RECOVERY EMAILS
// -----------------------------------------------------------------------------
exports.sendAnomalyEmail = async (email, deviceModel, location, options = {}) => {
  const lang = resolveLang(options);
  const subjects = {
    en: 'MediSync — Untrusted Login Attempt Detected',
    si: 'MediSync — අනවසර පිවිසුම් උත්සාහයක් හඳුනා ගන්නා ලදී',
    ta: 'MediSync — அங்கீகரிக்கப்படாத உள்நுழைவு முயற்சி கண்டறியப்பட்டது'
  };
  const titles = {
    en: 'Security Alert',
    si: 'ආරක්ෂක අනතුරු ඇඟවීම',
    ta: 'பாதுகாப்பு எச்சரிக்கை'
  };
  const bodies = {
    en: `<p>We detected a login attempt from an unrecognized device: <strong>${deviceModel || 'Unknown Device'}</strong> (${location || 'Unknown Location'}).</p>`,
    si: `<p>හඳුනා නොගත් උපාංගයකින් ඔබගේ ගිණුමට පිවිසීමේ උත්සාහයක් වාර්තා විය: <strong>${deviceModel || 'හඳුනා නොගත් උපාංගය'}</strong> (${location || 'හඳුනා නොගත් ස්ථානය'}).</p>`,
    ta: `<p>அடையாளம் தெரியாத சாதனத்திலிருந்து உள்நுழைவு முயற்சி கண்டறியப்பட்டது: <strong>${deviceModel || 'தெரியாத சாதனம்'}</strong> (${location || 'தெரியாத இடம்'}).</p>`
  };
  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">${titles[lang] || titles.en}</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          ${bodies[lang] || bodies.en}
        </div>
      </div>
    `,
  });
};

exports.sendRecoveryEmail = async (email, link, purpose, options = {}) => {
  const lang = resolveLang(options);
  const subjects = {
    en: `MediSync — Account Recovery: ${purpose}`,
    si: `MediSync — ගිණුම යථා තත්ත්වයට පත් කිරීම: ${purpose}`,
    ta: `MediSync — கணக்கு மீட்டெடுப்பு: ${purpose}`
  };
  const prompts = {
    en: `You requested account recovery for: <strong>${purpose}</strong>`,
    si: `ඔබ පහත අවශ්‍යතාවය සඳහා ගිණුම යථා තත්ත්වයට පත් කිරීමට ඉල්ලා ඇත: <strong>${purpose}</strong>`,
    ta: `இதற்காக கணக்கு மீட்டெடுப்பைக் கோரியுள்ளீர்கள்: <strong>${purpose}</strong>`
  };
  const buttons = {
    en: 'Recover Account',
    si: 'ගිණුම යථා තත්ත්වයට පත් කරන්න',
    ta: 'கணக்கை மீட்டெடுக்கவும்'
  };

  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>${prompts[lang] || prompts.en}</p>
          <p>Click the link below to proceed:</p>
          <a href="${link}" style="background-color: #3B82F6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">${buttons[lang] || buttons.en}</a>
        </div>
      </div>
    `,
  });
};

exports.sendDeviceRemovedEmail = async (email, deviceModel, options = {}) => {
  const lang = resolveLang(options);
  const subjects = {
    en: 'MediSync — Trusted Device Removed',
    si: 'MediSync — විශ්වාසනීය උපාංගය ඉවත් කරන ලදී',
    ta: 'MediSync — நம்பகமான சாதனம் அகற்றப்பட்டது'
  };
  const titles = {
    en: 'Device Removed',
    si: 'උපාංගය ඉවත් කරන ලදී',
    ta: 'சாதனம் அகற்றப்பட்டது'
  };
  const bodies = {
    en: `<p>A device was removed from your trusted devices: <strong>${deviceModel || 'Unknown Device'}</strong>.</p>`,
    si: `<p>ඔබගේ විශ්වාසනීය උපාංග ලැයිස්තුවෙන් උපාංගයක් ඉවත් කරන ලදී: <strong>${deviceModel || 'හඳුනා නොගත් උපාංගය'}</strong>.</p>`,
    ta: `<p>உங்கள் நம்பகமான சாதனங்களிலிருந்து ஒரு சாதனம் அகற்றப்பட்டது: <strong>${deviceModel || 'தெரியாத சாதனம்'}</strong>.</p>`
  };
  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: subjects[lang] || subjects.en,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">${titles[lang] || titles.en}</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          ${bodies[lang] || bodies.en}
        </div>
      </div>
    `,
  });
};

exports.sendEmail = async ({
  to,
  subject,
  html,
  text,
  attachments,
  allowFallback = true,
  timeSensitive,
  isOtp,
}) => {
  return sendMail({
    from: getResendFromAddress(),
    to,
    subject,
    html,
    text,
    attachments,
    allowFallback,
    timeSensitive,
    isOtp,
  });
};

// -----------------------------------------------------------------------------
// 10. LOGIN NOTIFICATION EMAIL (TRUSTED VS UNTRUSTED SECURITY ALERT)
// -----------------------------------------------------------------------------
exports.sendLoginNotificationEmail = async (
  to,
  name,
  idField,
  role,
  device,
  networkInfo,
  loginType,
  hospitalName,
  isTrusted = true,
  options = {}
) => {
  const lang = resolveLang(options);
  const isHospital = loginType === 'Hospital Login';
  const isNewDevice = isTrusted === false;
  const workspaceStr =
    isHospital && hospitalName ? `<li><strong>Workspace:</strong> ${hospitalName}</li>` : '';

  const headerBg = isNewDevice ? '#C62828' : isHospital ? '#1976D2' : '#2E7D32';
  const headerTitle = isNewDevice
    ? '🚨 New Device Login Detected'
    : isHospital
      ? 'Hospital Login Notification'
      : 'Login Notification';
  const subjects = {
    en: isNewDevice
      ? `🚨 MediSync Security Alert: Login from NEW Unrecognized Device (${device || 'Unknown Device'})`
      : `MediSync - ${isHospital ? 'Hospital' : 'New'} Login Notification`,
    si: isNewDevice
      ? `🚨 MediSync ආරක්ෂක අනතුරු ඇඟවීම: හඳුනානොගත් නව උපාංගයකින් පිවිසීමක් (${device || 'නොදන්නා උපාංගය'})`
      : `MediSync - නව පිවිසුම් දැනුම්දීම`,
    ta: isNewDevice
      ? `🚨 MediSync பாதுகாப்பு எச்சரிக்கை: புதிய அங்கீகரிக்கப்படாத சாதனத்திலிருந்து உள்நுழைவு (${device || 'தெரியாத சாதனம்'})`
      : `MediSync - புதிய உள்நுழைவு அறிவிப்பு`
  };
  const subject = subjects[lang] || subjects.en;

  const newDeviceWarning = isNewDevice
    ? `
    <div style="background-color: #FFEBEE; border: 1px solid #FFCDD2; border-left: 4px solid #C62828; padding: 14px 16px; margin-bottom: 20px; border-radius: 6px;">
      <p style="margin: 0; color: #B71C1C; font-weight: bold; font-size: 14px;">
        ⚠️ Security Alert: This is a new device we haven't seen before on your account.
      </p>
      <p style="margin: 6px 0 0; color: #5F2120; font-size: 12px;">
        If you did not sign in from this device, your password may have been compromised. Change your password immediately.
      </p>
    </div>
  `
    : '';

  return sendMail({
    from: getResendFromAddress(),
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: ${headerBg}; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${headerTitle}</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          ${newDeviceWarning}
          <p>Hello ${name},</p>
          <p>A new login was detected on your MediSync <strong>${role}</strong> account.</p>
          <ul style="list-style: none; padding-left: 0; line-height: 1.6;">
            <li><strong>Identifier:</strong> ${idField}</li>
            ${workspaceStr}
            <li><strong>Device:</strong> ${device || 'Unknown Device'}</li>
            <li><strong>Device Status:</strong> <span style="font-weight: bold; color: ${isNewDevice ? '#C62828' : '#2E7D32'};">${isNewDevice ? '⚠️ Untrusted / New Device' : '✅ Trusted Device'}</span></li>
            <li><strong>Network Provider:</strong> ${networkInfo?.isp || 'Unknown ISP'}</li>
            <li><strong>Country:</strong> ${networkInfo?.country || 'Unknown Country'}</li>
            <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
            <li><small style="color: #777;">Nearest network hub: ${networkInfo?.city || 'Unknown'}, ${networkInfo?.region || 'Unknown'}</small></li>
          </ul>
          <p style="margin-top: 24px; color: #555; font-size: 0.9em;">If this was you, you can safely ignore this email. If not, please contact MediSync security support immediately.</p>
        </div>
      </div>
    `,
  });
};

// ─── Standardized MediSync Brand Template Helper (Trilingual Support) ───────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
exports.escapeHtml = escapeHtml;

const TRUSTED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5100',
  'http://127.0.0.1:5100',
  'https://medisync.local',
  'https://medisync.chamodtharusha.com.lk',
  'https://preview.medisync.chamodtharusha.com.lk'
]);

if (process.env.APP_URL) {
  try { TRUSTED_ORIGINS.add(new URL(process.env.APP_URL).origin.toLowerCase()); } catch (_) {}
}
if (process.env.FRONTEND_URL) {
  try { TRUSTED_ORIGINS.add(new URL(process.env.FRONTEND_URL).origin.toLowerCase()); } catch (_) {}
}

function validateActionUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '#';

  // 1. Reject CR, LF, control characters, tabs before normalization
  if (/[\r\n\x00-\x1f\x7f]/.test(rawUrl)) return '#';

  const trimmed = rawUrl.trim();
  if (!trimmed) return '#';

  // 2. Reject protocol-relative external URLs (//evil.com), javascript:, data:, vbscript:, file:
  if (trimmed.startsWith('//') || /^\s*(javascript|data|vbscript|file):/i.test(trimmed)) {
    return '#';
  }

  // 3. Safe root-relative paths like /patient/dashboard or /verify?token=123
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (/[\\\x00-\x1f\x7f]/.test(trimmed)) return '#';
    return trimmed;
  }

  // 4. Validate absolute URL
  try {
    const parsed = new URL(trimmed);

    // Reject embedded credentials in URLs (e.g. http://user:pass@domain)
    if (parsed.username || parsed.password) return '#';

    // Protocol must strictly be http: or https:
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '#';

    // Origin must be in strict TRUSTED_ORIGINS allowlist
    const originLower = parsed.origin.toLowerCase();
    if (!TRUSTED_ORIGINS.has(originLower)) {
      return '#';
    }

    return parsed.href;
  } catch (_) {
    return '#';
  }
}

function sanitizeActionUrl(rawUrl) {
  return validateActionUrl(rawUrl);
}
exports.validateActionUrl = validateActionUrl;
exports.sanitizeActionUrl = sanitizeActionUrl;

function renderBrandEmailHtml({ title, preheader, bodyHtml, actionButton, footerNote, lang = 'en' }) {
  const brandSubtitles = {
    en: 'National Clinical Decision Support',
    si: 'ජාතික සායනික තීරණ සහය පද්ධතිය',
    ta: 'தேசிய மருத்துவ முடிவு ஆதரவு அமைப்பு'
  };
  const footerNotices = {
    en: 'This is an automated operational notification from the MediSync Platform. Do not reply directly to this email.',
    si: 'මෙය MediSync පද්ධතියෙන් නිකුත් කරන ස්වයංක්‍රීය දැනුම්දීමකි. කරුණාකර මෙම ඊමේල් පණිවිඩයට පිළිතුරු නොදෙන්න.',
    ta: 'இது MediSync தளத்தின் தானியங்கி அறிவிப்பாகும். இந்த மின்னஞ்சலுக்கு நேரடியாக பதிலளிக்க வேண்டாம்.'
  };
  const securityDisclaimers = {
    en: 'Protected by MediSync Service Isolation & Transport Security &bull; Sri Lanka',
    si: 'MediSync සේවා ආරක්ෂණ සහ ප්‍රවාහන ප්‍රොටෝකෝල මගින් සුරක්ෂිතයි &bull; ශ්‍රී ලංකාව',
    ta: 'MediSync சேவை பாதுகாப்பு மற்றும் போக்குவரத்து நெறிமுறைகளால் பாதுகாக்கப்படுகிறது &bull; இலங்கை'
  };
  const brandSubtitle = brandSubtitles[lang] || brandSubtitles.en;
  const footerNotice = footerNotices[lang] || footerNotices.en;
  const securityDisclaimer = securityDisclaimers[lang] || securityDisclaimers.en;

  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || title);
  const safeFooterNote = footerNote ? escapeHtml(footerNote) : '';

  return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0F3B66 0%, #1e40af 100%); padding: 28px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Medi<span style="color: #38bdf8;">Sync</span></span>
                    <span style="display: block; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">${brandSubtitle}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Subject Title Banner -->
          <tr>
            <td style="background-color: #0d9488; height: 3px;"></td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background-color: #ffffff;">
              <h1 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">${safeTitle}</h1>
              <div style="font-size: 14px; line-height: 1.6; color: #334155;">
                ${bodyHtml}
              </div>
              ${actionButton ? `
              <div style="margin: 28px 0 16px 0; text-align: center;">
                <a href="${escapeHtml(sanitizeActionUrl(actionButton.url))}" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);">${escapeHtml(actionButton.label)}</a>
              </div>
              ${actionButton.subtext ? `<p style="font-size: 12px; color: #64748b; text-align: center; margin: 8px 0 0 0;">${escapeHtml(actionButton.subtext)}</p>` : ''}
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              ${safeFooterNote ? `<p style="margin: 0 0 12px 0;">${safeFooterNote}</p>` : ''}
              <p style="margin: 0;">${footerNotice}</p>
              <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 11px;">${securityDisclaimer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
exports.renderBrandEmailHtml = renderBrandEmailHtml;

// 1. Account Invitation
exports.sendAccountInvitationEmail = async (to, name, inviteUrl, role = 'member', expiresAt = '48 hours', options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeRoleName = escapeHtml(String(role).replace('_', ' ').toUpperCase());
  const safeExpiresAt = escapeHtml(expiresAt);
  const safeInviteUrl = sanitizeActionUrl(inviteUrl);

  const subjects = {
    en: `MediSync Platform Invitation — Setup Your ${safeRoleName} Account`,
    si: `MediSync පද්ධති ආරාධනය — ඔබගේ ${safeRoleName} ගිණුම සකසන්න`,
    ta: `MediSync தள அழைப்பு — உங்கள் ${safeRoleName} கணக்கை அமைக்கவும்`
  };

  const titles = {
    en: 'Welcome to MediSync',
    si: 'MediSync වෙත සාදරයෙන් පිළිගනිමු',
    ta: 'MediSync தளத்திற்கு உங்களை வரவேற்கிறோம்'
  };

  const buttons = {
    en: 'Activate Account & Set Password',
    si: 'ගිණුම සක්‍රිය කර මුරපදය සකසන්න',
    ta: 'கணக்கைச் செயல்படுத்தி கடவுச்சொல்லை அமைக்கவும்'
  };

  const bodies = {
    en: `<p>Hello <strong>${safeName}</strong>,</p><p>You have been invited to join the MediSync secure healthcare infrastructure as an authorized <strong>${safeRoleName}</strong>.</p><p>Please complete your profile setup and establish your secure credentials by clicking the button below:</p>`,
    si: `<p>ආයුබෝවන් <strong>${safeName}</strong>,</p><p>බලයලත් <strong>${safeRoleName}</strong> ලෙස MediSync සුරක්ෂිත සෞඛ්‍ය යටිතල පහසුකමට සම්බන්ධ වීමට ඔබට ආරාධනා කර ඇත.</p><p>පහත බොත්තම ක්ලික් කිරීමෙන් ඔබගේ ගිණුම සකසා මුරපදය තහවුරු කරන්න:</p>`,
    ta: `<p>வணக்கம் <strong>${safeName}</strong>,</p><p>அங்கீகரிக்கப்பட்ட <strong>${safeRoleName}</strong> ஆக MediSync பாதுகாப்பான சுகாதார அமைப்பில் இணைய அழைக்கப்பட்டுள்ளீர்கள்.</p><p>கீழேயுள்ள பொத்தானைக் கிளிக் செய்து உங்கள் கணக்கை அமைத்து கடவுச்சொல்லை உறுதிப்படுத்தவும்:</p>`
  };

  const subtexts = {
    en: `This secure link expires in ${safeExpiresAt}.`,
    si: `මෙම සුරක්ෂිත සබැඳිය ${safeExpiresAt} කින් කල් ඉකුත් වේ.`,
    ta: `இந்த இணைப்பு ${safeExpiresAt} இல் காலாவதியாகிறது.`
  };

  const footers = {
    en: 'For security reasons, never forward this invitation link to anyone.',
    si: 'ආරක්ෂක හේතූන් මත, මෙම ආරාධනා සබැඳිය කිසිවෙකුට යොමු නොකරන්න.',
    ta: 'பாதுகாப்பு காரணங்களுக்காக, இந்த அழைப்பு இணைப்பை யாருக்கும் பகிர வேண்டாம்.'
  };

  const plainInviteTarget = safeInviteUrl === '#' ? '#' : safeInviteUrl;
  const plainTexts = {
    en: `Hello ${name},\n\nYou have been invited to join MediSync as ${role}.\n\nActivate: ${plainInviteTarget}\n\nExpires in ${expiresAt}.`,
    si: `ආයුබෝවන් ${name},\n\n${role} ලෙස MediSync පද්ධතියට එක්වීමට ඔබට ආරාධනා කර ඇත.\n\nගිණුම සක්‍රිය කරන්න: ${plainInviteTarget}\n\nකල් ඉකුත් වීම: ${expiresAt}.`,
    ta: `வணக்கம் ${name},\n\n${role} ஆக MediSync தளத்தில் இணைய அழைக்கப்பட்டுள்ளீர்கள்.\n\nசெயல்படுத்தவும்: ${plainInviteTarget}\n\nகாலாவதி: ${expiresAt}.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: `Invitation for ${safeRoleName}`,
      bodyHtml: bodies[lang] || bodies.en,
      actionButton: {
        label: buttons[lang] || buttons.en,
        url: safeInviteUrl,
        subtext: subtexts[lang] || subtexts.en
      },
      footerNote: footers[lang] || footers.en,
      lang
    })
  });
};

// 2. Email Address Verification
exports.sendEmailVerificationEmail = async (to, name, verifyUrl, expiresAt = '24 hours', options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeExpiresAt = escapeHtml(expiresAt);
  const safeVerifyUrl = sanitizeActionUrl(verifyUrl);

  const subjects = {
    en: 'MediSync Account Security — Verify Your Email Address',
    si: 'MediSync ගිණුම් ආරක්ෂාව — ඔබගේ විද්‍යුත් තැපෑල තහවුරු කරන්න',
    ta: 'MediSync கணக்கு பாதுகாப்பு — உங்கள் மின்னஞ்சலை சரிபார்க்கவும்'
  };
  const titles = {
    en: 'Verify Your Email Address',
    si: 'ඔබගේ විද්‍යුත් තැපැල් ලිපිනය තහවුරු කරන්න',
    ta: 'உங்கள் மின்னஞ்சல் முகவரியை சரிபார்க்கவும்'
  };
  const buttons = {
    en: 'Verify Email Address',
    si: 'විද්‍යුත් තැපෑල තහවුරු කරන්න',
    ta: 'மின்னஞ்சலை சரிபார்க்கவும்'
  };
  const bodies = {
    en: `<p>Hello <strong>${safeName}</strong>,</p><p>Thank you for registering with MediSync. To protect your account and enable clinical notifications, please confirm your email address.</p>`,
    si: `<p>ආයුබෝවන් <strong>${safeName}</strong>,</p><p>MediSync සමඟ ලියාපදිංචි වීම පිළිබඳව ස්තූතියි. ඔබගේ ගිණුම ආරක්ෂා කිරීමට සහ සායනික දැනුම්දීම් සක්‍රිය කිරීමට කරුණාකර ඔබගේ විද්‍යුත් තැපෑල තහවුරු කරන්න.</p>`,
    ta: `<p>வணக்கம் <strong>${safeName}</strong>,</p><p>MediSync இல் பதிவுசெய்ததற்கு நன்றி. உங்கள் கணக்கைப் பாதுகாக்கவும் மருத்துவ அறிவிப்புகளைப் பெறவும் உங்கள் மின்னஞ்சலை உறுதிப்படுத்தவும்.</p>`
  };

  const plainVerifyTarget = safeVerifyUrl === '#' ? '#' : safeVerifyUrl;
  const plainTexts = {
    en: `Hello ${name},\n\nPlease verify your email for your MediSync account.\n\nVerification link: ${plainVerifyTarget}\n\nExpires in ${expiresAt}.`,
    si: `ආයුබෝවන් ${name},\n\nකරුණාකර ඔබගේ MediSync ගිණුම සඳහා විද්‍යුත් තැපෑල තහවුරු කරන්න.\n\nසත්‍යාපන සබැඳිය: ${plainVerifyTarget}\n\nකල් ඉකුත් වීම: ${expiresAt}.`,
    ta: `வணக்கம் ${name},\n\nஉங்கள் MediSync கணக்கிற்கான மின்னஞ்சலை சரிபார்க்கவும்.\n\nசரிபார்ப்பு இணைப்பு: ${plainVerifyTarget}\n\nகாலாவதி: ${expiresAt}.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: 'Please confirm your email address for MediSync',
      bodyHtml: bodies[lang] || bodies.en,
      actionButton: {
        label: buttons[lang] || buttons.en,
        url: safeVerifyUrl,
        subtext: `Expires in ${safeExpiresAt}.`
      },
      lang
    })
  });
};

// 3. Password Reset
exports.sendPasswordResetEmail = async (to, name, resetUrl, expiresAt = '15 minutes', options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeExpiresAt = escapeHtml(expiresAt);
  const safeResetUrl = sanitizeActionUrl(resetUrl);

  const subjects = {
    en: 'MediSync Security — Password Reset Request',
    si: 'MediSync ආරක්ෂාව — මුරපදය යළි සැකසීමේ ඉල්ලීම',
    ta: 'MediSync பாதுகாப்பு — கடவுச்சொல் மீட்டமைப்பு கோரிக்கை'
  };
  const titles = {
    en: 'Password Reset Request',
    si: 'මුරපදය යළි සැකසීමේ ඉල්ලීම',
    ta: 'கடவுச்சொல் மீட்டமைப்பு கோரிக்கை'
  };
  const buttons = {
    en: 'Reset Password',
    si: 'මුරපදය යළි සකසන්න',
    ta: 'கடவுச்சொல்லை மீட்டமைக்கவும்'
  };
  const bodies = {
    en: `<p>Hello <strong>${safeName}</strong>,</p><p>A request was received to reset the password for your MediSync account.</p><p>Click the link below to choose a new password. If you did not make this request, someone may be attempting to access your account—please notify support.</p>`,
    si: `<p>ආයුබෝවන් <strong>${safeName}</strong>,</p><p>ඔබගේ MediSync ගිණුමේ මුරපදය යළි සැකසීමට ඉල්ලීමක් ලැබී ඇත.</p><p>නව මුරපදයක් සැකසීමට පහත සබැඳිය ක්ලික් කරන්න. ඔබ මෙය සිදු නොකළේ නම්, වහාම සහය අංශය දැනුවත් කරන්න.</p>`,
    ta: `<p>வணக்கம் <strong>${safeName}</strong>,</p><p>உங்கள் MediSync கணக்கின் கடவுச்சொல்லை மீட்டமைக்க கோரிக்கை பெறப்பட்டது.</p><p>புதிய கடவுச்சொல்லை அமைக்க கீழேயுள்ள இணைப்பைக் கிளிக் செய்யவும். நீங்கள் இதைச் செய்யவில்லை என்றால், ஆதரவைத் தொடர்பு கொள்ளவும்.</p>`
  };

  const plainResetTarget = safeResetUrl === '#' ? '#' : safeResetUrl;
  const plainTexts = {
    en: `Hello ${name},\n\nA password reset was requested for your MediSync account.\n\nReset link: ${plainResetTarget}\n\nValid for ${expiresAt}.`,
    si: `ආයුබෝවන් ${name},\n\nඔබගේ MediSync ගිණුම සඳහා මුරපදය යළි සැකසීමට ඉල්ලීමක් ලැබී ඇත.\n\nයළි සැකසීමේ සබැඳිය: ${plainResetTarget}\n\nවලංගු කාලය: ${expiresAt}.`,
    ta: `வணக்கம் ${name},\n\nஉங்கள் MediSync கணக்கின் கடவுச்சொல்லை மீட்டமைக்க கோரிக்கை பெறப்பட்டது.\n\nமீட்டமைப்பு இணைப்பு: ${plainResetTarget}\n\nசெல்லுபடியாகும் காலம்: ${expiresAt}.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: 'Reset your MediSync account password',
      bodyHtml: bodies[lang] || bodies.en,
      actionButton: {
        label: buttons[lang] || buttons.en,
        url: safeResetUrl,
        subtext: `For security, this link expires in ${safeExpiresAt}.`
      },
      footerNote: 'MediSync staff will never ask for your password via email or telephone.',
      lang
    })
  });
};

// 4. Patient Clinical Access Request
exports.sendPatientAccessRequestEmail = async (to, patientName, doctorName, clinicName, options = {}) => {
  const lang = resolveLang(options);
  const safePatientName = escapeHtml(patientName);
  const safeDoctorName = escapeHtml(doctorName);
  const safeClinicName = escapeHtml(clinicName || 'Medical Facility');

  const subjects = {
    en: 'MediSync Access Control — Clinician Requested Record Access',
    si: 'MediSync ප්‍රවේශ පාලනය — වෛද්‍යවරයා විසින් වාර්තා ප්‍රවේශය ඉල්ලා ඇත',
    ta: 'MediSync அணுகல் கட்டுப்பாடு — மருத்துவர் பதிவுகள் அணுகலைக் கோரியுள்ளார்'
  };
  const titles = {
    en: 'Clinical Record Access Request',
    si: 'සායනික වාර්තා ප්‍රවේශ ඉල්ලීම',
    ta: 'மருத்துவப் பதிவுகள் அணுகல் கோரிக்கை'
  };

  const plainTexts = {
    en: `Hello ${patientName},\n\nDr. ${doctorName} at ${clinicName || 'authorized clinic'} has requested access to your clinical timeline.\n\nPlease log in to grant or deny consent.`,
    si: `ආයුබෝවන් ${patientName},\n\n${clinicName || 'බලයලත් සායනය'} හි වෛද්‍ය ${doctorName} ඔබගේ සායනික කාලරේඛාව වෙත ප්‍රවේශය ඉල්ලා ඇත.\n\nකරුණාකර කැමැත්ත ලබා දීමට හෝ ප්‍රතික්ෂේප කිරීමට පිවිසෙන්න.`,
    ta: `வணக்கம் ${patientName},\n\n${clinicName || 'அங்கீகரிக்கப்பட்ட கிளினிக்'} இல் உள்ள மருத்துவர் ${doctorName} உங்கள் மருத்துவப் பதிவுகள் அணுகலைக் கோரியுள்ளார்.\n\nஅனுமதிக்க அல்லது மறுக்க உள்நுழையவும்.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: `${safeDoctorName} requested access to your health timeline`,
      bodyHtml: `
        <p>Hello <strong>${safePatientName}</strong>,</p>
        <p><strong>Dr. ${safeDoctorName}</strong> (${safeClinicName}) has requested time-bounded access to your MediSync health records for consultation and diagnosis support.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Clinician:</strong> Dr. ${safeDoctorName}</p>
          <p style="margin: 0; font-size: 13px;"><strong>Access Scope:</strong> Past Consultations, Prescriptions &amp; Lab Reports</p>
        </div>
        <p>You can grant consent via OTP challenge in your patient dashboard or during your in-person visit.</p>
      `,
      footerNote: 'You maintain full sovereignty over your health records. Consent can be revoked instantly at any time.',
      lang
    })
  });
};

// 5. Consent Status Changed
exports.sendConsentStatusEmail = async (to, patientName, doctorName, status = 'granted', options = {}) => {
  const lang = resolveLang(options);
  const isGranted = String(status).toLowerCase() === 'granted';
  const safePatientName = escapeHtml(patientName);
  const safeDoctorName = escapeHtml(doctorName);

  const subjects = {
    en: `MediSync Security Notice — Clinical Access ${isGranted ? 'Granted' : 'Revoked'}`,
    si: `MediSync ආරක්ෂක නිවේදනය — සායනික ප්‍රවේශය ${isGranted ? 'බලය පවරන ලදී' : 'අවලංගු කරන ලදී'}`,
    ta: `MediSync பாதுகாப்பு அறிவிப்பு — மருத்துவ அணுகல் ${isGranted ? 'வழங்கப்பட்டது' : 'ரத்து செய்யப்பட்டது'}`
  };

  const plainTexts = {
    en: `Hello ${patientName},\n\nClinical access for Dr. ${doctorName} was ${isGranted ? 'granted' : 'revoked'}.\n\nTimestamp: ${new Date().toISOString()}`,
    si: `ආයුබෝවන් ${patientName},\n\nවෛද්‍ය ${doctorName} සඳහා සායනික ප්‍රවේශය ${isGranted ? 'බලය පවරන ලදී' : 'අවලංගු කරන ලදී'}.\n\nවේලාව: ${new Date().toISOString()}`,
    ta: `வணக்கம் ${patientName},\n\nமருத்துவர் ${doctorName} க்கான மருத்துவ அணுகல் ${isGranted ? 'வழங்கப்பட்டது' : 'ரத்து செய்யப்பட்டது'}.\n\nநேரம்: ${new Date().toISOString()}`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: `Clinical Access Consent ${isGranted ? 'Activated' : 'Revoked'}`,
      preheader: `Health record access for Dr. ${safeDoctorName} was updated`,
      bodyHtml: `
        <p>Hello <strong>${safePatientName}</strong>,</p>
        <p>This confirmation confirms that clinical timeline access for <strong>Dr. ${safeDoctorName}</strong> has been <span style="font-weight: 700; color: ${isGranted ? '#0d9488' : '#e11d48'};">${isGranted ? 'AUTHORIZED' : 'TERMINATED'}</span>.</p>
        <p style="font-size: 13px; color: #64748b;">Event logged to immutable audit ledger at: ${new Date().toLocaleString()}</p>
      `,
      lang
    })
  });
};

// 6. Laboratory Report Available
exports.sendLabReportAvailableEmail = async (to, patientName, testName, portalUrl, options = {}) => {
  const lang = resolveLang(options);
  const safePatientName = escapeHtml(patientName);
  const safeTestName = escapeHtml(testName || 'Diagnostic Test');
  const safePortalUrl = sanitizeActionUrl(portalUrl || 'https://medisync.local/patient/dashboard');

  const subjects = {
    en: 'MediSync Clinical Records — New Diagnostic Report Available',
    si: 'MediSync සායනික වාර්තා — නව රසායනාගාර වාර්තාවක් නිකුත් කර ඇත',
    ta: 'MediSync மருத்துவப் பதிவுகள் — புதிய ஆய்வக அறிக்கை தயாராக உள்ளது'
  };
  const titles = {
    en: 'New Diagnostic Report Ready',
    si: 'නව රසායනාගාර වාර්තාවක් නිකුත් කර ඇත',
    ta: 'புதிய ஆய்வக அறிக்கை தயாராக உள்ளது'
  };
  const preheaders = {
    en: `Your report for ${safeTestName} is available`,
    si: `${safeTestName} සඳහා ඔබගේ වාර්තාව නිකුත් කර ඇත`,
    ta: `${safeTestName} அறிக்கை தயாராக உள்ளது`
  };
  const bodies = {
    en: `
        <p>Hello <strong>${safePatientName}</strong>,</p>
        <p>Your laboratory test results for <strong>${safeTestName}</strong> have been processed and uploaded by the hospital laboratory.</p>
        <p>Your results are encrypted and available for download in your patient portal.</p>
      `,
    si: `
        <p>ආයුබෝවන් <strong>${safePatientName}</strong>,</p>
        <p><strong>${safeTestName}</strong> සඳහා ඔබගේ පරීක්ෂණ වාර්තා රෝහල් රසායනාගාරය විසින් සකස් කර පද්ධතියට උඩුගත කර ඇත.</p>
        <p>ඔබගේ ප්‍රතිඵල සංකේතනය කර ඇති අතර ඔබගේ රෝගී ද්වාරයෙන් බාගත කරගත හැක.</p>
      `,
    ta: `
        <p>வணக்கம் <strong>${safePatientName}</strong>,</p>
        <p><strong>${safeTestName}</strong> க்கான உங்கள் முடிவுகள் மருத்துவமனை ஆய்வகத்தால் செயலாக்கப்பட்டு பதிவேற்றப்பட்டுள்ளன.</p>
        <p>உங்கள் முடிவுகள் குறியாக்கம் செய்யப்பட்டுள்ளன மற்றும் உங்கள் போர்ட்டலில் பதிவிறக்கம் செய்யக் கிடைக்கின்றன.</p>
      `
  };
  const actionLabels = {
    en: 'View Lab Report',
    si: 'රසායනාගාර වාර්තාව බලන්න',
    ta: 'ஆய்வக அறிக்கையைப் பார்க்கவும்'
  };
  const footerNotes = {
    en: 'For security and patient confidentiality, detailed diagnostic values are not sent via email.',
    si: 'ආරක්ෂාව සහ රෝගී රහස්‍යභාවය සුරැකීම සඳහා සවිස්තරාත්මක වෛද්‍ය අගයන් විද්‍යුත් තැපෑල හරහා නොයවනු ලැබේ.',
    ta: 'பாதுகாப்பு மற்றும் நோயாளி ரகசியத்தன்மை கருதி, விரிவான மருத்துவ மதிப்புகள் மின்னஞ்சல் மூலம் அனுப்பப்படுவதில்லை.'
  };

  const plainPortalTarget = safePortalUrl === '#' ? '#' : safePortalUrl;
  const plainTexts = {
    en: `Hello ${patientName},\n\nA new laboratory diagnostic report (${testName || 'Diagnostic Test'}) is available in your MediSync portal.\n\nLogin to view: ${plainPortalTarget}`,
    si: `ආයුබෝවන් ${patientName},\n\nනව රසායනාගාර පරීක්ෂණ වාර්තාවක් (${testName || 'රසායනාගාර පරීක්ෂණය'}) ඔබගේ MediSync ද්වාරයෙහි ඇත.\n\nනැරඹීමට පිවිසෙන්න: ${plainPortalTarget}`,
    ta: `வணக்கம் ${patientName},\n\nபுதிய ஆய்வக அறிக்கை (${testName || 'ஆய்வக பரிசோதனை'}) உங்கள் MediSync போர்ட்டலில் கிடைக்கிறது.\n\nபார்க்க உள்நுழையவும்: ${plainPortalTarget}`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: preheaders[lang] || preheaders.en,
      bodyHtml: bodies[lang] || bodies.en,
      actionButton: {
        label: actionLabels[lang] || actionLabels.en,
        url: safePortalUrl
      },
      footerNote: footerNotes[lang] || footerNotes.en,
      lang
    })
  });
};

// 7. Administrative Review Status
exports.sendAdminReviewStatusEmail = async (to, name, role, decision, reason, options = {}) => {
  const lang = resolveLang(options);
  const isApproved = String(decision).toLowerCase() === 'approved';
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeReason = reason ? escapeHtml(reason) : '';

  const subjects = {
    en: `MediSync Professional Accreditation — Account Review ${isApproved ? 'Approved' : 'Action Required'}`,
    si: `MediSync වෘත්තීය ප්‍රතීතනය — ගිණුම් සමාලෝචනය ${isApproved ? 'අනුමත කරන ලදී' : 'ක්‍රියාමාර්ග අවශ්‍යයි'}`,
    ta: `MediSync தொழில்முறை அங்கீகாரம் — கணக்கு மதிப்பாய்வு ${isApproved ? 'ஒப்புதல் அளிக்கப்பட்டது' : 'நடவடிக்கை தேவை'}`
  };
  const titles = {
    en: `Accreditation Review: ${isApproved ? 'Approved' : 'Action Required'}`,
    si: `ප්‍රතීතන සමාලෝචනය: ${isApproved ? 'අනුමතයි' : 'ක්‍රියාමාර්ග අවශ්‍යයි'}`,
    ta: `அங்கீகார மதிப்பாய்வு: ${isApproved ? 'ஒப்புதல் அளிக்கப்பட்டது' : 'நடவடிக்கை தேவை'}`
  };
  const preheaders = {
    en: `Your MediSync ${safeRole} account review is complete`,
    si: `ඔබගේ MediSync ${safeRole} ගිණුම් සමාලෝචනය සම්පූර්ණයි`,
    ta: `உங்கள் MediSync ${safeRole} கணக்கு மதிப்பாய்வு முடிந்தது`
  };
  const statusLabels = {
    en: isApproved ? 'VERIFIED & ACTIVE' : 'APPLICATION RETURNED',
    si: isApproved ? 'VERIFIED & ACTIVE (සත්‍යාපිත සහ සක්‍රියයි)' : 'APPLICATION RETURNED (අයදුම්පත ආපසු හරවා යවන ලදී)',
    ta: isApproved ? 'VERIFIED & ACTIVE (சரிபார்க்கப்பட்டு செயலில் உள்ளது)' : 'APPLICATION RETURNED (விண்ணப்பம் திருப்பி அனுப்பப்பட்டது)'
  };
  const bodies = {
    en: `
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>The administrative governance committee has completed the review of your <strong>${safeRole}</strong> professional account credentials.</p>
        <div style="background-color: ${isApproved ? '#f0fdf4' : '#fff1f2'}; border: 1px solid ${isApproved ? '#bbf7d0' : '#fecdd3'}; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: ${isApproved ? '#166534' : '#9f1239'};">Status: ${statusLabels[lang] || statusLabels.en}</p>
          ${safeReason ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">${safeReason}</p>` : ''}
        </div>
        ${isApproved ? '<p>You may now log in to access verified clinical/operational tools.</p>' : '<p>Please contact support or resubmit required regulatory licensing documents.</p>'}
      `,
    si: `
        <p>ආයුබෝවන් <strong>${safeName}</strong>,</p>
        <p>පරිපාලන පාලක කමිටුව විසින් ඔබගේ <strong>${safeRole}</strong> වෘත්තීය ගිණුම් සහතික සමාලෝචනය කර ඇත.</p>
        <div style="background-color: ${isApproved ? '#f0fdf4' : '#fff1f2'}; border: 1px solid ${isApproved ? '#bbf7d0' : '#fecdd3'}; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: ${isApproved ? '#166534' : '#9f1239'};">තත්ත්වය: ${statusLabels[lang] || statusLabels.en}</p>
          ${safeReason ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">${safeReason}</p>` : ''}
        </div>
        ${isApproved ? '<p>ඔබට දැන් පද්ධතියට පිවිස සත්‍යාපිත මෙවලම් භාවිතා කළ හැක.</p>' : '<p>කරුණාකර තාක්ෂණික සහය අමතන්න හෝ වලංගු බලපත්‍ර ලේඛන නැවත ඉදිරිපත් කරන්න.</p>'}
      `,
    ta: `
        <p>வணக்கம் <strong>${safeName}</strong>,</p>
        <p>நிர்வாகக் குழு உங்கள் <strong>${safeRole}</strong> தொழில்முறை கணக்குச் சான்றுகளை மதிப்பாய்வு செய்துள்ளது.</p>
        <div style="background-color: ${isApproved ? '#f0fdf4' : '#fff1f2'}; border: 1px solid ${isApproved ? '#bbf7d0' : '#fecdd3'}; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: ${isApproved ? '#166534' : '#9f1239'};">நிலை: ${statusLabels[lang] || statusLabels.en}</p>
          ${safeReason ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;">${safeReason}</p>` : ''}
        </div>
        ${isApproved ? '<p>நீங்கள் இப்போது உள்நுழைந்து அங்கீகரிக்கப்பட்ட கருவிகளைப் பயன்படுத்தலாம்.</p>' : '<p>தயவுசெய்து ஆதரவைத் தொடர்பு கொள்ளவும் அல்லது தேவையான ஆவணங்களை மீண்டும் சமர்ப்பிக்கவும்.</p>'}
      `
  };

  const plainTexts = {
    en: `Hello ${name},\n\nYour application for a MediSync ${role} account has been ${isApproved ? 'approved' : 'rejected'}.\n\nDetails: ${reason || 'Administrative review completed.'}`,
    si: `ආයුබෝවන් ${name},\n\nMediSync ${role} ගිණුමක් සඳහා වූ ඔබගේ අයදුම්පත ${isApproved ? 'අනුමත කර ඇත' : 'ප්‍රතික්ෂේප කර ඇත'}.\n\nවිස්තර: ${reason || 'පරිපාලන සමාලෝචනය අවසන්.'}`,
    ta: `வணக்கம் ${name},\n\nMediSync ${role} கணக்கிற்கான உங்கள் விண்ணப்பம் ${isApproved ? 'ஒப்புதல் அளிக்கப்பட்டது' : 'நிராகரிக்கப்பட்டது'}.\n\nவிவரங்கள்: ${reason || 'நிர்வாக மதிப்பாய்வு முடிந்தது.'}`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: preheaders[lang] || preheaders.en,
      bodyHtml: bodies[lang] || bodies.en,
      lang
    })
  });
};

// 8. Support Ticket Acknowledgment
exports.sendSupportTicketAckEmail = async (to, name, ticketId, ticketSubject, options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeTicketId = escapeHtml(ticketId || 'TKT');
  const safeTicketSubject = escapeHtml(ticketSubject || 'General Inquiry');

  const subjects = {
    en: `[MediSync Support #${safeTicketId}] Ticket Received`,
    si: `[MediSync තාක්ෂණික සහය #${safeTicketId}] ගැටළුව ලියාපදිංචි කරගන්නා ලදී`,
    ta: `[MediSync ஆதரவு #${safeTicketId}] கோரிக்கை பெறப்பட்டது`
  };
  const titles = {
    en: 'Support Inquiry Received',
    si: 'සහය ඉල්ලීම ලියාපදිංචි කරගන්නා ලදී',
    ta: 'ஆதரவு கோரிக்கை பெறப்பட்டது'
  };
  const preheaders = {
    en: `Ticket #${safeTicketId} has been logged`,
    si: `ටිකට්පත් #${safeTicketId} ලියාපදිංචි විය`,
    ta: `கோரிக்கை #${safeTicketId} பதிவு செய்யப்பட்டுள்ளது`
  };
  const bodies = {
    en: `
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>Thank you for reaching out to the MediSync operational support team. We have received your inquiry and created reference ticket <strong>#${safeTicketId}</strong>.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 12px 0;">
          <p style="margin: 0; font-size: 13px;"><strong>Subject:</strong> ${safeTicketSubject}</p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Our technical team aims to respond within one business day.</p>
      `,
    si: `
        <p>ආයුබෝවන් <strong>${safeName}</strong>,</p>
        <p>MediSync මෙහෙයුම් සහායක කණ්ඩායම හා සම්බන්ධ වීම පිළිබඳව ස්තූතියි. ඔබගේ විමසීම ලැබී ඇති අතර යොමු අංකය <strong>#${safeTicketId}</strong> වේ.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 12px 0;">
          <p style="margin: 0; font-size: 13px;"><strong>විෂය:</strong> ${safeTicketSubject}</p>
        </div>
        <p style="font-size: 13px; color: #64748b;">අපගේ තාක්ෂණික කණ්ඩායම එක් වැඩ කරන දිනයක් ඇතුළත පිළිතුරු සැපයීමට බලාපොරොත්තු වේ.</p>
      `,
    ta: `
        <p>வணக்கம் <strong>${safeName}</strong>,</p>
        <p>MediSync செயல்பாட்டு ஆதரவுக் குழுவைத் தொடர்பு கொண்டதற்கு நன்றி. உங்கள் கோரிக்கை பெறப்பட்டு குறிப்பு எண் <strong>#${safeTicketId}</strong> உருவாக்கப்பட்டுள்ளது.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 12px 0;">
          <p style="margin: 0; font-size: 13px;"><strong>பொருள்:</strong> ${safeTicketSubject}</p>
        </div>
        <p style="font-size: 13px; color: #64748b;">எங்கள் தொழில்நுட்பக் குழு ஒரு வணிக நாளுக்குள் பதிலளிக்க முயற்சிக்கும்.</p>
      `
  };

  const plainTexts = {
    en: `Hello ${name},\n\nYour support inquiry has been received (Ref: ${ticketId}).\n\nSubject: ${ticketSubject || 'General Inquiry'}\n\nOur operations team will review your request.`,
    si: `ආයුබෝවන් ${name},\n\nඔබගේ තාක්ෂණික සහය ඉල්ලීම ලැබී ඇත (යොමුව: ${ticketId}).\n\nවිෂය: ${ticketSubject || 'පොදු විමසීම'}\n\nඅපගේ මෙහෙයුම් කණ්ඩායම ඔබගේ ඉල්ලීම සමාලෝචනය කරනු ඇත.`,
    ta: `வணக்கம் ${name},\n\nஉங்கள் ஆதரவு கோரிக்கை பெறப்பட்டது (குறிப்பு: ${ticketId}).\n\nபொருள்: ${ticketSubject || 'பொது விசாரணை'}\n\nஎங்கள் குழு உங்கள் கோரிக்கையை மதிப்பாய்வு செய்யும்.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: preheaders[lang] || preheaders.en,
      bodyHtml: bodies[lang] || bodies.en,
      lang
    })
  });
};

// 9. Security Incident Notification
exports.sendSecurityIncidentEmail = async (to, name, incidentDetails, options = {}) => {
  const lang = resolveLang(options);
  const safeName = escapeHtml(name);
  const safeIncidentDetails = escapeHtml(incidentDetails || 'An anomalous authentication attempt or credential modification was registered.');

  const subjects = {
    en: 'URGENT: MediSync Security Alert — Account Incident Detected',
    si: 'හදිසි: MediSync ආරක්ෂක අනතුරු ඇඟවීම — ගිණුම් සිදුවීමක් හඳුනා ගන්නා ලදී',
    ta: 'அவசரம்: MediSync பாதுகாப்பு எச்சரிக்கை — கணக்கு சம்பவம் கண்டறியப்பட்டது'
  };
  const titles = {
    en: 'Security Incident Detected',
    si: 'ආරක්ෂක සිදුවීමක් හඳුනා ගන්නා ලදී',
    ta: 'பாதுகாப்பு சம்பவம் கண்டறியப்பட்டது'
  };
  const preheaders = {
    en: 'Urgent security alert regarding your MediSync account',
    si: 'ඔබගේ MediSync ගිණුම පිළිබඳ හදිසි ආරක්ෂක අනතුරු ඇඟවීමකි',
    ta: 'உங்கள் MediSync கணக்கு குறித்த அவசர பாதுகாப்பு எச்சரிக்கை'
  };
  const banners = {
    en: '⚠️ High-Priority Security Notice',
    si: '⚠️ High-Priority Security Notice (ඉහළ ප්‍රමුඛතා ආරක්ෂක නිවේදනය)',
    ta: '⚠️ High-Priority Security Notice (உயர் முன்னுரிமை பாதுகாப்பு அறிவிப்பு)'
  };
  const bodies = {
    en: `
        <p>Hello <strong>${safeName}</strong>,</p>
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: #9f1239;">${banners[lang] || banners.en}</p>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">${safeIncidentDetails}</p>
        </div>
        <p>If you did not perform this action, please reset your password immediately and contact administrative security support.</p>
      `,
    si: `
        <p>ආයුබෝවන් <strong>${safeName}</strong>,</p>
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: #9f1239;">${banners[lang] || banners.en}</p>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">${safeIncidentDetails}</p>
        </div>
        <p>ඔබ මෙම ක්‍රියාව සිදු නොකළේ නම්, කරුණාකර වහාම ඔබගේ මුරපදය නැවත සකසා පරිපාලන ආරක්ෂක සහය අමතන්න.</p>
      `,
    ta: `
        <p>வணக்கம் <strong>${safeName}</strong>,</p>
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 700; color: #9f1239;">${banners[lang] || banners.en}</p>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">${safeIncidentDetails}</p>
        </div>
        <p>நீங்கள் இந்த செயலைச் செய்யவில்லை என்றால், உடனடியாக உங்கள் கடவுச்சொல்லை மீட்டமைத்து நிர்வாகப் பாதுகாப்பைத் தொடர்பு கொள்ளவும்.</p>
      `
  };
  const footers = {
    en: 'MediSync Security Operations Center &bull; Automated Intrusion Response',
    si: 'MediSync ආරක්ෂක මෙහෙයුම් මධ්‍යස්ථානය &bull; ස්වයංක්‍රීය අනවසර ප්‍රවේශ ප්‍රතිචාර පද්ධතිය',
    ta: 'MediSync பாதுகாப்பு செயல்பாட்டு மையம் &bull; தானியங்கி ஊடுருவல் தடுப்பு நடவடிக்கை'
  };

  const plainTexts = {
    en: `Hello ${name},\n\nA security event was detected on your MediSync account.\n\nDetails: ${incidentDetails || 'Unusual security event'}\n\nPlease review your security settings immediately.`,
    si: `ආයුබෝවන් ${name},\n\nඔබගේ MediSync ගිණුමේ ආරක්ෂක සිදුවීමක් හඳුනා ගන්නා ලදී.\n\nවිස්තර: ${incidentDetails || 'අසාමාන්‍ය ආරක්ෂක සිදුවීමක්'}\n\nකරුණාකර ඔබගේ ආරක්ෂක සැකසුම් වහාම පරීක්ෂා කරන්න.`,
    ta: `வணக்கம் ${name},\n\nஉங்கள் MediSync கணக்கில் பாதுகாப்பு சம்பவம் கண்டறியப்பட்டது.\n\nவிவரங்கள்: ${incidentDetails || 'பாதுகாப்பு சம்பவம்'}\n\nஉடனடியாக உங்கள் பாதுகாப்பு அமைப்புகளை மதிப்பாய்வு செய்யவும்.`
  };

  return sendMail({
    to,
    subject: subjects[lang] || subjects.en,
    text: plainTexts[lang] || plainTexts.en,
    html: renderBrandEmailHtml({
      title: titles[lang] || titles.en,
      preheader: preheaders[lang] || preheaders.en,
      bodyHtml: bodies[lang] || bodies.en,
      footerNote: footers[lang] || footers.en,
      lang
    })
  });
};

exports.__getCapturedTestEmails = () => Array.isArray(global.__MEDISYNC_CAPTURED_TEST_EMAILS)
  ? [...global.__MEDISYNC_CAPTURED_TEST_EMAILS]
  : [];

exports.__clearCapturedTestEmails = () => {
  global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
};
