import type { StaffRole } from '../types.js';

export type PayoutInput = {
  staffId: string;
  points: number;
};

export type PayoutResult = {
  staffId: string;
  points: number;
  amountCents: number;
};

const POINTS_SCALE = 100;

export function defaultPointsForRole(role: StaffRole): number {
  switch (role) {
    case 'server':
      return 1;
    case 'bartender':
      return 0.8;
    case 'host':
      return 0.5;
    case 'cook':
      return 0;
    case 'manager':
      return 0;
    default: {
      const _never: never = role;
      return _never;
    }
  }
}

/**
 * Split `totalCents` using points. Amounts are integer cents and always sum
 * back to the pool total (largest-remainder / Hamilton method).
 */
export function computePayouts(totalCents: number, allocations: PayoutInput[]): PayoutResult[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (allocations.length === 0) {
    throw new Error('at least one allocation is required');
  }

  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (!allocation.staffId) {
      throw new Error('staffId is required');
    }
    if (seen.has(allocation.staffId)) {
      throw new Error(`duplicate staffId ${allocation.staffId}`);
    }
    seen.add(allocation.staffId);
    if (!Number.isFinite(allocation.points) || allocation.points <= 0) {
      throw new Error('points must be > 0');
    }
  }

  const scaled = allocations.map((allocation) => ({
    staffId: allocation.staffId,
    points: allocation.points,
    pointsScaled: Math.round(allocation.points * POINTS_SCALE),
  }));

  const totalPointsScaled = scaled.reduce((sum, row) => sum + row.pointsScaled, 0);
  if (totalPointsScaled <= 0) {
    throw new Error('total points must be > 0');
  }

  const rows = scaled.map((row) => {
    const numerator = totalCents * row.pointsScaled;
    return {
      staffId: row.staffId,
      points: row.points,
      amountCents: Math.floor(numerator / totalPointsScaled),
      remainder: numerator % totalPointsScaled,
    };
  });

  let leftover = totalCents - rows.reduce((sum, row) => sum + row.amountCents, 0);
  const rank = rows
    .map((row, index) => ({ index, remainder: row.remainder, staffId: row.staffId }))
    .sort((a, b) => b.remainder - a.remainder || a.staffId.localeCompare(b.staffId));

  for (let i = 0; i < leftover; i += 1) {
    rows[rank[i % rank.length].index].amountCents += 1;
  }

  return rows.map(({ remainder: _remainder, ...rest }) => rest);
}
