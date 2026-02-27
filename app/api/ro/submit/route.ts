import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { store_name, articles, notes } = body;

    // Validation
    if (!store_name) {
      return NextResponse.json(
        { success: false, error: 'Store name is required' },
        { status: 400 }
      );
    }

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one article is required' },
        { status: 400 }
      );
    }

    const articleCodes = articles.map((a: Record<string, unknown>) => a.code);
    const { rows: stockData } = await pool.query(
      `SELECT "Kode Artikel", "Stock Akhir DDD", "Stock Akhir LJBB", "Stock Akhir Total"
       FROM ${SCHEMA}.master_mutasi_whs
       WHERE "Kode Artikel" = ANY($1::text[])`,
      [articleCodes]
    );

    const stockMap = new Map(
      (stockData || []).map((s: Record<string, unknown>) => [s['Kode Artikel'], {
        ddd: Number(s['Stock Akhir DDD']) || 0,
        ljbb: Number(s['Stock Akhir LJBB']) || 0,
        total: Number(s['Stock Akhir Total']) || 0,
      }])
    );

    const validationErrors: string[] = [];
    for (const article of articles) {
      const stock = stockMap.get(article.code);
      const requestedDDD = article.boxes_ddd || 0;
      const requestedLJBB = article.boxes_ljbb || 0;
      const requestedTotal = requestedDDD + requestedLJBB;

      if (!stock) {
        validationErrors.push(`${article.code}: Stock data not found`);
        continue;
      }

      const availableTotal = stock.ddd + stock.ljbb;

      if (requestedTotal > availableTotal) {
        validationErrors.push(
          `${article.code}: Insufficient stock. Requested: ${requestedTotal} boxes (DDD: ${requestedDDD}, LJBB: ${requestedLJBB}), Available: ${availableTotal} boxes (DDD: ${stock.ddd}, LJBB: ${stock.ljbb})`
        );
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Stock validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    const { rows: roIdResult } = await pool.query(
      `SELECT ${SCHEMA}.generate_ro_id() as ro_id`
    );

    if (!roIdResult || roIdResult.length === 0 || !roIdResult[0].ro_id) {
      console.error('Error generating RO ID');
      return NextResponse.json(
        { success: false, error: 'Failed to generate RO ID' },
        { status: 500 }
      );
    }

    const roId = roIdResult[0].ro_id as string;

    // Build bulk INSERT
    const values: unknown[] = [];
    const valuePlaceholders: string[] = [];
    let paramIndex = 1;

    for (const article of articles) {
      const boxesRequested = article.boxes
        ? article.boxes
        : (article.boxes_ddd || 0) + (article.boxes_ljbb || 0) + (article.boxes_mbb || 0) + (article.boxes_ubb || 0);

      valuePlaceholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(
        roId,
        article.code,
        article.name,
        boxesRequested,
        article.boxes_ddd || 0,
        article.boxes_ljbb || 0,
        article.boxes_mbb || 0,
        article.boxes_ubb || 0,
        'QUEUE',
        store_name,
        notes || null
      );
    }

    const { rows: data } = await pool.query(
      `INSERT INTO ${SCHEMA}.ro_process
        (ro_id, article_code, article_name, boxes_requested, boxes_allocated_ddd, boxes_allocated_ljbb, boxes_allocated_mbb, boxes_allocated_ubb, status, store_name, notes)
       VALUES ${valuePlaceholders.join(', ')}
       RETURNING *`,
      values
    );

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to insert RO' },
        { status: 500 }
      );
    }

    const totalBoxes = articles.reduce((sum: number, a: Record<string, number>) => {
      if (a.boxes) return sum + a.boxes;
      return sum + (a.boxes_ddd || 0) + (a.boxes_ljbb || 0) + (a.boxes_mbb || 0) + (a.boxes_ubb || 0);
    }, 0);

    return NextResponse.json({
      success: true,
      data: {
        ro_id: roId,
        store_name,
        articles_count: articles.length,
        total_boxes: totalBoxes,
        status: 'QUEUE',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in submit RO API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
