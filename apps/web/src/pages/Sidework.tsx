import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatTime, isoDate, roleLabel } from '../lib/format';
import { useSession } from '../lib/session';
import type { Shift, SideworkItem } from '../types';

export function Sidework() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(isoDate());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [items, setItems] = useState<SideworkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selected = params.get('shift') ?? '';

  useEffect(() => {
    api<{ shifts: Shift[] }>(`/shifts?date=${date}`)
      .then((res) => {
        setShifts(res.shifts);
        if (!selected && res.shifts[0]) {
          setParams({ shift: res.shifts[0].id }, { replace: true });
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [date, selected, setParams]);

  useEffect(() => {
    if (!selected) {
      setItems([]);
      return;
    }
    api<{ items: SideworkItem[] }>(`/shifts/${selected}/sidework`)
      .then((res) => setItems(res.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load checklist'));
  }, [selected]);

  async function toggle(item: SideworkItem) {
    setError(null);
    try {
      const res = await api<{ item: SideworkItem }>(`/shift-sidework/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !item.done }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? res.item : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update item');
    }
  }

  const shift = shifts.find((s) => s.id === selected);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sidework</h1>
          <p>Close-dining checklist, attached to a shift.</p>
        </div>
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select
            value={selected}
            onChange={(e) => setParams({ shift: e.target.value })}
          >
            {shifts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName} · {roleLabel(row.roleOnShift)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        {shift ? (
          <p className="meta">
            {shift.displayName} · in {formatTime(shift.clockInAt, user.timezone)}
          </p>
        ) : null}
        {items.map((item) => (
          <label className="check" key={item.id}>
            <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
            <span>
              <strong>{item.label}</strong>
              <div className="meta">{item.templateName}</div>
            </span>
          </label>
        ))}
        {items.length === 0 ? <p className="meta">No checklist items for this shift.</p> : null}
      </section>
    </div>
  );
}
