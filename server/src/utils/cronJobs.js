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

      // Fetch consultations in the 2-day window; populate doctorId for the name
      const consultations = await Consultation.find({
        followUpDate: { $gte: twoDaysStart, $lt: twoDaysEnd },
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
            console.warn(`[Cron] Consultation ${consult._id}: patient not found for NIC ${consult.patientNic} — skipping`);
            skipped++;
            continue;
          }

          // ── Email address check (patient.email is NOT encrypted) ────────
          if (!patient.email) {
            console.warn(`[Cron] Patient ${consult.patientNic}: no email on file — skipping`);
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

          // ── Send reminder — uses the new dedicated 2-day template ───────
          const result = await emailService.sendReminderEmail(
            patient.email,
            patient.fullName,
            formattedDate,
            doctorName
          );

          if (result.success) {
            sent++;
          } else {
            console.error(`[Cron] Reminder email FAILED for ${patient.email}: ${result.error}`);
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
  // Job 5 — Automated outbreak detection (daily at 2am)
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Starting daily outbreak detection job...');
    try {
      const axios = require('axios');
      const OutbreakAlert = require('../models/OutbreakAlert');
      const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001';

      const now = new Date();
      const sevenDaysAgo  = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
      const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);

      // Fetch & auto-decrypt consultations for last 30 days
      const consultations = await Consultation.find({ createdAt: { $gte: thirtyDaysAgo } });

      if (consultations.length === 0) {
        console.log('[Cron] No consultation data — skipping outbreak analysis.');
        return;
      }

      // Aggregate into buckets: district + disease → recent vs baseline counts
      const buckets = {};
      for (const c of consultations) {
        const disease  = c.diagnosis || c.icdDescription || 'Unknown';
        const district = c.district  || 'Colombo';
        const key      = `${district}||${disease}`;
        const isRecent = new Date(c.createdAt) >= sevenDaysAgo;

        if (!buckets[key]) {
          buckets[key] = { district, disease, last_7_days: 0, prev_23_days: 0 };
        }
        if (isRecent) buckets[key].last_7_days++;
        else          buckets[key].prev_23_days++;
      }

      const payload = Object.values(buckets).map(b => ({
        district:              b.district,
        disease:               b.disease,
        last_7_days_count:     b.last_7_days,
        previous_baseline_avg: parseFloat((b.prev_23_days / 3.29).toFixed(2))
      }));

      const { generateToken } = require('./internalAuth');
      const { data: mlResult } = await axios.post(
        `${ML_ENGINE_URL}/analyze-realtime`,
        { data: payload },
        { 
          timeout: 30000,
          headers: { 'x-internal-key': generateToken() }
        }
      );

      console.log(`[Cron] ML result — anomaly: ${mlResult.anomaly}, disease: ${mlResult.disease}, spike: ${mlResult.spike_percentage}%`);

      // Persist alert and broadcast if anomaly detected
      if (mlResult.anomaly) {
        // --- DB SAVE (own try/catch so email still fires if this fails) ---
        try {
          const severityMap = { 'Normal': 'Low', 'Low': 'Low', 'Medium': 'Moderate', 'High': 'High' };
          const mappedSeverity = severityMap[mlResult.risk_level] || (mlResult.spike_percentage >= 600 ? 'Critical' : 'High');

          await OutbreakAlert.create({
            disease:        mlResult.disease || 'Unknown',
            location:       mlResult.district || 'Nationwide',
            affectedCount:  mlResult.last_7_days_count || 0,
            severity:       mappedSeverity,
            status:         'Active',
            message:        `[Auto] Outbreak: ${mlResult.disease} in ${mlResult.district}. Spike: +${mlResult.spike_percentage}%`
          });
          console.log(`[Cron] ✅ Outbreak alert saved: ${mlResult.disease} in ${mlResult.district}`);
        } catch (dbErr) {
          console.error('[Cron] Alert DB save failed:', dbErr.message);
        }

        // --- MASS EMAIL TRIGGER (own try/catch — independent of DB save) ---
        if (mlResult.risk_level === 'Medium' || mlResult.risk_level === 'High') {
          try {
            console.log(`[Cron] ${mlResult.risk_level} risk outbreak detected! Triggering mass alert.`);
            const Patient = require('../models/Patient');
            const Doctor = require('../models/Doctor');
            const PharmacyStaff = require('../models/PharmacyStaff');
            const Hospital = require('../models/Hospital');
            const emailService = require('./emailService');

            const [patients, doctors, pharmacists, hospitals] = await Promise.all([
              Patient.find({}).select('email contactInfo'),
              Doctor.find({}).select('email'),
              PharmacyStaff.find({}).select('email'),
              Hospital.find({}).select('email')
            ]);

            const allEmails = [
              ...patients.map(p => p.email || p.contactInfo?.email),
              ...doctors.map(d => d.email),
              ...pharmacists.map(p => p.email),
              ...hospitals.map(h => h.email)
            ].filter(e => e);

            await emailService.sendMassOutbreakAlert(
              allEmails,
              mlResult.disease,
              mlResult.district,
              mlResult.risk_level,
              mlResult.spike_percentage
            );
            console.log(`[Cron] ✅ Mass alert sent to ${allEmails.length} users`);
          } catch (emailErr) {
            console.error('[Cron] Mass email trigger failed:', emailErr.message);
          }

          // --- BROADCAST RECORD (own try/catch) ---
          try {
            const BroadcastMessage = require('../models/BroadcastMessage');
            const broadcast = new BroadcastMessage({
              title: `CRITICAL OUTBREAK ALERT`,
              message: `A ${mlResult.risk_level} risk outbreak of ${mlResult.disease} has been detected in ${mlResult.district} (+${mlResult.spike_percentage}% spike). Please take immediate precautions.`,
              targetRole: 'all',
              targetDistrict: mlResult.district,
              sentBy: null,
              sentAt: new Date()
            });
            await broadcast.save();
            console.log('[Cron] ✅ BroadcastMessage saved');
          } catch (broadcastErr) {
            console.error('[Cron] Broadcast save failed:', broadcastErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Cron] Daily outbreak detection error:', err.message);
    }
  });
};

module.exports = initCronJobs;
