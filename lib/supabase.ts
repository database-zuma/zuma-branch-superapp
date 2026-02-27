// Legacy re-export — all Supabase usage has been replaced with direct pg pool.
// This file kept for safety; new code should import from '@/lib/db'.
export { pool, SCHEMA } from '@/lib/db';
