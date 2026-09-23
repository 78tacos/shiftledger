export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(2)} h`;
}

export function isoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last Friday, always distinct from today (if today is Friday, go back a week). */
export function lastFriday(from = new Date()): string {
  const d = new Date(from);
  const dow = d.getDay(); // Sun=0 ... Fri=5
  const delta = dow === 5 ? 7 : (dow + 2) % 7;
  d.setDate(d.getDate() - delta);
  return isoDate(d);
}

export function formatTime(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d));
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'server':
      return 'Server';
    case 'cook':
      return 'Cook';
    case 'host':
      return 'Host';
    case 'bartender':
      return 'Bartender';
    case 'manager':
      return 'Manager';
    default: {
      const _never: never = role as never;
      return _never;
    }
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'open':
      return 'On floor';
    case 'closed':
      return 'Closed';
    case 'no_show':
      return 'No show';
    default: {
      const _never: never = status as never;
      return _never;
    }
  }
}
