import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

interface DNPBErrorRO {
  ro_id: string;
  store_name: string;
  dnpb_number: string | null;
  total_items: number;
  total_selisih: number;
  confirmed_at: string;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { rows: roList } = await pool.query(
      'SELECT * FROM public.get_confirmed_ro_list()'
    );

    const data = await Promise.all(
      (roList || []).map(async (ro: DNPBErrorRO) => {
        let details: Record<string, unknown>[] = [];
        try {
          const { rows } = await pool.query(
            `SELECT article_code, article_name, sku_code, size, pairs_per_box, pairs_shipped, fisik, selisih, notes
             FROM ${SCHEMA}.ro_receipt
             WHERE ro_id = $1`,
            [ro.ro_id]
          );
          details = rows;
        } catch (detailsErr) {
          console.error('Details error:', detailsErr);
        }

        return {
          ...ro,
          details,
        };
      })
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
