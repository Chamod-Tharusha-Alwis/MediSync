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
      otp: options.otpCode || (otpMatch ? otpMatch[1] : null),
      hasAttachment: Boolean(options.attachments && options.attachments.length > 0),
      capturedAt: new Date().toISOString(),
    });
    if (process.env.MEDISYNC_TEST_MODE === 'true') {
      const capturedOtp = options.otpCode || (otpMatch ? otpMatch[1] : null);
      if (capturedOtp) console.log(`[QA_EMAIL_OTP] ${capturedOtp}`);
    }
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
exports.sendOTPEmail = async (to, name, otp) => {
  return sendMail({
    from: getResendFromAddress(),
    to,
    timeSensitive: true,
    isOtp: true,
    subject: 'MediSync — Your Secure Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name || 'User'},</p>
          <p style="font-size: 16px; color: #333333;">Your secure One-Time Password (OTP) is:</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px; text-align: center;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0D3B66;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold;">Valid for 10 minutes</p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">Never share this OTP with anyone. If you didn't request this, please contact support immediately.</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 2. TEMPORARY PASSWORD EMAIL
// -----------------------------------------------------------------------------
exports.sendTempPasswordEmail = async (to, name, tempPassword, loginUrl, hospitalName) => {
  return sendMail({
    from: getResendFromAddress(),
    to,
    subject: 'MediSync — Your Hospital Account Access',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${hospitalName} - MediSync Access</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name},</p>
          <p style="font-size: 16px; color: #333333;">An account has been created or updated for you to access ${hospitalName} via the MediSync platform. Your temporary credentials are:</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #555555;">Email / Login ID: <strong>${to}</strong></p>
            <p style="margin: 0; font-size: 14px; color: #555555;">Temporary Password: <strong style="font-family: monospace; font-size: 16px;">${tempPassword}</strong></p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Log In Now</a>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold; text-align: center;">You must change your password on first login.</p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 3. WELCOME EMAIL
// -----------------------------------------------------------------------------
exports.sendWelcomeEmail = async (to, name, role) => {
  return sendMail({
    from: getResendFromAddress(),
    to,
    subject: 'Welcome to MediSync',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name},</p>
          <p style="font-size: 16px; color: #333333;">Welcome to Sri Lanka's Digital Health Platform.</p>
          <div style="margin: 20px 0; text-align: center;">
            <span style="display: inline-block; padding: 6px 12px; background-color: #e3f2fd; color: #1565C0; border-radius: 16px; font-size: 14px; font-weight: bold; text-transform: uppercase;">Role: ${String(role || 'user').replace('_', ' ')}</span>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk'}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Access Your Portal</a>
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
exports.sendPrescriptionEmail = async (patientEmail, patientName, pdfBuffer, securePassword) => {
  if (!patientEmail || !pdfBuffer) {
    return {
      success: false,
      providerAccepted: false,
      deliveryConfirmed: false,
      errorCode: 'missing_parameters',
      error: 'Missing recipient email or PDF buffer',
    };
  }

  return sendMail({
    from: getResendFromAddress(),
    to: patientEmail,
    subject: 'MediSync — Your Secure E-Prescription',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${patientName || 'Patient'},</p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">
            Your recent E-Prescription is attached. To ensure your medical privacy, the PDF is locked.
            Please enter your secure 8-character PDF Key: <strong style="font-family: monospace; font-size: 18px; color: #0D3B66; letter-spacing: 1px;">${securePassword || 'N/A'}</strong> to open it.
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
exports.sendReminderEmail = async (patientEmail, patientName, formattedDate, doctorName) => {
  if (!patientEmail) {
    return {
      success: false,
      providerAccepted: false,
      deliveryConfirmed: false,
      errorCode: 'invalid_recipient',
      error: 'No email address',
    };
  }

  return sendMail({
    from: getResendFromAddress(),
    to: patientEmail,
    subject: `MediSync — Appointment Reminder: ${formattedDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0D3B66 0%, #1a5fa8 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${patientName || 'Patient'}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">This is a reminder that you have a scheduled consultation with <strong>Dr. ${doctorName || 'Your Doctor'}</strong> on <strong>${formattedDate}</strong>.</p>
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
  dispensedAt
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

  return sendMail({
    from: getResendFromAddress(),
    to: patientEmail,
    subject: 'MediSync — Your Medication Has Been Dispensed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${patientName || 'Patient'}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">Your medication has been dispensed at <strong>${pharmacyName || 'a MediSync Pharmacy'}</strong> by <strong>${dispenserName || 'Pharmacist'}</strong> at ${dispensedAt}.</p>
          <p>Medications: <strong>${medications}</strong></p>
        </div>
      </div>
    `,
  });
};

// -----------------------------------------------------------------------------
// 9. SECURITY ANOMALY & RECOVERY EMAILS
// -----------------------------------------------------------------------------
exports.sendAnomalyEmail = async (email, deviceModel, location) => {
  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: 'MediSync — Untrusted Login Attempt Detected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Security Alert</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>We detected a login attempt from an unrecognized device: <strong>${deviceModel || 'Unknown Device'}</strong> (${location || 'Unknown Location'}).</p>
        </div>
      </div>
    `,
  });
};

exports.sendRecoveryEmail = async (email, link, purpose) => {
  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: `MediSync — Account Recovery: ${purpose}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Account Recovery</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>You requested account recovery for: <strong>${purpose}</strong></p>
          <p>Click the link below to proceed:</p>
          <a href="${link}" style="background-color: #3B82F6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Recover Account</a>
        </div>
      </div>
    `,
  });
};

exports.sendDeviceRemovedEmail = async (email, deviceModel) => {
  return sendMail({
    from: getResendFromAddress(),
    to: email,
    subject: 'MediSync — Trusted Device Removed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Device Removed</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>A device was removed from your trusted devices: <strong>${deviceModel || 'Unknown Device'}</strong>.</p>
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
  isTrusted = true
) => {
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
  const subject = isNewDevice
    ? `🚨 MediSync Security Alert: Login from NEW Unrecognized Device (${device || 'Unknown Device'})`
    : `MediSync - ${isHospital ? 'Hospital' : 'New'} Login Notification`;

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

exports.__getCapturedTestEmails = () => Array.isArray(global.__MEDISYNC_CAPTURED_TEST_EMAILS)
  ? [...global.__MEDISYNC_CAPTURED_TEST_EMAILS]
  : [];

exports.__clearCapturedTestEmails = () => {
  global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
};

