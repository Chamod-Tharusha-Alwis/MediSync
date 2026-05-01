import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiCheckCircle, FiMapPin, FiHash } from 'react-icons/fi';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const DISTRICTS = ['Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Ratnapura','Kegalle','Trincomalee','Batticaloa','Ampara'];
const inputCls = "w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all backdrop-blur-sm";
const labelCls = "block text-sm font-semibold text-white/90 mb-1";

export default function HospitalRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [form, setForm] = useState({ name:'', type:'private', district:'', address:'', regNo:'', email:'', password:'', confirmPassword:'' });
  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await axios.post('/hospital/register', { name:form.name, type:form.type, district:form.district, address:form.address, regNo:form.regNo, email:form.email, password:form.password });
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #3d0c6e 0%, #6b21a8 50%, #a855f7 100%)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(4)].map((_,i) => (
          <motion.div key={i} className="absolute rounded-full opacity-5" style={{ width:`${200+i*80}px`, height:`${200+i*80}px`, background:'white', left:`${i*22}%`, bottom:`${i*15}%` }}
            animate={{ y:[0,-25,0] }} transition={{ duration:6+i, repeat:Infinity, ease:'easeInOut', delay:i*0.8 }} />
        ))}
      </div>
      <div className="relative z-10 w-full max-w-2xl mx-4 my-8">
        <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6 transition-colors"><FiArrowLeft /> Back to Home</Link>
          <div className="text-5xl mb-4">🏥</div>
          <h1 className="text-3xl font-bold text-white">Hospital Registration</h1>
          <p className="text-white/60 mt-2">Onboard your hospital to the MediSync platform</p>
        </motion.div>

        {step < 3 && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {[1,2].map(s => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step>=s?'bg-white text-purple-800':'bg-white/15 text-white/50'}`}>{s}</div>
                {s<2 && <div className={`w-16 h-0.5 ${step>s?'bg-white':'bg-white/20'}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-5">
              <h2 className="text-xl font-bold text-white">Hospital Information</h2>
              <div><label className={labelCls}>Hospital Name *</label>
                <div className="relative"><FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="text" value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. National Hospital" required /></div></div>
              <div><label className={labelCls}>Registration Number *</label>
                <div className="relative"><FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="text" value={form.regNo} onChange={set('regNo')} className={inputCls} placeholder="e.g. HOSP-2024-001" required /></div></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Type *</label>
                  <select value={form.type} onChange={set('type')} className={inputCls.replace('pl-10','pl-4')}>
                    <option value="private" className="text-gray-800">Private</option>
                    <option value="government" className="text-gray-800">Government</option></select></div>
                <div><label className={labelCls}>District *</label>
                  <div className="relative"><FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 z-10" />
                    <select value={form.district} onChange={set('district')} required className={inputCls}>
                      <option value="" className="text-gray-800">Select</option>
                      {DISTRICTS.map(d => <option key={d} value={d} className="text-gray-800">{d}</option>)}</select></div></div>
              </div>
              <div><label className={labelCls}>Address</label>
                <div className="relative"><FiMapPin className="absolute left-3 top-3 text-white/50" />
                  <textarea value={form.address} onChange={set('address')} rows={2}
                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 resize-none"
                    placeholder="Full address" /></div></div>
              <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                onClick={() => { if(!form.name||!form.regNo||!form.district){toast.error('Name, RegNo & District required');return;} setStep(2); }}
                className="w-full bg-white text-purple-800 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">Next →</motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.form key="s2" onSubmit={handleSubmit}
              initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-5">
              <h2 className="text-xl font-bold text-white">Admin Login Credentials</h2>
              <div><label className={labelCls}>Admin Email *</label>
                <div className="relative"><FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="admin@hospital.com" required /></div></div>
              <div><label className={labelCls}>Password *</label>
                <div className="relative"><FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type={showPw?'text':'password'} value={form.password} onChange={set('password')} className={`${inputCls} pr-12`} placeholder="Secure password" required />
                  <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">{showPw?<FiEyeOff/>:<FiEye/>}</button></div></div>
              <div><label className={labelCls}>Confirm Password *</label>
                <div className="relative"><FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type={showCPw?'text':'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className={`${inputCls} pr-12`} placeholder="Repeat password" required />
                  <button type="button" onClick={()=>setShowCPw(!showCPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">{showCPw?<FiEyeOff/>:<FiEye/>}</button></div></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setStep(1)} className="flex-1 py-3 rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all">← Back</button>
                <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }} type="submit" disabled={loading}
                  className="flex-1 bg-white text-purple-800 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 flex items-center justify-center transition-all">
                  {loading?<div className="w-5 h-5 border-2 border-purple-800/30 border-t-purple-800 rounded-full animate-spin"/>:'Register Hospital'}</motion.button>
              </div>
            </motion.form>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl text-center">
              <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:'spring', delay:0.2 }}>
                <FiCheckCircle className="w-20 h-20 text-green-400 mx-auto mb-6" /></motion.div>
              <h2 className="text-3xl font-bold text-white mb-3">Hospital Registered!</h2>
              <p className="text-white/70 mb-8">Your hospital is now on MediSync. Use your admin email and password to log in.</p>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }} onClick={()=>navigate('/')}
                className="bg-white text-purple-800 px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">Back to Home</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {step < 3 && (
          <p className="text-center text-white/50 text-sm mt-6">
            Already registered? <Link to="/" className="text-white font-semibold hover:underline">Go to Home</Link>
          </p>
        )}
      </div>
    </div>
  );
}
