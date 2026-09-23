import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Money } from '../components/Money';
import { formatCents, formatDate, isoDate, lastFriday, roleLabel } from '../lib/format';
import { useSession } from '../lib/session';
import type { ServicePeriod, StaffMember, TipContribution, TipPayout, TipPool as TipPoolType, TipSource } from '../types';

type PoolBundle = {
  pool: TipPoolType;
  contributions: TipContribution[];
  payouts: TipPayout[];
};

export function TipPool() {
  const { user } = useSession();
  const [periods, setPeriods] = useState<ServicePeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [bundle, setBundle] = useState<PoolBundle | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffId, setStaffId] = useState('');
  const [amount, setAmount] = useState('40.00');
  const [source, setSource] = useState<TipSource>('cash');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = lastFriday();
  const to = isoDate();

  useEffect(() => {
    Promise.all([
      api<{ periods: ServicePeriod[] }>(`/service-periods?from=${from}&to=${to}`),
      api<{ staff: StaffMember[] }>('/staff'),
    ])
      .then(([periodRes, staffRes]) => {
        setPeriods(periodRes.periods);
        setStaff(staffRes.staff);
        setStaffId(staffRes.staff.find((s) => s.role === 'server')?.id ?? staffRes.staff[0]?.id ?? '');
        const tonight = periodRes.periods.find((p) => p.serviceDate === to) ?? periodRes.periods[0];
        if (tonight) {
          setPeriodId(tonight.id);
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [from, to]);

  useEffect(() => {
    if (!periodId) return;
    api<PoolBundle>(`/tip-pools/${periodId}`)
      .then(setBundle)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load pool'));
  }, [periodId]);

  const pointDraft = useMemo(() => {
    const foH = staff.filter((s) => s.role === 'server' || s.role === 'host' || s.role === 'bartender');
    return foH.map((s) => ({
      staffId: s.id,
      name: s.displayName,
      role: s.role,
      points: s.role === 'host' ? 0.5 : s.role === 'bartender' ? 0.8 : 1,
    }));
  }, [staff]);

  async function contribute(event: FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    const dollars = Number(amount);
    const amountCents = Math.round(dollars * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError('Enter a tip amount greater than zero');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api<PoolBundle>(`/tip-pools/${bundle.pool.id}/contributions`, {
        method: 'POST',
        body: JSON.stringify({ staffId, amountCents, source }),
      });
      setBundle(next);
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add contribution');
    } finally {
      setBusy(false);
    }
  }

  async function closePool() {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<PoolBundle>(`/tip-pools/${bundle.pool.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          allocations: pointDraft.map((row) => ({ staffId: row.staffId, points: row.points })),
        }),
      });
      setBundle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close pool');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tip pool</h1>
          <p>Integer cents in, points out. Remainder cents go to the largest leftover.</p>
        </div>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {formatDate(period.serviceDate)} {period.label} · {period.poolStatus ?? 'open'}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {bundle ? (
        <div className="split">
          <section className="card">
            <p className="meta">
              {formatDate(bundle.pool.serviceDate)} {bundle.pool.periodLabel}
            </p>
            <Money cents={bundle.pool.totalCents} />
            <p className="meta">Status: {bundle.pool.status}</p>
            {bundle.pool.notes ? <p className="meta">{bundle.pool.notes}</p> : null}

            {bundle.pool.status === 'open' ? (
              <form onSubmit={contribute} className="grid" style={{ marginTop: 18 }}>
                <label>
                  Who dropped the tip
                  <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} ({roleLabel(member.role)})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount (USD)
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Source
                  <select value={source} onChange={(e) => setSource(e.target.value as TipSource)}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <button className="btn" disabled={busy} type="submit">
                  Add contribution
                </button>
              </form>
            ) : null}

            <h2 style={{ marginTop: 28, fontSize: '1.1rem' }}>Drops</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Source</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {bundle.contributions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.displayName}</td>
                    <td>{row.source}</td>
                    <td>{formatCents(row.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Points split</h2>
            <p className="meta">
              Default: server 1.0, bartender 0.8, host 0.5. Cooks and managers are out of the FOH pool.
            </p>
            {bundle.pool.status === 'open' && user.role === 'manager' ? (
              <button className="btn" type="button" disabled={busy} onClick={closePool} style={{ margin: '12px 0 18px' }}>
                Close pool
              </button>
            ) : null}
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Pts</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {(bundle.payouts.length > 0 ? bundle.payouts : pointDraft).map((row) => (
                  <tr key={row.staffId}>
                    <td>{'displayName' in row ? row.displayName : row.name}</td>
                    <td>{row.points}</td>
                    <td>{'amountCents' in row ? formatCents(row.amountCents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : (
        <p className="meta">Select a service period.</p>
      )}
    </div>
  );
}
