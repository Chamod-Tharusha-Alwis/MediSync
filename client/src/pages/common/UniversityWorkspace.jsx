import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { clearLocalSession } from '../../utils/sessionCleanup';
import { useTranslation } from '../../i18n/LanguageContext';

const copy = {
  en: ['Synthetic university workspace','Educational demonstration only. Clinical record changes, dispensing, uploads, exports, registration and external notifications are unavailable.','Loading synthetic account…','Doctor directory','Hospital directory','Pharmacy directory','Log out'],
  si: ['කෘත්‍රිම විශ්වවිද්‍යාල වැඩ අවකාශය','අධ්‍යාපනික නිරූපණයක් පමණි. සායනික දත්ත වෙනස්කම්, ඖෂධ නිකුත් කිරීම, ගොනු, ලියාපදිංචි සහ බාහිර දැනුම්දීම් ලබා ගත නොහැක.','කෘත්‍රිම ගිණුම පූරණය වේ…','වෛද්‍ය නාමාවලිය','රෝහල් නාමාවලිය','ඖෂධශාලා නාමාවලිය','ඉවත් වන්න'],
  ta: ['செயற்கை பல்கலைக்கழக பணியிடம்','கல்வி விளக்கம் மட்டுமே. மருத்துவப் பதிவு மாற்றங்கள், மருந்து வழங்கல், கோப்புகள், பதிவு மற்றும் வெளிப்புற அறிவிப்புகள் கிடைக்காது.','செயற்கைக் கணக்கை ஏற்றுகிறது…','மருத்துவர் பட்டியல்','மருத்துவமனை பட்டியல்','மருந்தகப் பட்டியல்','வெளியேறு'],
};

// Restricted view in the real application; no clinical write/upload controls.
export default function UniversityWorkspace() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const navigate = useNavigate();
  const { language } = useTranslation();
  const words = copy[language] || copy.en;
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    api.get('/university/workspace', { signal: controller.signal }).then(response => {
      if (!active) return;
      const value = response.data?.data;
      if (!value || value.isSynthetic !== true || value.role !== localStorage.getItem('role') || value.clinicalWrites !== false) throw Error('Invalid demonstration response');
      setData(value);
    }).catch(() => { if (active) setError('The synthetic workspace is unavailable. No changes were made.'); });
    return () => { active = false; controller.abort(); };
  }, []);
  const logout = async () => {
    try { await api.post('/auth/logout'); clearLocalSession(); navigate('/select-role'); }
    catch (_) { setError('Logout could not be confirmed. Retry to close the server session.'); }
  };
  return <main className="min-h-screen px-5 py-16 max-w-4xl mx-auto text-slate-100">
    <h1 className="text-2xl font-bold">{words[0]}</h1>
    <p className="my-4">{words[1]}</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">{words[2]}</p>}
    {data && <section aria-label="Authenticated synthetic account"><h2>{data.name}</h2><p>Role: <span data-testid="university-role">{data.role}</span></p><p>{data.scope}</p></section>}
    <nav aria-label="Synthetic directory navigation" className="flex flex-wrap gap-6 my-8">
      <Link to="/doctors">{words[3]}</Link><Link to="/hospitals">{words[4]}</Link><Link to="/pharmacies">{words[5]}</Link>
    </nav>
    <button type="button" onClick={logout} className="px-5 py-3 border rounded">{words[6]}</button>
  </main>;
}
