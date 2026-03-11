import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

interface ActualUpdate {
  articleCode: string;
  dddBoxesActual: number;
  ljbbBoxesActual: number;
  mbbBoxesActual: number;
  ubbBoxesActual: number;
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { roId, articles } = await request.json() as { roId: string; articles: ActualUpdate[] };

    if (!roId || !articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'roId and articles array are required' },
        { status: 400 }
      );
    }

    // Verify RO status is PICKING or PICK_VERIFIED
    const { rows: statusCheck } = await pool.query(
      `SELECT status FROM ${SCHEMA}.ro_process WHERE ro_id = $1 LIMIT 1`,
      [roId]
    );

    if (!statusCheck || statusCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: `RO ${roId} not found` },
        { status: 404 }
      );
    }

    const currentStatus = statusCheck[0].status;
    if (!['PICKING', 'PICK_VERIFIED'].includes(currentStatus)) {
      return NextResponse.json(
        { success: false, error: `Cannot edit actual values when status is ${currentStatus}. Must be PICKING or PICK_VERIFIED.` },
        { status: 400 }
      );
    }

    // Validate all values are non-negative integers
    for (const article of articles) {
      const values = [article.dddBoxesActual, article.ljbbBoxesActual, article.mbbBoxesActual, article.ubbBoxesActual];
      for (const val of values) {
        if (typeof val !== 'number' || val < 0 || !Number.isInteger(val)) {
          return NextResponse.json(
            { success: false, error: `Invalid value for ${article.articleCode}: all actual values must be non-negative integers` },
            { status: 400 }
          );
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let updatedCount = 0;
      for (const article of articles) {
        const { rowCount } = await client.query(
          `UPDATE ${SCHEMA}.ro_process
           SET boxes_actual_ddd = $1, boxes_actual_ljbb = $2,
               boxes_actual_mbb = $3, boxes_actual_ubb = $4, updated_at = $5
           WHERE ro_id = $6 AND article_code = $7`,
          [
            article.dddBoxesActual,
            article.ljbbBoxesActual,
            article.mbbBoxesActual,
            article.ubbBoxesActual,
            new Date().toISOString(),
            roId,
            article.articleCode,
          ]
        );
        updatedCount += rowCount ?? 0;
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        data: { roId, updatedRows: updatedCount },
      });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error saving actual values:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
