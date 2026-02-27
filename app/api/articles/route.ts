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
    const query = searchParams.get('q') || '';

    let sql: string;
    let params: unknown[];

    if (query) {
      const searchPattern = `%${query}%`;
      sql = `SELECT * FROM ${SCHEMA}.master_mutasi_whs
             WHERE "Kode Artikel" ILIKE $1 OR "Nama Artikel" ILIKE $1
             ORDER BY "Nama Artikel"
             LIMIT 500`;
      params = [searchPattern];
    } else {
      sql = `SELECT * FROM ${SCHEMA}.master_mutasi_whs
             ORDER BY "Nama Artikel"
             LIMIT 500`;
      params = [];
    }

    const { rows: articles } = await pool.query(sql, params);

    if (!articles || articles.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Group by Kode Artikel and aggregate stock
    const articleMap = new Map();
    (articles || []).forEach((row: Record<string, unknown>) => {
      const code = row['Kode Artikel'];
      if (!code) return;
      
      if (!articleMap.has(code)) {
        articleMap.set(code, {
          code: code,
          name: row['Nama Artikel'],
          tipe: row['tipe'],
          gender: row['gender'],
          series: row['series'],
          ddd: 0,
          ljbb: 0,
          mbb: 0,
          ubb: 0,
          total: 0,
        });
      }
      const art = articleMap.get(code);
      art.ddd += Number(row['Stock Akhir DDD']) || 0;
      art.ljbb += Number(row['Stock Akhir LJBB']) || 0;
      art.mbb += Number(row['Stock Akhir MBB']) || 0;
      art.ubb += Number(row['Stock Akhir UBB']) || 0;
      art.total += Number(row['Stock Akhir Total']) || 0;
    });

    const transformedData = Array.from(articleMap.values()).map((article: Record<string, unknown>) => ({
      code: article.code,
      name: article.name,
      tipe: article.tipe,
      gender: article.gender,
      series: article.series,
      warehouse_stock: {
        ddd_available: article.ddd,
        ljbb_available: article.ljbb,
        mbb_available: article.mbb,
        ubb_available: article.ubb,
        total_available: article.total,
      },
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in articles API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
