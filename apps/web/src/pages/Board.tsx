import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from '../components/StatusPill';
import { formatDate, formatTime, isoDate, lastFriday, roleLabel } from '../lib/format';
import { useSession } from '../lib/session';
import type { Shift } from '../types';

export function Board() {
  const { user } = useSession();
  const [date, setDate] = useState(isoDate());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextDate = date) => {
    setError(null);
    const res = await api<{ shifts: Shift[] }>(`/shifts?date=${nextDate}`);
    setShifts(res.shifts);
  }, [date]);

  useEffect(() => {
    void load(date).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [date, load]);

  async function clock(shift: Shift, action: 'clock-in' | 'clock-out') {
    setBusyId(shift.id);
    setError(null);
    try {
      await api(`/shifts/${shift.id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Shift board</h1>
          <p>Who is on the floor for {formatDate(date)}.</p>
        </div>
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn secondary" type="button" onClick={() => setDate(isoDate())}>
            Tonight
          </button>
          <button className="btn ghost" type="button" onClick={() => setDate(lastFriday())}>
            Last Friday
          </button>
        </div>
      </div>
      <div className="banner">
        Seeded demo for {user.restaurantName}: tonight is an open dinner service; last Friday has a closed tip
        pool and labor hours.
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid shift-grid">
        {shifts.map((shift) => (
          <article className="card" key={shift.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{shift.displayName}</h3>
              <StatusPill status={shift.status} />
            </div>
            <p className="meta">
              {roleLabel(shift.roleOnShift)} · {shift.periodLabel ?? 'shift'} {shift.serviceDate ?? ''}
            </p>
            <p className="meta">
              Scheduled {formatTime(shift.scheduledStart, user.timezone)}–
              {formatTime(shift.scheduledEnd, user.timezone)}
            </p>
            <p className="meta">
              In {formatTime(shift.clockInAt, user.timezone)} · Out {formatTime(shift.clockOutAt, user.timezone)}
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              {shift.status === 'scheduled' || shift.status === 'no_show' ? (
                <button
                  className="btn"
                  type="button"
                  disabled={busyId === shift.id}
                  onClick={() => clock(shift, 'clock-in')}
                >
                  Clock in
                </button>
              ) : null}
              {shift.status === 'open' ? (
                <button
                  className="btn"
                  type="button"
                  disabled={busyId === shift.id}
                  onClick={() => clock(shift, 'clock-out')}
                >
                  Clock out
                </button>
              ) : null}
              <Link className="btn secondary" to={`/sidework?shift=${shift.id}`}>
                Sidework
              </Link>
            </div>
          </article>
        ))}
      </div>
      {shifts.length === 0 ? <p className="meta">No shifts on this date.</p> : null}
    </div>
  );
}
