import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const PatientAccessContext = createContext(null);

export const PatientAccessProvider = ({ children }) => {
  // Shared in-memory state: { nic: string, patientName: string, token: string, expiresAt: number } | null
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    if (!activeSession) return undefined;
    const timer = setTimeout(() => setActiveSession(null), Math.max(0, activeSession.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [activeSession]);
  useEffect(() => {
    const clear = () => setActiveSession(null);
    window.addEventListener('medisync:session-cleared', clear);
    return () => window.removeEventListener('medisync:session-cleared', clear);
  }, []);

  const setPatientSession = useCallback(({ nic, patientName, token, expiresInMinutes = 15 }) => {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    if (!token || !nic?.trim() || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) { setActiveSession(null); return; }
    setActiveSession({ nic: nic.trim().toUpperCase(), patientName, token, expiresAt });
  }, []);

  const clearPatientSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  const getPatientToken = (targetNic) => {
    if (!activeSession) return null;
    if (activeSession.expiresAt <= Date.now()) return null;
    if (targetNic && activeSession.nic !== targetNic.trim().toUpperCase()) {
      return null;
    }
    return activeSession.token;
  };

  return (
    <PatientAccessContext.Provider
      value={{
        activeSession,
        setPatientSession,
        clearPatientSession,
        getPatientToken
      }}
    >
      {children}
    </PatientAccessContext.Provider>
  );
};

export const usePatientAccess = () => {
  const context = useContext(PatientAccessContext);
  if (!context) {
    // Graceful fallback if rendered outside provider
    return {
      activeSession: null,
      setPatientSession: () => {},
      clearPatientSession: () => {},
      getPatientToken: () => null
    };
  }
  return context;
};
