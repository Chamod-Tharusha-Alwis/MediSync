'use strict';

const mongoose = require('mongoose');

describe('Outbreak Alert Notification Pipeline (Feature C1)', () => {
  let Notification;
  let Doctor;
  let Hospital;
  let Admin;
  let notifyOutbreakAlert;

  beforeEach(() => {
    jest.resetModules();

    // Mock models
    Notification = {
      create: jest.fn(),
      insertMany: jest.fn(async (docs) => docs.map((d, i) => ({ ...d, _id: new mongoose.Types.ObjectId() }))),
      find: jest.fn(() => ({
        lean: jest.fn(async () => []),
        sort: jest.fn(() => ({
          limit: jest.fn(async () => [])
        }))
      })),
      countDocuments: jest.fn(async () => 0)
    };

    Doctor = {
      find: jest.fn(() => ({
        lean: jest.fn(async () => [
          { _id: new mongoose.Types.ObjectId('111111111111111111111111'), isActive: true },
          { _id: new mongoose.Types.ObjectId('222222222222222222222222'), isActive: true }
        ])
      }))
    };

    Hospital = {
      find: jest.fn(() => ({
        lean: jest.fn(async () => [
          { _id: new mongoose.Types.ObjectId('333333333333333333333333'), isActive: true }
        ])
      }))
    };

    Admin = {
      find: jest.fn(() => ({
        lean: jest.fn(async () => [
          { _id: new mongoose.Types.ObjectId('444444444444444444444444'), role: 'admin', isActive: true },
          { _id: new mongoose.Types.ObjectId('555555555555555555555555'), role: 'super_admin', isActive: true }
        ])
      }))
    };

    jest.doMock('../src/models/Notification', () => Notification);
    jest.doMock('../src/models/Doctor', () => Doctor);
    jest.doMock('../src/models/Hospital', () => Hospital);
    jest.doMock('../src/models/Admin', () => Admin);

    notifyOutbreakAlert = require('../src/services/notificationService').notifyOutbreakAlert;
  });

  afterEach(() => {
    delete global.io;
  });

  test('creates outbreak alert notifications for doctors, hospitals, and admins', async () => {
    const alertId = new mongoose.Types.ObjectId('666666666666666666666666');
    const alert = {
      _id: alertId,
      disease: 'Dengue',
      location: 'Colombo',
      severity: 'High',
      affectedCount: 25,
      isSimulation: false
    };

    const result = await notifyOutbreakAlert(alert);

    expect(result.createdCount).toBe(5); // 2 doctors + 1 hospital + 2 admins
    expect(result.recipientsCount).toBe(5);
    expect(result.alertId).toBe(String(alertId));

    expect(Notification.insertMany).toHaveBeenCalledTimes(1);
    const insertedDocs = Notification.insertMany.mock.calls[0][0];
    expect(insertedDocs).toHaveLength(5);

    // Verify doctor notifications
    const doctorNotifs = insertedDocs.filter(d => d.role === 'doctor');
    expect(doctorNotifs).toHaveLength(2);
    expect(doctorNotifs[0].title).toBe('Outbreak Alert: Dengue (Colombo)');
    expect(doctorNotifs[0].type).toBe('outbreak_alert');
    expect(doctorNotifs[0].referenceId).toBe(String(alertId));
    expect(doctorNotifs[0].actionLink).toBe('/public-health');
    expect(doctorNotifs[0].read).toBe(false);

    // Verify hospital notifications
    const hospitalNotifs = insertedDocs.filter(d => d.role === 'hospital_admin');
    expect(hospitalNotifs).toHaveLength(1);
    expect(hospitalNotifs[0].title).toBe('Outbreak Alert: Dengue (Colombo)');
    expect(hospitalNotifs[0].actionLink).toBe('/public-health');

    // Verify admin notifications
    const adminNotifs = insertedDocs.filter(d => d.role === 'admin' || d.role === 'super_admin');
    expect(adminNotifs).toHaveLength(2);
    expect(adminNotifs[0].actionLink).toBe('/admin/dashboard/outbreak');
  });

  test('suppresses duplicate notifications if alert referenceId already notified', async () => {
    const alertId = new mongoose.Types.ObjectId('777777777777777777777777');
    const alert = {
      _id: alertId,
      disease: 'Leptospirosis',
      location: 'Ratnapura',
      severity: 'Moderate',
      affectedCount: 12
    };

    // Simulate that all recipients already have notifications for this alertId
    Notification.find.mockReturnValueOnce({
      lean: jest.fn(async () => [
        { userId: new mongoose.Types.ObjectId('111111111111111111111111') },
        { userId: new mongoose.Types.ObjectId('222222222222222222222222') },
        { userId: new mongoose.Types.ObjectId('333333333333333333333333') },
        { userId: new mongoose.Types.ObjectId('444444444444444444444444') },
        { userId: new mongoose.Types.ObjectId('555555555555555555555555') }
      ])
    });

    const result = await notifyOutbreakAlert(alert);

    expect(result.createdCount).toBe(0);
    expect(result.recipientsCount).toBe(5);
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });

  test('emits real-time socket events via emitToVerifiedUser and emitToVerifiedAdmins', async () => {
    const alertId = new mongoose.Types.ObjectId('888888888888888888888888');
    const alert = {
      _id: alertId,
      disease: 'Viral Flu',
      location: 'Kandy',
      severity: 'Moderate',
      affectedCount: 40
    };

    const mockIo = {
      emitToVerifiedUser: jest.fn().mockResolvedValue(),
      emitToVerifiedAdmins: jest.fn().mockResolvedValue()
    };

    await notifyOutbreakAlert(alert, { io: mockIo });

    expect(mockIo.emitToVerifiedUser).toHaveBeenCalledTimes(5);
    expect(mockIo.emitToVerifiedAdmins).toHaveBeenCalledWith('outbreak_alert', expect.objectContaining({
      alertId: String(alertId),
      disease: 'Viral Flu',
      location: 'Kandy',
      severity: 'Moderate'
    }));
  });

  test('falls back to global.io if options.io is omitted', async () => {
    const alertId = new mongoose.Types.ObjectId('999999999999999999999999');
    const alert = {
      _id: alertId,
      disease: 'Cholera',
      location: 'Jaffna',
      severity: 'Critical'
    };

    global.io = {
      emitToVerifiedUser: jest.fn().mockResolvedValue(),
      emitToVerifiedAdmins: jest.fn().mockResolvedValue()
    };

    await notifyOutbreakAlert(alert);

    expect(global.io.emitToVerifiedUser).toHaveBeenCalledTimes(5);
    expect(global.io.emitToVerifiedAdmins).toHaveBeenCalledTimes(1);
  });

  test('tags [SIMULATION] on simulation alert notifications', async () => {
    const alertId = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
    const alert = {
      _id: alertId,
      disease: 'Test Disease',
      location: 'Colombo',
      severity: 'Low',
      isSimulation: true
    };

    await notifyOutbreakAlert(alert);

    const insertedDocs = Notification.insertMany.mock.calls[0][0];
    expect(insertedDocs[0].title).toBe('[SIMULATION] Outbreak Alert: Test Disease (Colombo)');
  });

  test('handles empty recipients or null alert safely', async () => {
    const nullResult = await notifyOutbreakAlert(null);
    expect(nullResult).toEqual({ createdCount: 0, recipientsCount: 0, alertId: null });

    Doctor.find.mockReturnValueOnce({ lean: jest.fn(async () => []) });
    Hospital.find.mockReturnValueOnce({ lean: jest.fn(async () => []) });
    Admin.find.mockReturnValueOnce({ lean: jest.fn(async () => []) });

    const emptyResult = await notifyOutbreakAlert({ disease: 'Flu' });
    expect(emptyResult.createdCount).toBe(0);
    expect(emptyResult.recipientsCount).toBe(0);
  });
});
