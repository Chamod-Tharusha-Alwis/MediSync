function assertProductionClientProfile(environment) {
  if (environment.NODE_ENV !== 'production') return;
  const forbidden = ['REACT_APP_UNIVERSITY_RUNTIME','REACT_APP_MEDISYNC_UNIVERSITY_DEMO','MEDISYNC_PUBLIC_DEMO','MEDISYNC_UNIVERSITY_DEMO'];
  if (forbidden.some(key => environment[key] !== undefined) || environment.REACT_APP_MEDISYNC_QA === 'true' || (environment.MEDISYNC_DEPLOYMENT_MODE !== undefined && environment.MEDISYNC_DEPLOYMENT_MODE !== 'clinical')) throw Error('PRODUCTION_CLIENT_NONCLINICAL_MODE_FORBIDDEN');
}
module.exports = { assertProductionClientProfile };
