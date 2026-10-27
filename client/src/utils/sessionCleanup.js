// In-memory generation prevents an old refresh response restoring a logged-out session.
let generation = 0;
export const sessionGeneration = () => generation;
export const clearLocalSession = () => {
  generation += 1;
  for (const key of ['token', 'accessToken', 'refreshToken', 'role', 'userRole', 'userName', 'userId', 'doctorId', 'hospitalId', 'pharmacyId', 'loginType', 'sessionHospitalId', 'workspaceMode', 'sessionHospitalName', 'hospitalName', 'pharmacyName', 'nic', 'name', 'user']) localStorage.removeItem(key);
  window.dispatchEvent(new Event('medisync:session-cleared'));
};
