import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffRole } from './types.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      staffId: string;
      restaurantId: string;
      role: StaffRole;
    };
    user: {
      sub: string;
      staffId: string;
      restaurantId: string;
      role: StaffRole;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireManager: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};
