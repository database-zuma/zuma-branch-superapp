import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { roId, updates } = await request.json();

    if (!roId || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'roId and updates array are required' },
        { status: 400 }
      );
    }

    const validationErrors: string[] = [];
    for (const update of updates) {
      if (!update.articleCode || typeof update.dddBoxes !== 'number' || typeof update.ljbbBoxes !== 'number') {
        validationErrors.push(`Invalid update format for article: ${update.articleCode || 'unknown'}`);
      }
      if (update.dddBoxes < 0 || update.ljbbBoxes < 0) {
        validationErrors.push(`${update.articleCode}: Box quantities cannot be negative`);
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const results = [];
      const errors = [];

      for (const update of updates) {
        const { rows: data, rowCount } = await client.query(
          `UPDATE ${SCHEMA}.ro_process
           SET boxes_allocated_ddd = $1, boxes_allocated_ljbb = $2,
               boxes_requested = $1 + $2 + boxes_allocated_mbb + boxes_allocated_ubb,
               updated_at = $3
           WHERE ro_id = $4 AND article_code = $5
           RETURNING *`,
          [update.dddBoxes, update.ljbbBoxes, new Date().toISOString(), roId, update.articleCode]
        );

        if (!data || (rowCount ?? 0) === 0) {
          errors.push({ articleCode: update.articleCode, error: 'Article not found' });
        } else {
          results.push({ articleCode: update.articleCode, success: true });
        }
      }

      await client.query('COMMIT');

      if (errors.length > 0) {
    return NextResponse.json({
            success: false,
            error: 'Some updates failed',
            failedUpdates: errors,
            successfulUpdates: results
          },
          { status: 207 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          roId,
          updatedCount: results.length,
          updates: results
        }
      });
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in batch update:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
