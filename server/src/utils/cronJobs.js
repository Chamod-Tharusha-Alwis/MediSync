const cron = require('node-cron');
const Prescription = require('../models/Prescription');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const OTPSession = require('../models/OTPSession');
const emailService = require('./emailService');

const initCronJobs = () => {
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

  // Job 3 — Follow-up reminders (daily 8am)
  cron.schedule('0 8 * * *', async () => {
    try {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const tomorrowMidnight = new Date(todayMidnight);
      tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
      const dayAfterMidnight = new Date(tomorrowMidnight);
      dayAfterMidnight.setDate(dayAfterMidnight.getDate() + 1);

      const consultations = await Consultation.find({
        isFollowUpRequired: true,
        followUpDate: { $gte: tomorrowMidnight, $lt: dayAfterMidnight },
        patientNic: { $exists: true }
      }).populate('doctorId', 'fullName');

      let reminderCount = 0;
      for (let consult of consultations) {
        const patient = await Patient.findOne({ nic: consult.patientNic });
        if (patient && patient.contactInfo && patient.contactInfo.email) {
          const dateStr = new Intl.DateTimeFormat('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }).format(consult.followUpDate);
          
          await emailService.sendFollowUpReminder(
            patient.contactInfo.email,
            patient.fullName,
            consult.doctorId ? consult.doctorId.fullName : 'Your Doctor',
            dateStr
          );
          reminderCount++;
        }
      }
      console.log(`Sent ${reminderCount} follow-up reminders`);
    } catch (error) {
      console.error('Error in follow-up reminders cron job:', error);
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
};

module.exports = initCronJobs;
