export type StaffRole = 'server' | 'cook' | 'host' | 'bartender' | 'manager';
export type ShiftStatus = 'scheduled' | 'open' | 'closed' | 'no_show';
export type TipPoolStatus = 'open' | 'closed';
export type TipSource = 'cash' | 'card' | 'other';

export type SessionUser = {
  id: string;
  email: string;
  staffId: string;
  displayName: string;
  role: StaffRole;
  restaurantId: string;
  restaurantName: string;
  timezone: string;
};

export type Shift = {
  id: string;
  restaurantId: string;
  staffId: string;
  displayName: string;
  staffRole: StaffRole;
  servicePeriodId: string | null;
  serviceDate: string | null;
  periodLabel: string | null;
  roleOnShift: StaffRole;
  status: ShiftStatus;
  scheduledStart: string;
  scheduledEnd: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  notes: string | null;
};

export type StaffMember = {
  id: string;
  displayName: string;
  role: StaffRole;
  hireDate: string | null;
  active: boolean;
};

export type ServicePeriod = {
  id: string;
  serviceDate: string;
  label: string;
  startsAt: string;
  endsAt: string;
  poolId: string | null;
  poolStatus: TipPoolStatus | null;
  totalCents: number | null;
};

export type TipPool = {
  id: string;
  restaurantId: string;
  servicePeriodId: string;
  status: TipPoolStatus;
  totalCents: number;
  notes: string | null;
  closedAt: string | null;
  createdAt: string;
  serviceDate: string;
  periodLabel: string;
};

export type TipContribution = {
  id: string;
  staffId: string;
  displayName: string;
  amountCents: number;
  source: TipSource;
  createdAt: string;
};

export type TipPayout = {
  id: string;
  staffId: string;
  displayName: string;
  points: number;
  amountCents: number;
};

export type SideworkItem = {
  id: string;
  shiftId: string;
  itemId: string;
  label: string;
  sortOrder: number;
  templateName: string;
  done: boolean;
  doneAt: string | null;
};

export type LaborRow = {
  restaurantId: string;
  staffId: string;
  displayName: string;
  shiftId: string;
  roleOnShift: StaffRole;
  clockInAt: string;
  clockOutAt: string;
  hoursWorked: number;
};
