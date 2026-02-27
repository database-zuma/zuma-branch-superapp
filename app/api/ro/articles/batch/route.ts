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

    const results = [];
    const errors = [];

    for (const update of updates) {
      const boxesRequested = update.dddBoxes + update.ljbbBoxes;

      const { rows: data, rowCount } = await pool.query(
        `UPDATE ${SCHEMA}.ro_process
         SET boxes_allocated_ddd = $1, boxes_allocated_ljbb = $2, boxes_requested = $3, updated_at = $4
         WHERE ro_id = $5 AND article_code = $6
         RETURNING *`,
        [update.dddBoxes, update.ljbbBoxes, boxesRequested, new Date().toISOString(), roId, update.articleCode]
      );

      if (!data || (rowCount ?? 0) === 0) {
        errors.push({ articleCode: update.articleCode, error: 'Article not found' });
      } else {
        results.push({ articleCode: update.articleCode, success: true });
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in batch update:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
