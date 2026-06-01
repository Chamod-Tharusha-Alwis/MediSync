import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Calendar, Clock, User, X, Download, 
  LayoutDashboard, Plus, Users, ChevronRight 
} from 'lucide-react';
import { FiUser } from 'react-icons/fi';
import Sidebar from '../../components/common/Sidebar';
import api from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';

// ─── PDF Print Helper ────────────────────────────────────────────────────────
const downloadPrescriptionPDF = (consultation) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return toast.error('Pop-up blocked. Please allow pop-ups to print/download PDF.');

  const prescriptionsHTML = consultation.prescriptions && consultation.prescriptions.length > 0
    ? consultation.prescriptions.map(rx => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; font-weight: bold; color: #1e293b;">${rx.drugName}</td>
          <td style="padding: 12px; color: #475569;">${rx.dosage}</td>
          <td style="padding: 12px; color: #475569;">${rx.frequency}</td>
          <td style="padding: 12px; color: #475569;">${rx.durationDays} Days</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">No medicines prescribed.</td></tr>';

  const html = `
    <html>
      <head>
        <title>E-Prescription - ${consultation.patientName}</title>
        <style>
          body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 40px; color: #1e293b; background-color: #ffffff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { font-size: 24px; font-weight: 800; color: #0d9488; }
          .brand span { font-weight: 400; color: #64748b; }
          .meta-info { text-align: right; font-size: 14px; color: #64748b; line-height: 1.5; }
          .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; tracking-wider; color: #0d9488; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px; }
          .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-block p { margin: 4px 0; font-size: 14px; }
          .info-block strong { color: #0f172a; }
          .rx-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .rx-table th { background: #f8fafc; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
          .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
          .verified-badge { color: #0d9488; font-weight: bold; display: flex; align-items: center; gap: 4px; margin-top: 5px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">MediSync <span>E-Prescription Hub</span></div>
            <div class="verified-badge">✓ Verified Medical Professional Session</div>
          </div>
          <div class="meta-info">
            <strong>Date:</strong> ${new Date(consultation.createdAt).toLocaleDateString()}<br/>
            <strong>Rx ID:</strong> ${consultation.prescriptions?.[0]?.prescriptionId || 'N/A'}<br/>
            <strong>Ref:</strong> CON-${consultation._id.slice(-8).toUpperCase()}
          </div>
        </div>

        <div class="grid">
          <div class="info-block">
            <div class="section-title">Patient Demographics</div>
            <p><strong>Name:</strong> ${consultation.patientName}</p>
            <p><strong>NIC:</strong> ${consultation.patientNic}</p>
            <p><strong>Age / Gender:</strong> ${consultation.patientDetails?.age || 'N/A'} yrs / ${consultation.patientDetails?.gender || 'N/A'}</p>
          </div>
          <div class="info-block" style="text-align: right;">
            <div class="section-title">Consulting Doctor</div>
            <p><strong>Doctor ID:</strong> DR-${consultation.doctorId.slice(-6).toUpperCase()}</p>
            <p><strong>Specialization:</strong> General Practitioner / Consultant</p>
          </div>
        </div>

        <div style="margin-bottom: 30px;">
          <div class="section-title">Clinical Assessment</div>
          <p style="font-size: 14px; margin: 6px 0;"><strong>Symptoms:</strong> ${consultation.symptoms?.join(', ') || 'None reported'}</p>
          <p style="font-size: 14px; margin: 6px 0;"><strong>Diagnosis:</strong> ${consultation.diagnosis} ${consultation.icdCode ? `(ICD-10: ${consultation.icdCode})` : ''}</p>
          ${consultation.notes ? `<p style="font-size: 14px; margin: 6px 0;"><strong>Clinical Notes:</strong> ${consultation.notes}</p>` : ''}
        </div>

        <div>
          <div class="section-title">Rx / Prescribed Medication</div>
          <table class="rx-table">
            <thead>
              <tr>
                <th>Drug Name</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${prescriptionsHTML}
            </tbody>
          </table>
        </div>

        <div class="footer">
          This is an electronically generated prescription secured by MediSync Cryptographic Identity Verification.<br/>
          MediSync Platform © 2026. All clinical records are encrypted.
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PatientDirectory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('All Time'); // 1h | 3h | 6h | 12h | 24h | All Time
  const [selected, setSelected] = useState(null);

  const _pdWsMode    = localStorage.getItem('workspaceMode') || 'personal';
  const _pdIsPersonal = _pdWsMode !== 'hospital';

  const menuItems = [
    { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'New Consultation',  path: '/doctor/consultation/new', icon: Plus },
    { label: 'Patient Directory', path: '/doctor/patients',          icon: Users },
    ...(_pdIsPersonal ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];

  const doctorName = localStorage.getItem('userName') || 'Doctor';

  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const res = await api.get('/doctor/patients-directory');
        setData(res.data.data || []);
      } catch (err) {
        toast.error('Failed to load patient records.');
      } finally {
        setLoading(false);
      }
    };
    fetchDirectory();
  }, []);

  // ─── Filtering Logic ───────────────────────────────────────────────────────
  const getFilterTimeLimit = () => {
    if (timeFilter === 'All Time') return null;
    const hours = parseInt(timeFilter);
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  };

  const filteredData = data.filter(item => {
    // Search filter
    const matchesSearch = 
      item.patientNic.toLowerCase().includes(search.toLowerCase()) ||
      item.patientName.toLowerCase().includes(search.toLowerCase());

    // Time filter
    const timeLimit = getFilterTimeLimit();
    const matchesTime = !timeLimit || new Date(item.createdAt) >= timeLimit;

    return matchesSearch && matchesTime;
  });

  return (
    <div className="flex bg-[#080d1a] min-h-screen text-slate-200 font-sans">
      {/* Sidebar Layout */}
      <Sidebar menuItems={menuItems} title="Doctor Portal" themePrefix="doctor" userName={`Dr. ${doctorName}`} userRole="Verified Doctor" />

      <main className="flex-1 lg:ml-64 p-6 lg:p-10 transition-all duration-300 space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tight">
            Patient Directory & E-Prescriptions
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Access secure patient electronic prescription sheets and visit logs.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* NIC Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Search by Patient Name or NIC..."
              className="glass-input pl-11 w-full text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Time Filter Toggle Group */}
          <div className="flex bg-slate-900/60 border border-white/5 rounded-xl p-1 shrink-0 overflow-x-auto custom-scrollbar">
            {['1h', '3h', '6h', '12h', '24h', 'All Time'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none ${
                  timeFilter === tf
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                    : 'text-slate-400 border border-transparent hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Directory List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-20 text-slate-500 animate-pulse">Loading directory records...</div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/20 border border-dashed border-white/5 rounded-2xl text-slate-500">
              No matching consult or prescription records found.
            </div>
          ) : (
            filteredData.map((item, idx) => {
              const rxCount = item.prescriptions?.length || 0;
              const latestRx = item.prescriptions?.[0];
              const dateObj = new Date(item.createdAt);
              const formattedDate = dateObj.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              });
              const formattedTime = dateObj.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit'
              });

              return (
                <motion.div
                  key={item._id || idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => setSelected(item)}
                  className="glass-card hover-lift border border-white/5 hover:border-teal-500/20 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-center gap-4">
                    {/* Icon initials */}
                    <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center font-black text-teal-300 text-lg shadow-sm">
                      {item.patientName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white leading-snug">{item.patientName}</h3>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>NIC: <span className="font-mono text-slate-300">{item.patientNic}</span></span>
                        <span>•</span>
                        <span>Diagnosis: <span className="text-slate-300 font-semibold">{item.diagnosis}</span></span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-slate-300 font-medium flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" /> {formattedDate}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1 justify-start md:justify-end">
                        <Clock className="w-3 h-3 text-slate-600" /> {formattedTime}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {rxCount > 0 ? (
                        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-wider ${
                          latestRx?.status === 'dispensed'
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.08)]'
                            : latestRx?.status === 'expired'
                            ? 'bg-red-500/10 border-red-500/25 text-red-400'
                            : 'bg-teal-500/10 border-teal-500/25 text-teal-400 shadow-[0_0_12px_rgba(20,184,166,0.08)]'
                        }`}>
                          {latestRx?.status}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg border border-white/5 bg-slate-900/40 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                          No Rx
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Deep Detail Modal */}
        <AnimatePresence>
          {selected && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelected(null)}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
              />

              {/* Modal Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="relative bg-slate-900/90 border border-white/10 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl z-10 max-h-[85vh] overflow-y-auto custom-scrollbar backdrop-blur-xl"
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <User className="text-teal-400 w-5 h-5" /> E-Prescription Visit Details
                </h2>

                <div className="space-y-6">
                  {/* Demographics */}
                  <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5">
                    <h3 className="label-caps mb-3">Patient Demographics</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">Name</p>
                        <p className="font-semibold text-slate-200 mt-0.5">{selected.patientName}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">NIC</p>
                        <p className="font-semibold text-slate-200 font-mono mt-0.5">{selected.patientNic}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Gender</p>
                        <p className="font-semibold text-slate-200 mt-0.5">{selected.patientDetails?.gender || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Blood Group</p>
                        <p className="font-semibold text-red-400 mt-0.5">{selected.patientDetails?.bloodGroup || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Allergies / Chronic */}
                    {selected.patientDetails?.allergies?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <p className="text-slate-500 text-xs mb-1.5 font-bold uppercase tracking-wider text-[10px]">Allergies</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.patientDetails.allergies.map(alg => (
                            <span key={alg} className="bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs px-2 py-0.5 rounded">
                              {alg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clinical Assessment */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5">
                      <h3 className="label-caps mb-2">Clinical Symptoms</h3>
                      {selected.symptoms?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selected.symptoms.map(s => (
                            <span key={s} className="bg-slate-800 border border-white/5 text-slate-300 text-xs px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic mt-1">No symptoms logged.</p>
                      )}
                    </div>

                    <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5">
                      <h3 className="label-caps mb-2">ML Disease Diagnosis</h3>
                      <p className="font-bold text-teal-400 text-sm mt-1">{selected.diagnosis}</p>
                      {selected.icdCode && (
                        <p className="text-[10px] font-mono text-slate-500 mt-1">ICD-10: {selected.icdCode}</p>
                      )}
                    </div>
                  </div>

                  {/* E-Prescription Items */}
                  <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5">
                    <h3 className="label-caps mb-3">E-Prescription Details</h3>
                    {selected.prescriptions?.length > 0 ? (
                      <div className="space-y-3">
                        {selected.prescriptions.map((rx, idx) => (
                          <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/60 border border-white/5 rounded-xl text-sm">
                            <div>
                              <p className="font-bold text-white">{rx.drugName}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {rx.dosage} • {rx.frequency} • {rx.durationDays} Days
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                              rx.status === 'dispensed'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-teal-500/10 border-teal-500/20 text-teal-400'
                            }`}>
                              {rx.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No prescriptions issued for this consultation.</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                    <button
                      onClick={() => setSelected(null)}
                      className="glass-button-ghost text-xs px-4 py-2"
                    >
                      Close Window
                    </button>
                    <button
                      onClick={() => downloadPrescriptionPDF(selected)}
                      className="glass-button text-xs px-4 py-2"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download E-Prescription (PDF)
                    </button>
                  </div>

                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
