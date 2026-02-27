import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe auth config — no Node.js deps (pg, crypto).
 * Used by middleware.ts for JWT session checks.
 * Full auth config with Credentials provider is in auth.ts.
 */
export default {
  providers: [], // Credentials provider added in auth.ts (Node.js only)
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      const isAuthApi = nextUrl.pathname.startsWith('/api/auth');

      if (isAuthApi) return true;

      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl.origin));
        return true;
      }

      return isLoggedIn; // false → redirect to /login
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
