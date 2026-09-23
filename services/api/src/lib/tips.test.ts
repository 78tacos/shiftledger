import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePayouts, defaultPointsForRole } from './tips.ts';

describe('computePayouts', () => {
  it('splits the Friday demo pool (24750 cents, 3 servers + host 0.5) with no leftover cents', () => {
    const luca = 'cccccccc-cccc-4ccc-8ccc-cccccccc0002';
    const priya = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
    const diego = 'cccccccc-cccc-4ccc-8ccc-cccccccc0004';
    const noor = 'cccccccc-cccc-4ccc-8ccc-cccccccc0005';

    const payouts = computePayouts(24750, [
      { staffId: luca, points: 1 },
      { staffId: priya, points: 1 },
      { staffId: diego, points: 1 },
      { staffId: noor, points: 0.5 },
    ]);

    const byId = Object.fromEntries(payouts.map((p) => [p.staffId, p.amountCents]));
    assert.equal(payouts.reduce((sum, p) => sum + p.amountCents, 0), 24750);
    assert.equal(byId[luca], 7072);
    assert.equal(byId[priya], 7071);
    assert.equal(byId[diego], 7071);
    assert.equal(byId[noor], 3536);
  });

  it('returns zeros when the pool is empty', () => {
    const payouts = computePayouts(0, [{ staffId: 'a', points: 1 }]);
    assert.deepEqual(payouts, [{ staffId: 'a', points: 1, amountCents: 0 }]);
  });

  it('gives leftover cents to the largest remainder', () => {
    const payouts = computePayouts(100, [
      { staffId: 'host', points: 1 },
      { staffId: 'server', points: 2 },
    ]);
    assert.equal(payouts.reduce((sum, p) => sum + p.amountCents, 0), 100);
    const server = payouts.find((p) => p.staffId === 'server');
    const host = payouts.find((p) => p.staffId === 'host');
    assert.equal(server?.amountCents, 67);
    assert.equal(host?.amountCents, 33);
  });

  it('rejects empty allocations and non-positive points', () => {
    assert.throws(() => computePayouts(10, []), /at least one allocation/);
    assert.throws(() => computePayouts(10, [{ staffId: 'a', points: 0 }]), /points must be > 0/);
  });
});

describe('defaultPointsForRole', () => {
  it('uses FOH points and zero for BOH/manager', () => {
    assert.equal(defaultPointsForRole('server'), 1);
    assert.equal(defaultPointsForRole('bartender'), 0.8);
    assert.equal(defaultPointsForRole('host'), 0.5);
    assert.equal(defaultPointsForRole('cook'), 0);
    assert.equal(defaultPointsForRole('manager'), 0);
  });
});
