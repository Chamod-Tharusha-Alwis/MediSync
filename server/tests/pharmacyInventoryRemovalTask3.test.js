'use strict';

/**
 * Task 3 (P1) — pharmacy inventory fully removed. Dispensing is prescription verification only.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Task 3 — server no longer exposes stock or restock features', () => {
  test('restock and seed-restock routes are gone; /inventory stays only as 410 Gone', () => {
    const routes = read('server/src/routes/pharmacyRoutes.js');
    for (const removed of ['/analytics/restock', '/predict-restock', '/restock-alerts', '/seed-restock']) {
      expect(routes).not.toContain(`'${removed}'`);
    }
    expect(routes).toContain("router.get('/inventory', pharmacyAuth, pharmacyController.getInventory);");
    expect(routes).toContain("router.get('/analytics/dispensing', pharmacyAuth, pharmacyController.getDispensingAnalytics);");
  });

  test('controller drops restock handlers and /inventory answers 410', async () => {
    const controller = require('../src/controllers/pharmacyController');
    expect(controller.predictRestock).toBeUndefined();
    expect(controller.getDistrictRestockAlerts).toBeUndefined();
    expect(controller.getRestockAnalytics).toBeUndefined();
    expect(typeof controller.getDispensingAnalytics).toBe('function');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.getInventory({ user: { id: 'x', role: 'pharmacist' } }, res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'INVENTORY_MANAGEMENT_DECOMMISSIONED' }));
  });

  test('audit registry no longer lists removed restock routes', () => {
    const registry = read('server/src/utils/auditRegistry.js');
    expect(registry).not.toMatch(/predict-restock|seed-restock|PREDICT_RESTOCK/);
  });

  test('restock seed/wipe utilities are deleted', () => {
    expect(fs.existsSync(path.join(root, 'server/src/utils/seedRestockData.js'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'server/src/utils/wipeSeedRestockData.js'))).toBe(false);
  });

  test('Pharmacy schema has no inventory; Dispensing items have no inventoryItemId', () => {
    const Pharmacy = require('../src/models/Pharmacy');
    const Dispensing = require('../src/models/Dispensing');
    expect(Pharmacy.schema.path('inventory')).toBeUndefined();
    expect(Dispensing.schema.path('items').schema.path('inventoryItemId')).toBeUndefined();
    // Legacy receipts with out_of_stock must still validate.
    expect(Dispensing.schema.path('items').schema.path('status').enumValues).toContain('out_of_stock');
  });

  test('legacy Pharmacy documents holding an inventory array still load and validate (stored data left untouched)', () => {
    const Pharmacy = require('../src/models/Pharmacy');
    const legacy = [{ drugName: 'X', stock: 5 }];
    const doc = Pharmacy.hydrate({ _id: '507f1f77bcf86cd799439011', name: 'Synthetic', inventory: legacy });
    // Mongoose preserves unknown stored fields on load; the schema simply no longer casts or uses them.
    expect(doc.get('inventory')).toEqual(legacy);
    expect(Pharmacy.schema.path('inventory')).toBeUndefined();
    const err = doc.validateSync();
    expect(err ? Object.keys(err.errors).filter(k => k.startsWith('inventory')) : []).toEqual([]);
  });
});

describe('Task 3 — dispensing validation is prescription-only', () => {
  const { validateItems } = require('../src/services/dispensingService');

  test('items carry no inventory identifier and invalid ids are no longer an inventory concern', () => {
    const [item] = validateItems([{ name: 'Paracetamol 500mg', qty: 2, unit: 'tablets', inventoryItemId: 'not-an-id' }]);
    expect(item).not.toHaveProperty('inventoryItemId');
    expect(item).toMatchObject({ name: 'Paracetamol 500mg', qty: 2 });
  });

  test('new requests cannot record an out_of_stock item status', () => {
    const [item] = validateItems([{ name: 'Amoxicillin', qty: 1, status: 'out_of_stock' }], true);
    expect(item.status).toBe('partial');
  });

  test('quantity errors no longer mention inventory units', () => {
    expect(() => validateItems([{ name: 'X', qty: 0 }])).toThrow(/dispensed units/);
    expect(read('server/src/services/dispensingService.js')).not.toMatch(/inventoryItemId|inventory units/);
  });
});

describe('Task 3 — client has no OTC, restock or stock UI', () => {
  const dashboard = read('client/src/pages/pharmacy/Dashboard.jsx');

  test('pharmacy dashboard has no OTC/analytics tabs, stock dropdowns or inventory calls', () => {
    for (const gone of ['ManualDispenseOTC', 'RestockAnalytics', 'RestockPredictor', '/dashboard/otc', '/dashboard/analytics', '/pharmacy/inventory', 'Stock:', 'inventoryItemId', 'Inventory Integration']) {
      expect(dashboard).not.toContain(gone);
    }
    expect(dashboard).not.toMatch(/inventory/i);
  });

  test('Home pharmacist copy no longer promises inventory checks', () => {
    expect(read('client/src/pages/Home.jsx')).not.toMatch(/inventory/i);
  });

  test.each(['en', 'si', 'ta'])('%s translations carry no inventory, stock or restock keys', lang => {
    const src = read(`client/src/i18n/translations/${lang}.js`);
    expect(src).not.toMatch(/"(inventory|inventoryStock|inventoryItem|stockLevel|availableStock|insufficientStock|insufficientInventory|stockUnavailable|restockAlerts|restockAlertsTitle|restockAlertsSubtitle|dispenseOtc|manualOtc|otcTitle|otcSubtitle|otcSuccess|otcFailed)"\s*:/);
  });
});
