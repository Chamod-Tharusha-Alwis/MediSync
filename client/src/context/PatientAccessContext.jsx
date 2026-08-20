import React, { createContext, useContext, useState, useEffect } from 'react';

const PatientAccessContext = createContext(null);

export const PatientAccessProvider = ({ children }) => {
  // Shared in-memory state: { nic: string, patientName: string, token: string, expiresAt: number } | null
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    console.log('[PatientAccessContext] activeSession state:', activeSession ? {
      nic: activeSession.nic,
      patientName: activeSession.patientName,
      hasToken: !!activeSession.token,
      expiresAt: new Date(activeSession.expiresAt).toLocaleTimeString()
    } : null);
  }, [activeSession]);

  const setPatientSession = ({ nic, patientName, token, expiresInMinutes = 15 }) => {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    setActiveSession({ nic: nic.toUpperCase(), patientName, token, expiresAt });
  };

  const clearPatientSession = () => {
    setActiveSession(null);
  };

  const getPatientToken = (targetNic) => {
    if (!activeSession) return null;
    if (activeSession.expiresAt < Date.now()) {
      setActiveSession(null);
      return null;
    }
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
