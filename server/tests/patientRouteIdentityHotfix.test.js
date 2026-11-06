'use strict';
const { harness } = require('./helpers/patientRouteIdentityHarness');
const routes = [['profile', ''], ['timeline', '/timeline'], ['prescriptions', '/prescriptions']];

describe('patient route identity contract through real router and verified authentication', () => {
  test.each(['login', 'otp', 'refresh'])('%s issues safe claims and authenticates all owner ID and NIC read routes', async issuer => {
    const h = harness();
    const { accessToken } = await h.issue(issuer);
    const claims = h.decode(accessToken);
    expect(claims.id === h.ownerId && claims.sub === h.ownerId && claims.nic === undefined).toBe(true);
    expect(Object.values(claims).some(value => typeof value === 'string' && /^(?:[0-9]{9}[vVxX]|[0-9]{12})$/.test(value))).toBe(false);
    for (const [, suffix] of routes) {
      expect((await h.dispatch('GET', '/' + h.ownerNic + suffix, accessToken)).status).toBe(200);
      expect((await h.dispatch('GET', '/' + h.ownerId + suffix, accessToken)).status).toBe(200);
    }
    expect(h.state.providers).toBe(0);
  });

  test.each(routes)('%s rejects other patients by ID and NIC', async (_label, suffix) => {
    const h = harness(); const { accessToken } = await h.issue();
    expect((await h.dispatch('GET', '/' + h.otherId + suffix, accessToken)).status).toBe(403);
    expect(h.state.reads.includes(h.otherId)).toBe(false);
    expect((await h.dispatch('GET', '/' + h.otherNic + suffix, accessToken)).status).toBe(403);
    expect(h.state.providers).toBe(0);
  });
  test.each(routes)('%s denies no-token, expired, wrong-role, revoked and banned callers', async (_label, suffix) => {
    const h = harness(); const { accessToken } = await h.issue(); const url = '/' + h.ownerId + suffix;
    expect((await h.dispatch('GET', url)).status).toBe(401);
    expect((await h.dispatch('GET', url, h.expired())).status).toBe(401);
    expect((await h.dispatch('GET', url, await h.wrongRole())).status).toBe(403);
    const session = h.state.sessions.find(row => row.isValid && row.userModel === 'Patient');
    session.isValid = false;
    expect((await h.dispatch('GET', url, accessToken)).status).toBe(401);
    session.isValid = true; h.state.banned = true;
    expect((await h.dispatch('GET', url, accessToken)).status).toBe(403);
    expect(h.state.providers).toBe(0);
  });
  test.each(['login', 'otp', 'refresh'])('%s preserves owner-only profile write, rating and report routes with inert persistence', async issuer => {
    const h = harness(); const { accessToken } = await h.issue(issuer);
    expect((await h.dispatch('PUT', '/profile', accessToken, { bloodGroup: 'A+' })).status).toBe(200);
    expect((await h.dispatch('PUT', '/' + h.ownerId, accessToken, { bloodGroup: 'B+' })).status).toBe(200);
    expect((await h.dispatch('PUT', '/' + h.otherId, accessToken, { bloodGroup: 'O+' })).status).toBe(403);
    expect(h.other.bloodGroup).toBeUndefined();
    expect((await h.dispatch('POST', '/consultation/' + h.consultationId + '/rate', accessToken, { rating: 4, comment: 'Synthetic fixture' })).status).toBe(201);
    expect((await h.dispatch('POST', '/report', accessToken, { targetId: h.otherId, reason: 'Synthetic fixture' })).status).toBe(201);
    expect(h.state.providers).toBe(0);
  });
  test.each(['/request-access', '/verify-access'])('patient cannot invoke clinician consent endpoint %s', async url => {
    const h = harness(); const { accessToken } = await h.issue();
    expect((await h.dispatch('POST', url, accessToken, {})).status).toBe(403);
    expect(h.state.providers).toBe(0);
  });

  test.each(['login', 'otp', 'refresh'])('%s supports the real prescription and test alias routers', async issuer => {
    const h = harness(); const { accessToken } = await h.issue(issuer);
    for (const scope of ['prescription', 'test']) {
      expect((await h.dispatch('GET', '/patient/' + h.ownerNic, accessToken, {}, scope)).status).toBe(200);
      expect((await h.dispatch('GET', '/patient/' + h.ownerId, accessToken, {}, scope)).status).toBe(200);
      expect((await h.dispatch('GET', '/patient/' + h.otherNic, accessToken, {}, scope)).status).toBe(403);
      expect((await h.dispatch('GET', '/patient/' + h.otherId, accessToken, {}, scope)).status).toBe(403);
      expect((await h.dispatch('GET', '/patient/' + h.ownerId, undefined, {}, scope)).status).toBe(401);
      expect((await h.dispatch('GET', '/patient/' + h.ownerId, h.expired(), {}, scope)).status).toBe(401);
    }
    expect(h.state.providers).toBe(0);
  });

  test.each([['missing', 404], ['foreign', 503], ['invalid', 503], ['error', 503]])('identity resolution fails closed for %s without running the read handler', async (fault, status) => {
    const h = harness(); const { accessToken } = await h.issue();
    const profileReads = h.state.profileReads.length;
    h.state.identityFault = fault;
    for (const [, suffix] of routes) expect((await h.dispatch('GET', '/' + h.ownerId + suffix, accessToken)).status).toBe(status);
    for (const scope of ['prescription', 'test']) expect((await h.dispatch('GET', '/patient/' + h.ownerId, accessToken, {}, scope)).status).toBe(status);
    expect(h.state.profileReads.length).toBe(profileReads);
    expect(h.state.providers).toBe(0);
  });
});
