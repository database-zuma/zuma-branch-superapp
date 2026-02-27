import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { rows: stockData } = await pool.query(
      `SELECT "Kode Artikel", "Nama Artikel", "Entitas", tipe, gender, series,
              "Stock Akhir DDD", "Stock Akhir LJBB", "Stock Akhir MBB", "Stock Akhir UBB", "Stock Akhir Total",
              ro_ongoing_ddd, ro_ongoing_ljbb, ro_ongoing_mbb, ro_ongoing_ubb
       FROM ${SCHEMA}.master_mutasi_whs`
    );

    const processed = processStockData(stockData || []);

    return NextResponse.json({
      success: true,
      data: processed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in dashboard API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

interface ArticleStock {
  code: string;
  name: string;
  tipe: string;
  gender: string;
  series: string;
  ddd: number;
  ljbb: number;
  mbb: number;
  ubb: number;
  total: number;
  ro_ddd: number;
  ro_ljbb: number;
  ro_mbb: number;
  ro_ubb: number;
}

function processStockData(data: Record<string, unknown>[]) {
  const articlesMap = new Map<string, ArticleStock>();
  
  data.forEach((row) => {
    const code = row['Kode Artikel'] as string;
    if (!articlesMap.has(code)) {
      articlesMap.set(code, {
        code,
        name: (row['Nama Artikel'] as string) || '',
        tipe: (row.tipe as string) || '',
        gender: (row.gender as string) || '',
        series: (row.series as string) || '',
        ddd: 0,
        ljbb: 0,
        mbb: 0,
        ubb: 0,
        total: 0,
        ro_ddd: 0,
        ro_ljbb: 0,
        ro_mbb: 0,
        ro_ubb: 0,
      });
    }
    
    const article = articlesMap.get(code)!;
    article.ddd += Number(row['Stock Akhir DDD']) || 0;
    article.ljbb += Number(row['Stock Akhir LJBB']) || 0;
    article.mbb += Number(row['Stock Akhir MBB']) || 0;
    article.ubb += Number(row['Stock Akhir UBB']) || 0;
    article.total += Number(row['Stock Akhir Total']) || 0;
    article.ro_ddd += Number(row.ro_ongoing_ddd) || 0;
    article.ro_ljbb += Number(row.ro_ongoing_ljbb) || 0;
    article.ro_mbb += Number(row.ro_ongoing_mbb) || 0;
    article.ro_ubb += Number(row.ro_ongoing_ubb) || 0;
  });

  const articles = Array.from(articlesMap.values());

  const totalStock = articles.reduce((sum, a) => sum + a.total, 0);
  const totalDDD = articles.reduce((sum, a) => sum + a.ddd, 0);
  const totalLJBB = articles.reduce((sum, a) => sum + a.ljbb, 0);
  const totalMBB = articles.reduce((sum, a) => sum + a.mbb, 0);
  const totalUBB = articles.reduce((sum, a) => sum + a.ubb, 0);
  const totalRO = articles.reduce((sum, a) => sum + a.ro_ddd + a.ro_ljbb + a.ro_mbb + a.ro_ubb, 0);

  const byGender: Record<string, number> = {};
  const bySeries: Record<string, number> = {};
  const byTipe: Record<string, number> = {};

  articles.forEach((a) => {
    const gender = a.gender || 'Unknown';
    byGender[gender] = (byGender[gender] || 0) + a.total;

    const series = a.series || 'Unknown';
    bySeries[series] = (bySeries[series] || 0) + a.total;

    const tipe = a.tipe || 'Unknown';
    byTipe[tipe] = (byTipe[tipe] || 0) + a.total;
  });

  const lowStock = articles
    .filter(a => a.total > 0 && a.total < 10)
    .sort((a, b) => a.total - b.total)
    .slice(0, 10);

  const topStock = articles
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const totalArticles = articles.length;

  return {
    summary: {
      totalArticles,
      totalStock,
      totalDDD,
      totalLJBB,
      totalMBB,
      totalUBB,
      totalRO,
      availableStock: totalStock - totalRO,
    },
    breakdown: {
      byGender: Object.entries(byGender).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      bySeries: Object.entries(bySeries).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byTipe: Object.entries(byTipe).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    },
    alerts: {
      lowStock,
    },
    topStock,
  };
}
