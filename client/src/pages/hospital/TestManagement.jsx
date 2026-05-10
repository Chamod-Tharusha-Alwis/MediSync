import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { FlaskConical, Upload, CheckCircle, XCircle, Search, Clock } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

const TestManagement = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef(null);
  const [uploadingTestId, setUploadingTestId] = useState(null);

  const fetchTests = async () => {
    try {
      // In a real implementation we would have an endpoint like GET /tests/hospital
      // For this prototype, assuming such an endpoint exists or we fetch all tests for this hospital's patients
      const { data } = await api.get('/tests/hospital');
      setTests(data.data || []);
    } catch (err) {
      toast.error('Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.put(`/tests/${id}/status`, { status });
      toast.success(`Status updated to ${status}`);
      fetchTests();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleFileUpload = async (testId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('resultFile', file);

    setUploadingTestId(testId);
    try {
      await api.put(`/tests/${testId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Result file uploaded successfully');
      fetchTests();
    } catch (err) {
      toast.error('Failed to upload result file');
    } finally {
      setUploadingTestId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredTests = tests.filter(t => 
    t.testName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.patientNic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Laboratory Management</h1>
        <p className="text-slate-400 mt-1">Manage ordered tests and upload results.</p>
      </div>

      <div className="glass-panel p-6 rounded-xl mb-8 border border-slate-700/50">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by test name or patient NIC..."
            className="block w-full pl-10 pr-3 py-2 border border-slate-700 bg-slate-800/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Loading ordered tests...</div>
        ) : filteredTests.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-slate-700 rounded-xl">
            <FlaskConical className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
            <p className="text-slate-400">No lab tests found</p>
          </div>
        ) : (
          filteredTests.map(test => (
            <div key={test._id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-white text-lg">{test.testName}</h3>
                  <p className="text-sm text-slate-400 mt-1">NIC: {test.patientNic}</p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                  test.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  test.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                  test.status === 'processing' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {test.status.toUpperCase()}
                </span>
              </div>
              
              <div className="text-sm text-slate-300 mb-6 flex-1">
                {test.instructions ? (
                  <p><span className="text-slate-500 font-medium">Notes:</span> {test.instructions}</p>
                ) : (
                  <p className="text-slate-500 italic">No specific instructions</p>
                )}
                <p className="text-xs text-slate-500 mt-2">Ordered on {new Date(test.createdAt).toLocaleDateString()}</p>
              </div>

              <div className="border-t border-slate-700 pt-4 mt-auto">
                {test.status === 'ordered' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleStatusUpdate(test._id, 'processing')}
                      className="flex-1 py-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white rounded-lg text-sm font-medium transition-colors border border-purple-500/30 flex justify-center items-center gap-2"
                    >
                      <Clock className="w-4 h-4" /> Start Processing
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate(test._id, 'cancelled')}
                      className="px-3 py-2 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-slate-700 hover:border-red-500/30"
                      title="Cancel Test"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {test.status === 'processing' && (
                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={(e) => handleFileUpload(test._id, e)}
                      accept="application/pdf,.doc,.docx,image/*"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingTestId === test._id}
                      className="flex-1 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg text-sm font-medium transition-colors border border-emerald-500/30 flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                      {uploadingTestId === test._id ? 'Uploading...' : <><Upload className="w-4 h-4" /> Upload Results</>}
                    </button>
                  </div>
                )}

                {test.status === 'completed' && (
                  <div className="flex items-center text-emerald-400 text-sm font-medium gap-2">
                    <CheckCircle className="w-5 h-5" /> Results successfully uploaded
                    {test.resultFileUrl && (
                      <a href={test.resultFileUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-400 hover:underline text-xs">
                        View
                      </a>
                    )}
                  </div>
                )}
                
                {test.status === 'cancelled' && (
                  <div className="flex items-center text-red-400 text-sm font-medium gap-2">
                    <XCircle className="w-5 h-5" /> Test was cancelled
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PageTransition>
  );
};

export default TestManagement;
