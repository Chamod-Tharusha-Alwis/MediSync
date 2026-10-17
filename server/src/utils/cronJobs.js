const cron = require('node-cron');

/**
 * initCronJobs()
 *
 * Called from startServer() AFTER initializeVault() has set global.ENCRYPTION_KEY.
 * Models are required HERE (not at the top of the file) so that mongoose-field-encryption
 * sees a populated secret when each model's plugin is first registered.
 */
const initCronJobs = () => {
  // ── Deferred model imports ────────────────────────────────────────────────
  // These require()s are intentionally inside initCronJobs() — NOT at the top
  // of the file — so they execute only after global.ENCRYPTION_KEY is set.
  const Prescription = require('../models/Prescription');
  const Consultation = require('../models/Consultation');
  const Patient      = require('../models/Patient');
  const OTPSession   = require('../models/OTPSession');
  const SessionToken = require('../models/SessionToken');
  const emailService = require('./emailService');
  // ─────────────────────────────────────────────────────────────────────────
  // Job 1 — Expire prescriptions (every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await Prescription.updateMany(
        { status: 'issued', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`Expired ${result.modifiedCount} prescriptions`);
      }
    } catch (error) {
      console.error('Error in expire prescriptions cron job:', error);
    }
  });

  // Job 2 — Calculate patient risk scores (every 6 hours)
  cron.schedule('0 */6 * * *', async () => {
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
          patientNic: patient.nic,
          createdAt: { $gte: thirtyDaysAgo }
        });
        if (consultCount > 2) {
          score += (consultCount - 2) * 10;
        }

        // Active prescriptions risk
        const activeRxCount = await Prescription.countDocuments({
          patientNic: patient.nic,
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
      console.error('Error in risk score cron job:', error);
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
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] ── Follow-up Reminder Job started ──');
    try {
      // Build the target date window: exactly 2 days from today (midnight-to-midnight)
      const twoDaysStart = new Date();
      twoDaysStart.setHours(0, 0, 0, 0);
      twoDaysStart.setDate(twoDaysStart.getDate() + 2);   // start of day+2

      const twoDaysEnd = new Date(twoDaysStart);
      twoDaysEnd.setDate(twoDaysEnd.getDate() + 1);       // start of day+3 (exclusive upper bound)

      console.log(`[Cron] Querying follow-ups between ${twoDaysStart.toISOString()} and ${twoDaysEnd.toISOString()}`);

      // Fetch non-synthetic consultations in the 2-day window; populate doctorId for the name
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

          const patient = await Patient.findOne({ nic: consult.patientNic });
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
            weekday: 'long',
            day:     '2-digit',
            month:   'long',
            year:    'numeric',
          }).format(new Date(consult.followUpDate));

          const doctorName = consult.doctorId?.fullName || 'Your Doctor';

          // ── Send reminder — uses the dedicated 2-day template ───────────
          const result = await emailService.sendReminderEmail(
            patient.email,
            patient.fullName,
            formattedDate,
            doctorName
          );

          if (result && result.providerAccepted) {
            sent++;
          } else {
            console.error(`[Cron] Reminder email FAILED for consultation ${consult._id}: ${result?.errorCode || result?.error}`);
            failed++;
          }

        } catch (recordErr) {
          // Per-record isolation: log and continue — never abort the batch
          console.error(`[Cron] Error processing consultation ${consult._id}: ${recordErr.message}`);
          failed++;
        }
      }

      console.log(`[Cron] ── Follow-up Reminder Job complete — sent: ${sent}, skipped: ${skipped}, failed: ${failed} ──`);

    } catch (jobErr) {
      console.error('[Cron] Follow-up Reminder Job fatal error:', jobErr.message);
    }
  });

  // Job 4 — Clean expired OTP sessions (every 30 min)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await OTPSession.deleteMany({ expiresAt: { $lt: new Date() } });
      if (result.deletedCount > 0) {
        console.log(`Cleaned ${result.deletedCount} expired OTP sessions`);
      }
    } catch (error) {
      console.error('Error in clean OTPs cron job:', error);
    }
  });
  // Manual and scheduled detection share exactly the same eligibility policy.
  cron.schedule('0 2 * * *', async () => {
    try { await require('../services/surveillanceService').runAnalysis({mode:'real'}); }
    catch (_) { console.error('[Cron] Surveillance unavailable; no broadcast performed.'); }
  });
  // Job 6: Session Expiry — mark inactive sessions as expired (every 15 min)
  cron.schedule('*/15 * * * *', async () => {
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
      console.error('[Cron] Session expiry error:', err.message);
    }
  });
};

module.exports = initCronJobs;
