const cron = require('node-cron');

/**
 * initCronJobs()
 *
 * Called from startServer() AFTER initializeVault() has set global.ENCRYPTION_KEY.
 * Models are required HERE (not at the top of the file) so that mongoose-field-encryption
 * sees a populated secret when each model's plugin is first registered.
 */
const initCronJobs = () => {
  // Ordinary API startup grants no background data mutation/delivery scope.
  if (process.env.MEDISYNC_BACKGROUND_JOBS_APPROVED !== 'true') return { status: 'held', stop() {} };
  const timezone = process.env.MEDISYNC_CRON_TIMEZONE || 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  const tasks = [], active = new Set();
  let stopping = false;
  const schedule = (expression, callback) => tasks.push(cron.schedule(expression, async () => {
    if (stopping) return;
    const work = Promise.resolve().then(callback); active.add(work);
    try { await work; } finally { active.delete(work); }
  }, { timezone }));
  // ── Deferred model imports ────────────────────────────────────────────────
  // These require()s are intentionally inside initCronJobs() — NOT at the top
  // of the file — so they execute only after global.ENCRYPTION_KEY is set.
  const Prescription = require('../models/Prescription');
  const Consultation = require('../models/Consultation');
  const Patient      = require('../models/Patient');
  const OTPSession   = require('../models/OTPSession');
  const SessionToken = require('../models/SessionToken');
  const emailService = require('./emailService');
  const { nicFilter } = require('../security/nicPersistence');
  if (process.env.MEDISYNC_CLINICAL_OUTBOX_APPROVED === 'true') {
    let reconciling = false;
    schedule('* * * * *', async () => {
      if (reconciling) return;
      reconciling = true;
      try { await require('../services/clinicalOutboxWorker').reconcileClinicalCommands(); }
      catch (_) { console.error('Clinical audit outbox reconciliation unavailable.'); }
      finally { reconciling = false; }
    });
  }
  // ─────────────────────────────────────────────────────────────────────────
  // Job 1 — Expire prescriptions (every hour)
  schedule('0 * * * *', async () => {
    try {
      const result = await Prescription.updateMany(
        { status: 'issued', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`Expired ${result.modifiedCount} prescriptions`);
      }
    } catch (error) {
      console.error('Prescription expiry job unavailable.');
    }
  });

  // Job 2 — Calculate patient risk scores (every 6 hours)
  schedule('0 */6 * * *', async () => {
    try {
      const patients = await Patient.find({});
      for (let patient of patients) {
        let score = 0;
        
        // Age risk
        if (patient.dateOfBirth) {
          const age = new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear();
          if (age >= 60) score += 15;
          else if (age >= 45 && age < 60) score += 8;
        }

        // Chronic conditions risk
        if (patient.chronicConditions && patient.chronicConditions.length > 0) {
          score += patient.chronicConditions.length * 20;
        }

        // Recent consultations risk
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const consultCount = await Consultation.countDocuments({
          ...nicFilter(patient.nic, { legacyFields: ['nicHash', 'patientNic_bi'], plainFields: ['patientNic'] }),
          createdAt: { $gte: thirtyDaysAgo }
        });
        if (consultCount > 2) {
          score += (consultCount - 2) * 10;
        }

        // Active prescriptions risk
        const activeRxCount = await Prescription.countDocuments({
          ...nicFilter(patient.nic, { legacyFields: ['nicHash', 'patientNic_bi'], plainFields: ['patientNic'] }),
          status: 'issued'
        });
        if (activeRxCount > 3) {
          score += (activeRxCount - 3) * 5;
        }

        // Determine level
        const riskLevel = score <= 30 ? 'low' : score <= 60 ? 'medium' : 'high';

        await Patient.updateOne(
          { _id: patient._id },
          { $set: { riskScore: score, riskLevel: riskLevel } }
        );
      }
      console.log(`Calculated risk scores for ${patients.length} patients`);
    } catch (error) {
      console.error('Patient risk job unavailable.');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Job 3 — Follow-up Appointment Reminders (daily at 08:00)
  //
  // Finds every Consultation whose followUpDate falls exactly 2 days from now
  // (i.e. midnight today+2 → midnight today+3) and emails a reminder to the
  // patient using the new sendReminderEmail template.
  //
  // Isolation: each patient email attempt is wrapped in its own try/catch so
  // that one bad record (missing email, SMTP failure) never kills the whole run.
  // ─────────────────────────────────────────────────────────────────────────
  schedule('0 8 * * *', async () => {
    if (process.env.MEDISYNC_REMINDER_DISPATCH_APPROVED !== 'true') return;
    console.log('[Cron] ── Follow-up Reminder Job started ──');
    try {
      // Build the target date window: exactly 2 days from today (midnight-to-midnight)
      const { createReminderDispatcher, existingReminderStore, followUpWindow } = require('../services/reminderDispatchService');
      const { start: twoDaysStart, end: twoDaysEnd } = followUpWindow(new Date(), timezone);

      console.log(`[Cron] Querying follow-ups between ${twoDaysStart.toISOString()} and ${twoDaysEnd.toISOString()}`);

      // Fetch non-synthetic consultations in the 2-day window; populate doctorId for the name
      const store = await existingReminderStore(require('mongoose').connection.db);
      const dispatch = createReminderDispatcher({ store });
      const consultations = await Consultation.find({
        followUpDate: { $gte: twoDaysStart, $lt: twoDaysEnd },
        isDemoData: { $ne: true },
        isSynthetic: { $ne: true },
      }).populate('doctorId', 'fullName').lean();

      console.log(`[Cron] Found ${consultations.length} follow-up(s) due in 2 days`);

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const consult of consultations) {
        try {
          // ── Look up the patient by NIC ──────────────────────────────────
          if (!consult.patientNic) {
            console.warn(`[Cron] Consultation ${consult._id}: missing patientNic — skipping`);
            skipped++;
            continue;
          }

          const patient = await require('../services/recipientLanguageService').clinicalPatientForRecord(consult, { PatientModel: Patient });
          if (!patient) {
            console.warn(`[Cron] Consultation ${consult._id}: patient not found — skipping`);
            skipped++;
            continue;
          }

          if (patient.isDemoData || patient.isSynthetic || /@test\.com$/i.test(String(patient.email || ''))) {
            skipped++;
            continue;
          }

          // ── Email address check (patient.email is NOT encrypted) ────────
          if (!patient.email) {
            console.warn(`[Cron] Consultation ${consult._id}: patient has no email on file — skipping`);
            skipped++;
            continue;
          }

          // ── Decrypt encrypted fields (fullName IS encrypted) ────────────
          if (typeof patient.decryptFieldsSync === 'function') {
            patient.decryptFieldsSync();
          }

          // ── Format the date as a readable string ───────────────────────
          const formattedDate = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            weekday: 'long',
            day:     '2-digit',
            month:   'long',
            year:    'numeric',
          }).format(new Date(consult.followUpDate));

          const doctorName = consult.doctorId?.fullName || 'Your Doctor';

          // ── Send reminder — uses the dedicated 2-day template ───────────
          const result = await dispatch({ appointmentId: String(consult._id), patientId: String(patient._id), scheduledFor: consult.followUpDate }, deliveryOptions => emailService.sendReminderEmail(
            patient.email,
            patient.fullName,
            formattedDate,
            doctorName,
            { ...require('../services/recipientLanguageService').languageOptionsForRecord('Patient', patient), ...deliveryOptions }
          ));

          if (result && result.providerAccepted) {
            sent++;
          } else {
            console.error('[Cron] Reminder not confirmed; inspect the durable dispatch journal without automatic retry.');
            failed++;
          }

        } catch (recordErr) {
          // Per-record isolation: log and continue — never abort the batch
          console.error('[Cron] Reminder held; patient binding or dispatch verification failed.');
          failed++;
        }
      }

      console.log(`[Cron] ── Follow-up Reminder Job complete — sent: ${sent}, skipped: ${skipped}, failed: ${failed} ──`);

    } catch (jobErr) {
      console.error('[Cron] Follow-up reminder job unavailable; no automatic retry.');
    }
  });

  // Job 4 — Clean expired OTP sessions (every 30 min)
  schedule('*/30 * * * *', async () => {
    try {
      const result = await OTPSession.deleteMany({ expiresAt: { $lt: new Date() } });
      if (result.deletedCount > 0) {
        console.log(`Cleaned ${result.deletedCount} expired OTP sessions`);
      }
    } catch (error) {
      console.error('Expired OTP cleanup unavailable.');
    }
  });
  // Manual and scheduled detection share exactly the same eligibility policy.
  schedule('0 2 * * *', async () => {
    try { await require('../services/surveillanceService').runAnalysis({mode:'real'}); }
    catch (_) { console.error('[Cron] Surveillance unavailable; no broadcast performed.'); }
  });
  // Job 6: Session Expiry — mark inactive sessions as expired (every 15 min)
  schedule('*/15 * * * *', async () => {
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const result = await SessionToken.updateMany(
        { isValid: true, lastUsed: { $lt: fifteenMinAgo } },
        { $set: { isValid: false, logoutAt: new Date(), expiredAt: new Date() } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[Cron] Expired ${result.modifiedCount} inactive sessions`);
      }
    } catch (err) {
      console.error('[Cron] Session expiry unavailable.');
    }
  });
  return { status: 'scheduled', timezone, async stop() {
    stopping = true;
    const stopped = await Promise.allSettled(tasks.map(async task => { await task?.stop?.(); await task?.destroy?.(); }));
    await Promise.allSettled([...active]);
    if (stopped.some(result => result.status === 'rejected')) throw new Error('BACKGROUND_SHUTDOWN_FAILED');
  } };
};

module.exports = initCronJobs;
