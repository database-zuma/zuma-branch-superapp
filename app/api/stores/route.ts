import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

const SPECIAL_STORES = ['Other Need', 'Wholesale', 'Consignment'];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT "Store Name" FROM ${SCHEMA}.ro_recommendations
       WHERE "Store Name" IS NOT NULL AND "Store Name" != 'Store Name'
       ORDER BY "Store Name"`
    );

    const stores = rows.map((r: Record<string, unknown>) => r['Store Name'] as string);

    return NextResponse.json({
      success: true,
      data: { regular: stores, special: SPECIAL_STORES },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in stores API:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
