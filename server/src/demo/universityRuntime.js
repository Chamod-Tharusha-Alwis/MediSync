'use strict';
// Dedicated real Express entry. Never imports the clinical app, its default
// Mongoose connection, provider modules, upload handlers, Redis or cron jobs.
const crypto = require('node:crypto');
const { createUniversityDemoPolicy, DISCLAIMER, CLUSTER } = require('../security/universityDemoPolicy');
const { directoryDto } = require('../security/publicDto');
const VERSION = 'university-readonly-v1';
const ACTOR_COLLECTION = Object.freeze({ admin:'admins', doctor:'doctors', patient:'patients', pharmacist:'pharmacystaffs', hospital_admin:'hospitals' });
const INFRA = Object.freeze(['universitysessions','universityaudits']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const displayName = (row, role) => [row.fullName,row.name].find(value=>typeof value==='string'&&value.trim()&&value.length<=120) || 'Synthetic '+role;
const fail = code => { throw Error('UNIVERSITY_RUNTIME_' + code); };
function admit(environment, manifest, bytes) {
  if (environment.NODE_ENV !== 'production' || environment.MEDISYNC_DEPLOYMENT_MODE !== 'university-demo' || environment.MEDISYNC_DEMO_CREDENTIALS_ROTATED !== 'true') fail('PRODUCTION_DEMO_CONTRACT_REQUIRED');
  for (const key of Object.keys(environment)) if (/^(?:MONGO_URI|MONGODB_URI|REDIS|VAULT|SMTP|RESEND|BREVO|TWILIO|CLOUDINARY|MEDISYNC_QA_|MEDISYNC_TEST_|SEED_TEST_PASSWORD|INTERNAL_API_KEY|JWT_SECRET)/i.test(key)) fail('CLINICAL_OR_QA_MATERIAL_FORBIDDEN');
  if (!bytes || hash(bytes) !== environment.MEDISYNC_DEMO_MANIFEST_SHA256 || JSON.stringify(JSON.parse(bytes)) !== JSON.stringify(manifest)) fail('REVIEWED_MANIFEST_REQUIRED');
  const policy = createUniversityDemoPolicy(manifest);
  const uri = environment.MEDISYNC_DEMO_ATLAS_URI;
  let url; try { url = new URL(uri); } catch (_) { fail('URI_REQUIRED'); }
  if (url.protocol !== 'mongodb+srv:' || url.hostname !== CLUSTER || url.port || url.hash || decodeURIComponent(url.pathname) !== '/' + manifest.database || decodeURIComponent(url.username) !== manifest.username || !url.password) fail('DEDICATED_ATLAS_IDENTITY_REQUIRED');
  const options = [...url.searchParams];
  if (options.length !== 3 || url.searchParams.getAll('tls').length !== 1 || url.searchParams.get('tls') !== 'true' || url.searchParams.get('authSource') !== 'admin' || url.searchParams.get('retryWrites') !== 'false' || options.some(([k]) => !['tls','authSource','retryWrites'].includes(k))) fail('TLS_AND_URI_OPTIONS_DENIED');
  const key = environment.MEDISYNC_DEMO_SIGNING_KEY;
  if (typeof key !== 'string' || !/^[a-f0-9]{64,128}$/.test(key) || new Set(key).size < 12) fail('DEDICATED_SIGNING_KEY_REQUIRED');
  let origin; try { origin = new URL(environment.MEDISYNC_DEMO_CLIENT_ORIGIN); } catch (_) { fail('HTTPS_ORIGIN_REQUIRED'); }
  if (origin.protocol !== 'https:' || origin.origin !== environment.MEDISYNC_DEMO_CLIENT_ORIGIN || origin.username || origin.password || origin.hostname.endsWith('.invalid')) fail('HTTPS_ORIGIN_REQUIRED');
  for (const actor of policy.config.actors) if (!policy.config.recordIds[ACTOR_COLLECTION[actor.role]]?.includes(actor.id)) fail('ACTOR_RECORD_MANIFEST_REQUIRED');
  return Object.freeze({ policy, origin: origin.origin, uri, key });
}
function canonical(req) {
  const raw = req.originalUrl;
  if (typeof raw !== 'string') return false;
  const pathname = raw.split('?')[0];
  if (/[%\\#\u0000-\u0020\u007f]/.test(pathname) || pathname.includes('//') || pathname.includes('/.')) return false;
  if (raw.includes('?') && (pathname !== '/api/public/health-stats' || Object.entries(req.query).some(([k,v])=>!['rangeDays','district','disease'].includes(k)||typeof v!=='string'||v.length>100))) return false;
  return true;
}
const ROUTES = Object.freeze([
  {method:'GET',path:'/api/health',scope:'ALLOWED_PUBLIC_READ'},
  {method:'GET',path:'/api/university/capabilities',scope:'ALLOWED_PUBLIC_READ'},
  ...['doctors','hospitals','pharmacies','health-stats'].map(name=>({method:'GET',path:'/api/public/'+name,scope:'ALLOWED_PUBLIC_READ'})),
  {method:'POST',path:'/api/auth/login',scope:'ALLOWED_SCOPED_SYNTHETIC_WRITE',purpose:'session/audit only'},
  {method:'POST',path:'/api/pharmacy/login',scope:'ALLOWED_SCOPED_SYNTHETIC_WRITE',purpose:'session/audit only'},
  {method:'POST',path:'/api/auth/logout',scope:'ALLOWED_SCOPED_SYNTHETIC_WRITE',purpose:'exact own session/audit only'},
  {method:'GET',path:'/api/university/workspace',scope:'ALLOWED_AUTHENTICATED_SYNTHETIC_READ'},
  {method:'*',path:'*',scope:'HELD_OR_DENIED'}
]);
function createUniversityApplication({ admission, store, express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs') }) {
  if (!admission?.policy || !store?.qualified) fail('QUALIFIED_STORE_REQUIRED');
  const { policy, origin, key } = admission, config = policy.config;
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use(require('helmet')());
  app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-MediSync-Mode':'university-demo','X-MediSync-API-Version':VERSION});
    if (!req.secure && req.path !== '/api/health') return res.status(426).json({error:'DEMO_HTTPS_REQUIRED'});
    if (!canonical(req)) return res.status(403).json({error:'DEMO_ROUTE_HELD'});
    if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({error:'DEMO_ORIGIN_DENIED'});
    if (req.headers.origin === origin) res.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Vary':'Origin','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Device-Fingerprint,X-Hardware-Model','Access-Control-Allow-Methods':'GET,POST'});
    const route = ROUTES.find(r=>r.method === req.method && r.path === req.path);
    if (req.method === 'OPTIONS' && ROUTES.some(r=>r.path===req.path && r.method!=='*')) return res.sendStatus(204);
    if (!route) return res.status(403).json({error:'DEMO_ROUTE_HELD',message:'This feature is unavailable in the read-only synthetic demonstration.'});
    if (!store.qualified) return res.status(503).json({error:'DEMO_STORAGE_UNAVAILABLE'}); next();
  });
  app.use(require('express-rate-limit')({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,validate:{trustProxy:false},message:{error:'DEMO_RATE_LIMIT'}}));
  app.use(express.json({limit:'8kb',strict:true}));
  const audit = (actor, action, session) => store.audit({actorId:actor.id,actorRole:actor.role,action},session);
  const identity = async (req) => {
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token) throw Object.assign(Error(),{status:401});
    let decoded; try { decoded = jwt.verify(token,key,{algorithms:['HS256'],issuer:VERSION,audience:config.namespace}); } catch (_) { throw Object.assign(Error(),{status:401}); }
    const session = await store.session(hash(token));
    if (!session || session.userId!==decoded.id || session.role!==decoded.role || session.isValid!==true || !(session.expiresAt instanceof Date) || session.expiresAt <= new Date()) throw Object.assign(Error(),{status:401});
    const actor = config.actors.find(a=>a.id===decoded.id && a.role===decoded.role);
    if (!actor) throw Object.assign(Error(),{status:401});
    const row = await store.actor(policy.loginLookup(actor.role,actor.email));
    try { policy.admitPersistedActor({id:actor.id,role:actor.role,model:policy.loginLookup(actor.role,actor.email).model},row); } catch (_) { throw Object.assign(Error(),{status:403}); }
    return {actor, tokenHash:hash(token), row};
  };
  app.get('/api/health',(_req,res)=>res.json({status:'ready',service:'medisync-university',version:VERSION}));
  app.get('/api/university/capabilities',(_req,res)=>res.json({version:VERSION,mode:'university-demo',disclaimer:DISCLAIMER,clinicalWrites:false,uploads:false,exports:false,registration:false,providers:false,sessionMinutes:15}));
  for (const [route,collection,kind] of [['doctors','doctors','doctor'],['hospitals','hospitals','hospital'],['pharmacies','pharmacies','pharmacy']]) app.get('/api/public/'+route,async(_req,res)=>res.json({data:(await store.publicRows(collection)).map(row=>directoryDto(kind,{...row,_id:hash(config.namespace+':'+collection+':'+String(row._id)),profilePicture:'',googleMapsUrl:'',website:''}))}));
  app.get('/api/public/health-stats',(_req,res)=>res.status(503).json({error:'PUBLIC_HEALTH_UNAVAILABLE',data:null,message:'Epidemiological statistics are not available in this read-only demonstration.'}));
  const login = async(req,res)=>{
    const b=req.body;
    if (!b || Object.keys(b).some(k=>!['email','password','role','loginType'].includes(k)) || typeof b.email!=='string' || typeof b.password!=='string' || b.password.length<12 || Buffer.byteLength(b.password,'utf8')>72 || (b.loginType && b.loginType!=='personal')) return res.status(401).json({error:'INVALID_DEMO_CREDENTIALS'});
    const role = req.path==='/api/pharmacy/login' ? 'pharmacist' : b.role;
    let lookup; try { lookup=policy.loginLookup(role,b.email); } catch (_) { return res.status(401).json({error:'INVALID_DEMO_CREDENTIALS'}); }
    const row=await store.actor(lookup);
    if (!row || typeof row.password!=='string' || !/^\$2[aby]\$(1[2-6])\$/.test(row.password) || !await bcrypt.compare(b.password,row.password)) return res.status(401).json({error:'INVALID_DEMO_CREDENTIALS'});
    let capability; try { capability=policy.admitPersistedActor({id:row._id,role,model:lookup.model},row); } catch (_) { return res.status(403).json({error:'DEMO_ACCOUNT_UNAVAILABLE'}); }
    const accessToken=jwt.sign({id:capability.id,role},key,{algorithm:'HS256',expiresIn:'15m',issuer:VERSION,audience:config.namespace,jwtid:crypto.randomUUID()});
    await store.createSessionAndAudit({userId:capability.id,role,tokenHash:hash(accessToken),isValid:true,expiresAt:new Date(Date.now()+900000)}, {actorId:capability.id,actorRole:role,action:'LOGIN'});
    return res.json({data:{accessToken,role,name:displayName(row,role)}});
  };
  app.post('/api/auth/login',login); app.post('/api/pharmacy/login',login);
  app.post('/api/auth/logout',async(req,res)=>{const auth=await identity(req);await store.revokeAndAudit(auth.tokenHash,{actorId:auth.actor.id,actorRole:auth.actor.role,action:'LOGOUT'});res.json({message:'Logged out'});});
  app.get('/api/university/workspace',async(req,res)=>{
    const auth=await identity(req);
    await audit(auth.actor,'READ_OWN_SYNTHETIC_WORKSPACE');
    res.json({data:{role:auth.actor.role,name:displayName(auth.row,auth.actor.role),isSynthetic:true,scope:'Authenticated account and public synthetic directory only',clinicalWrites:false}});
  });
  app.use((error,_req,res,_next)=>res.status(error.status===401?401:error.status===403?403:503).json({error:error.status===401?'DEMO_SESSION_EXPIRED':error.status===403?'DEMO_ACCESS_DENIED':'DEMO_SERVICE_UNAVAILABLE'}));
  return app;
}
module.exports = {VERSION, ACTOR_COLLECTION, INFRA, hash, admit, ROUTES, createUniversityApplication};
