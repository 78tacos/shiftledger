import { createContext, useContext } from 'react';
import type { SessionUser } from '../types';

export type Session = {
  user: SessionUser;
  token: string;
};

export const SessionContext = createContext<{
  session: Session | null;
  setSession: (session: Session | null) => void;
}>({ session: null, setSession: () => undefined });

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx.session) {
    throw new Error('Not signed in');
  }
  return ctx.session;
}
