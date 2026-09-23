export type StaffRole = 'server' | 'cook' | 'host' | 'bartender' | 'manager';
export type ShiftStatus = 'scheduled' | 'open' | 'closed' | 'no_show';
export type TipPoolStatus = 'open' | 'closed';
export type TipSource = 'cash' | 'card' | 'other';

export type JwtUser = {
  sub: string;
  staffId: string;
  restaurantId: string;
  role: StaffRole;
};
