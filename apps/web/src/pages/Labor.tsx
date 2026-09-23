import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatHours, formatTime, isoDate, lastFriday, roleLabel } from '../lib/format';
import { useSession } from '../lib/session';
import type { LaborRow } from '../types';

export function Labor() {
  const { user } = useSession();
  const [from, setFrom] = useState(lastFriday());
  const [to, setTo] = useState(isoDate());
  const [rows, setRows] = useState<LaborRow[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user.role !== 'manager') {
      setError('Labor hours are manager-only (from v_labor_hours).');
      return;
    }
    api<{ rows: LaborRow[]; totalHours: number }>(`/labor?from=${from}&to=${to}`)
      .then((res) => {
        setRows(res.rows);
        setTotalHours(res.totalHours);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load labor'));
  }, [from, to, user.role]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Labor hours</h1>
          <p>Read model from Postgres view v_labor_hours — closed shifts only.</p>
        </div>
        <div className="row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <p className="money">{formatHours(totalHours)}</p>
        <p className="meta">Total across the range, restaurant TZ {user.timezone}.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Role</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.shiftId}>
                <td>{row.displayName}</td>
                <td>{roleLabel(row.roleOnShift)}</td>
                <td>{formatTime(row.clockInAt, user.timezone)}</td>
                <td>{formatTime(row.clockOutAt, user.timezone)}</td>
                <td>{formatHours(row.hoursWorked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? <p className="meta">No closed shifts in this range.</p> : null}
      </section>
    </div>
  );
}
