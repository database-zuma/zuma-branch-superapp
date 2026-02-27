import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { pool } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { rows } = await pool.query(
          'SELECT id, email, name, password_hash, role, is_active FROM branch_super_app_clawdbot.users WHERE email = $1',
          [credentials.email]
        );

        if (rows.length === 0) return null;

        const user = rows[0];
        if (!user.is_active) return null;

        const isValid = verifyPassword(
          credentials.password as string,
          user.password_hash
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
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
});
