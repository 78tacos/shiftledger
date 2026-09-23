import { formatCents } from '../lib/format';

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatCents(cents)}</span>;
}
