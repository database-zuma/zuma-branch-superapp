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

    const { roId, articleCode, dddBoxes, ljbbBoxes } = await request.json();

    if (!roId || !articleCode) {
      return NextResponse.json(
        { success: false, error: 'roId and articleCode are required' },
        { status: 400 }
      );
    }

    if (dddBoxes < 0 || ljbbBoxes < 0) {
      return NextResponse.json(
        { success: false, error: 'Box quantities cannot be negative' },
        { status: 400 }
      );
    }

    const boxesRequested = (dddBoxes || 0) + (ljbbBoxes || 0);

    const { rows: data } = await pool.query(
      `UPDATE ${SCHEMA}.ro_process
       SET boxes_allocated_ddd = $1, boxes_allocated_ljbb = $2, boxes_requested = $3, updated_at = $4
       WHERE ro_id = $5 AND article_code = $6
       RETURNING *`,
      [dddBoxes || 0, ljbbBoxes || 0, boxesRequested, new Date().toISOString(), roId, articleCode]
    );

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `Article ${articleCode} not found in RO ${roId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        roId,
        articleCode,
        dddBoxes,
        ljbbBoxes,
        boxesRequested
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating article quantities:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
