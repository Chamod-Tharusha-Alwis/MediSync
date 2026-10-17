const { dispense, DispenseError } = require('../services/dispensingService');
const AuditLog = require('../models/AuditLog');
const Patient = require('../models/Patient');
const emailService = require('../utils/emailService');
const crypto = require('crypto');

const handler = otc => async (req, res) => {
  try {
    const {receipt,replay} = await dispense({user:req.user,body:req.body,otc,prescriptionRef:req.params?.id,
      idempotencyKey:req.headers['idempotency-key']});
    // Capped audit collections cannot participate in the dispensing transaction.
    // The receipt's durable audit event is authoritative; this is an extra projection.
    if (!replay) {
      await AuditLog.create({actorId:receipt.audit.actorId,actorRole:req.user.role,action:receipt.audit.action,
        accessedNic:receipt.patientNic,deviceModel:req.headers['user-agent'] || 'API'}).catch(()=>{});
      if (process.env.NODE_ENV === 'production' && process.env.MEDISYNC_TEST_MODE !== 'true') {
        const nicHash = crypto.createHash('sha256').update(receipt.patientNic).digest('hex');
        Patient.findOne({$or:[{nic:receipt.patientNic},{patientNic_bi:nicHash}]}).then(patient => {
          if (patient?.email) return emailService.sendDispenseNotificationEmail(patient.email,patient.fullName,'MediSync Pharmacy',
            String(receipt.staffId),receipt.items.map(i=>`${i.drugName} (Qty: ${i.quantityDispensed} ${i.unit})`).join(', '),new Date().toLocaleString('en-GB'));
        }).catch(()=>{});
      }
    }
    return res.status(replay?200:201).json({message:'Dispensed successfully',replayed:replay,
      data:{receiptNumber:receipt.receiptNumber,prescriptionId:receipt.prescriptionId,medicationCount:receipt.items.length}});
  } catch (e) {
    const known = e instanceof DispenseError;
    return res.status(known?e.status:503).json({error:known?e.message:'Dispensing could not be completed safely.',
      code:known?e.code:'TRANSACTION_FAILED'});
  }
};
exports.dispense = handler(false);
exports.dispenseOTC = handler(true);
