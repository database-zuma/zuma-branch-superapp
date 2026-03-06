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

    // store_name param kept for backward compat but no longer required.
    // ro_whs_readystock is WH-level (not store-specific).
    void new URL(request.url); // consume request.url for future param use
    // ro_recommendations table was deleted (Mar 2026).
    // Now returns available WH stock from ro_whs_readystock VIEW.
    // Iris AI will generate recommendations in the future.
    const { rows: stock } = await pool.query(
      `SELECT
         article_code, article_name, tier, tipe, gender, series,
         ddd_available, ljbb_available, mbb_available, ubb_available,
         total_available
       FROM ${SCHEMA}.ro_whs_readystock
       WHERE total_available > 0
       ORDER BY tier ASC, total_available DESC`
    );

    if (!stock || stock.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const transformedData = stock.map((s: Record<string, unknown>) => {
      const tier = (s.tier as number) || 99;
      return {
        article_code: s.article_code,
        article_name: s.article_name,
        suggested_boxes: 0, // No longer auto-suggested; Iris will provide
        total_recommendation: 0,
        priority: tier <= 2 ? 'urgent' : tier <= 4 ? 'normal' : 'low',
        tier: tier,
        assay_status: null,
        broken_size: null,
        warehouse_stock: {
          ddd_available: s.ddd_available || 0,
          ljbb_available: s.ljbb_available || 0,
          mbb_available: s.mbb_available || 0,
          ubb_available: s.ubb_available || 0,
          total_available: s.total_available || 0,
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
