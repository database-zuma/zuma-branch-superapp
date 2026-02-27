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
    const storeName = searchParams.get('store_name');

    if (!storeName) {
      return NextResponse.json(
        { success: false, error: 'store_name parameter is required' },
        { status: 400 }
      );
    }

    const { rows: recs } = await pool.query(
      `SELECT * FROM ${SCHEMA}.ro_recommendations
       WHERE "Store Name" = $1 AND "Recommendation (box)" > 0
       ORDER BY "Tier" ASC`,
      [storeName]
    );

    if (!recs || recs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch stock data from master_mutasi_whs
    const articleCodes = recs.map((r: Record<string, unknown>) => r['kode kecil']);
    const { rows: stock } = await pool.query(
      `SELECT * FROM ${SCHEMA}.master_mutasi_whs
       WHERE "Kode Artikel" = ANY($1::text[])`,
      [articleCodes]
    );

    const stockMap = new Map((stock || []).map((s: Record<string, unknown>) => [s['Kode Artikel'], s]));

    const transformedData = recs.map((rec: Record<string, unknown>) => {
      const stockData = stockMap.get(rec['kode kecil']) as Record<string, unknown> | undefined;
      const tier = (rec['Tier'] as number) || 99;
      return {
        article_code: rec['kode kecil'],
        article_name: rec['Article'],
        suggested_boxes: rec['Recommendation (box)'] || 0,
        total_recommendation: rec['Total Recommendation'] || 0,
        priority: tier <= 2 ? 'urgent' : tier <= 4 ? 'normal' : 'low',
        tier: tier,
        assay_status: rec['ASSRT STATUS'],
        broken_size: rec['BROKEN SIZE'],
        warehouse_stock: {
          ddd_available: stockData?.['Stock Akhir DDD'] || 0,
          ljbb_available: stockData?.['Stock Akhir LJBB'] || 0,
          mbb_available: stockData?.['Stock Akhir MBB'] || 0,
          ubb_available: stockData?.['Stock Akhir UBB'] || 0,
          total_available: stockData?.['Stock Akhir Total'] || 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in recommendations API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
