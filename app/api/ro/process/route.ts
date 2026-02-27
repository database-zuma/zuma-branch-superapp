import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const roId = searchParams.get('roId');

    console.log('API received roId:', roId);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (roId) {
      conditions.push(`ro_id = $${paramIndex++}`);
      params.push(roId);
      console.log('Filtering by ro_id:', roId);
    }

    if (status && status !== 'ALL') {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: data } = await pool.query(
      `SELECT * FROM ${SCHEMA}.ro_process ${whereClause} ORDER BY created_at DESC`,
      params
    );

    console.log('Query returned rows:', data?.length || 0);

    // Group by ro_id to create RO items
    const roMap = new Map();
    (data || []).forEach((row: Record<string, unknown>) => {
      if (!roMap.has(row.ro_id)) {
        roMap.set(row.ro_id, {
          id: row.ro_id,
          store: row.store_name,
          createdAt: new Date(row.created_at as string).toLocaleDateString('en-GB'),
          currentStatus: row.status,
          dnpbNumberDDD: row.dnpb_number_ddd || null,
          dnpbNumberLJBB: row.dnpb_number_ljbb || null,
          totalBoxes: 0,
          totalArticles: 0,
          dddBoxes: 0,
          ljbbBoxes: 0,
          articles: [],
        });
      }
      const ro = roMap.get(row.ro_id);
      ro.totalArticles += 1;
      ro.totalBoxes += (row.boxes_requested as number) || 0;
      ro.dddBoxes += (row.boxes_allocated_ddd as number) || 0;
      ro.ljbbBoxes += (row.boxes_allocated_ljbb as number) || 0;
      ro.articles.push({
        kodeArtikel: row.article_code,
        namaArtikel: row.article_name || row.article_code,
        boxesRequested: (row.boxes_requested as number) || 0,
        dddBoxes: (row.boxes_allocated_ddd as number) || 0,
        ljbbBoxes: (row.boxes_allocated_ljbb as number) || 0,
      });
    });

    return NextResponse.json({
      success: true,
      data: Array.from(roMap.values()),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching RO process:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
