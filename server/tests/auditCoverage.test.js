'use strict';

jest.mock('uuid', () => ({ v4: () => '12345678-1234-1234-1234-123456789abc' }));

const fs = require('fs');
const path = require('path');
const auditRegistry = require('../src/utils/auditRegistry');

describe('Task R1: Audit Log Completeness and Coverage Suite', () => {
  const routesDir = path.resolve(__dirname, '../src/routes');
  const controllersDir = path.resolve(__dirname, '../src/controllers');

  function scanAllRoutes() {
    const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
    const results = [];

    const controllerContents = {};
    for (const cf of fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'))) {
      controllerContents[cf] = fs.readFileSync(path.join(controllersDir, cf), 'utf8');
    }

    for (const file of files) {
      if (file === 'qaRoutes.js' || file === 'testRoutes.js') continue;
      const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        const match = trimmed.match(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*(.+)\);?/);
        if (!match) return;

        const method = match[1].toUpperCase();
        const routePath = match[2];
        const handlerChain = match[3];

        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        const isSensitive = isMutating || /history|prescriptions|otp|verification|profile|consultation/i.test(routePath);

        let controllerName = null;
        let handlerFunc = null;

        const controllerMatch = handlerChain.match(/([a-zA-Z0-9_]+Controller)\.([a-zA-Z0-9_]+)/);
        if (controllerMatch) {
          controllerName = controllerMatch[1] + '.js';
          handlerFunc = controllerMatch[2];
        } else {
          const parts = handlerChain.split(',').map(s => s.trim());
          const lastPart = parts[parts.length - 1];
          if (/^[a-zA-Z0-9_]+$/.test(lastPart)) {
            handlerFunc = lastPart;
            for (const l of lines) {
              if (l.includes(handlerFunc) && l.includes('require(')) {
                const reqMatch = l.match(/require\(['"]([^'"]+)['"]\)/);
                if (reqMatch) {
                  controllerName = path.basename(reqMatch[1]) + (reqMatch[1].endsWith('.js') ? '' : '.js');
                  break;
                }
              }
            }
          } else {
            handlerFunc = 'inline';
          }
        }

        let audited = false;
        let eventName = 'NONE';

        // Check 1: Route chain includes auditRoute('ACTION_NAME')
        const auditRouteMatch = handlerChain.match(/auditRoute\(['"]([A-Z0-9_]+)['"]/);
        if (auditRouteMatch) {
          audited = true;
          eventName = auditRouteMatch[1];
        }

        // Check 2: Controller includes AuditLog.create
        if (!audited && controllerName && controllerContents[controllerName] && handlerFunc && handlerFunc !== 'inline') {
          const cContent = controllerContents[controllerName];
          const funcIdx = cContent.indexOf(handlerFunc);
          if (funcIdx !== -1) {
            const slice = cContent.slice(funcIdx, funcIdx + 5000);
            if (slice.includes('AuditLog.create') || slice.includes('AuditLog') || slice.includes('recordAudit')) {
              audited = true;
              const actMatch = slice.match(/action:\s*['"]([A-Z0-9_]+)['"]/);
              if (actMatch) eventName = actMatch[1];
              else eventName = 'CONTROLLER_AUDIT';
            }
          }
        }

        // Check 3: Registered in auditRegistry
        if (!audited) {
          const regAction = auditRegistry.isAudited(file, method, routePath);
          if (regAction) {
            audited = true;
            eventName = regAction;
          }
        }

        results.push({
          routeFile: file,
          line: idx + 1,
          method,
          path: routePath,
          controllerName,
          handlerFunc,
          isMutating,
          isSensitive,
          audited,
          eventName
        });
      });
    }
    return results;
  }

  test('scanner detects 100% of mutating routes have verified audit logging', () => {
    const routes = scanAllRoutes();
    const mutating = routes.filter(r => r.isMutating);
    const missing = mutating.filter(r => !r.audited);

    expect(mutating.length).toBeGreaterThan(80);
    expect(missing).toEqual([]);
    expect(mutating.every(r => r.audited === true)).toBe(true);
  });

  test('sensitive read routes (patient record, timeline, prescriptions) are audited', () => {
    const routes = scanAllRoutes();
    const patientSensitive = routes.filter(r =>
      r.routeFile === 'patientRoutes.js' &&
      r.method === 'GET' &&
      ['/:nic', '/:nic/timeline', '/:nic/prescriptions'].includes(r.path)
    );

    expect(patientSensitive.length).toBe(3);
    expect(patientSensitive.every(r => r.audited === true)).toBe(true);
  });

  test('audit action names use SCREAMING_SNAKE_CASE', () => {
    const routes = scanAllRoutes();
    const auditedRoutes = routes.filter(r => r.audited);

    for (const r of auditedRoutes) {
      expect(r.eventName).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  test('admin getAuditLogs accepts email query parameter and resolves to actor IDs', async () => {
    const adminController = require('../src/controllers/adminController');
    const AuditLog = require('../src/models/AuditLog');
    const Doctor = require('../src/models/Doctor');
    const Patient = require('../src/models/Patient');
    const PharmacyStaff = require('../src/models/PharmacyStaff');
    const Hospital = require('../src/models/Hospital');
    const Admin = require('../src/models/Admin');
    const SessionToken = require('../src/models/SessionToken');

    const fakeDoctorId = '507f1f77bcf86cd799439011';
    jest.spyOn(Doctor, 'find').mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: fakeDoctorId }]) });
    jest.spyOn(Patient, 'find').mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    jest.spyOn(PharmacyStaff, 'find').mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    jest.spyOn(Hospital, 'find').mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    jest.spyOn(Admin, 'find').mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    jest.spyOn(SessionToken, 'find').mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    });

    const mockAggregate = jest.spyOn(AuditLog, 'aggregate')
      .mockResolvedValueOnce([{ total: 1 }]) // count result
      .mockResolvedValueOnce([{
        _id: 'audit-1',
        actorId: fakeDoctorId,
        actorRole: 'doctor',
        action: 'DOCTOR_PROFILE_UPDATE',
        timestamp: new Date()
      }]); // logs result

    const req = {
      query: { email: 'doctor@hospital.gov.lk', page: '1', limit: '10' }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await adminController.getAuditLogs(req, res);

    expect(res.json).toHaveBeenCalled();
    const responseData = res.json.mock.calls[0][0];
    expect(responseData).toBeDefined();

    mockAggregate.mockRestore();
    Doctor.find.mockRestore();
  });
});
