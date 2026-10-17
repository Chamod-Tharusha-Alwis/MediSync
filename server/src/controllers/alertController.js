const OutbreakAlert = require('../models/OutbreakAlert');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const emailService = require('../utils/emailService');
const { verifyToken } = require('../utils/internalAuth');

// Legacy push endpoints cannot bypass provenance or administrator review.
exports.triggerAlert = async (req, res) => {
  if (!verifyToken(req.headers['x-internal-key'])) return res.status(403).json({error:'Forbidden'});
  try { res.status(202).json(await require('../services/surveillanceService').runAnalysis({mode:'real'})); }
  catch (_) { res.status(503).json({error:'Surveillance unavailable.'}); }
};
exports.broadcastAlert = async (req, res) => res.status(409).json({error:'External outbreak delivery is disabled pending clinical governance approval.'});

exports.getActiveAlerts = async (req, res) => {
  try {
    const service=require('../services/surveillanceService');
    const reviewer=['admin','super_admin','superadmin'].includes(req.user?.role);
    const simulation=req.query?.mode==='simulation';
    if(simulation && !await service.canReviewSimulation(req.user)) return res.status(403).json({error:'Synthetic reviewer required.'});
    // Clinical public delivery remains gated; reviewers see only verified signals.
    if(!reviewer)return res.json({data:[]});
    const alerts = await OutbreakAlert.find({surveillancePolicy:service.POLICY,isSimulation:simulation,status:{$in:['Active','Pending']}}).select('-sourceConsultationIds').sort({createdAt:-1});
    res.json({ data: alerts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts', details: error.message });
  }
};

exports.getDiseaseTrends = async (req, res) => {
  try {
    const {cases}=await require('../services/surveillanceService').loadCases({mode:'real'});
    const counts=new Map();
    for(const c of cases)if(!req.query.district || c.district===req.query.district)counts.set(c.diseaseId,(counts.get(c.diseaseId)||0)+1);
    res.json({data:[...counts].map(([_id,count])=>({_id,count})).sort((a,b)=>b.count-a.count).slice(0,10)});
  } catch (_) { res.status(503).json({error:'Trends unavailable.'}); }
};

exports.getLatestBroadcast = async (req, res) => {
  try {
    const BroadcastMessage = require('../models/BroadcastMessage');
    const latest = null; // Legacy broadcasts have no verified audience/provenance; delivery is gated.
    res.json({ data: latest });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest broadcast', details: error.message });
  }
};

exports.verifyAlertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedbackStatus } = req.body; // 'confirmed' or 'false_positive'
    
    if (!['confirmed', 'false_positive'].includes(feedbackStatus)) {
      return res.status(400).json({ error: 'Invalid feedback status' });
    }

    const alert = await OutbreakAlert.findById(id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const service=require('../services/surveillanceService');
    if(!['admin','super_admin','superadmin'].includes(req.user?.role))return res.status(403).json({error:'Administrator review required.'});
    if(service.synthetic(alert) && !await service.canReviewSimulation(req.user))return res.status(403).json({error:'Synthetic reviewer required.'});
    if(alert.surveillancePolicy!==service.POLICY)return res.status(409).json({error:'Legacy provenance review required.'});
    alert.feedbackStatus = feedbackStatus;
    // Auto-resolve if marked as false_positive
    if (feedbackStatus === 'false_positive') {
      alert.status = 'Resolved';
    }
    await alert.save();

    // Do not train a live model from simulation or unvalidated review feedback.
    res.json({ message: 'Alert feedback recorded successfully', data: alert });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record feedback', details: error.message });
  }
};
