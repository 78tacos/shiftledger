import type { ShiftStatus } from '../types';
import { statusLabel } from '../lib/format';

export function StatusPill({ status }: { status: ShiftStatus }) {
  return <span className={`pill ${status}`}>{statusLabel(status)}</span>;
}
