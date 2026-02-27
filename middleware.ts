import NextAuth from 'next-auth';
import authConfig from '@/auth.config';

// Uses edge-safe auth.config.ts (no pg/crypto imports).
// Full auth with Credentials provider is in auth.ts (Node.js runtime only).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
