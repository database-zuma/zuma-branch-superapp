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
    const { ro_id, action } = body;

    if (!ro_id) {
      return NextResponse.json(
        { success: false, error: 'RO ID is required' },
        { status: 400 }
      );
    }

    if (!action || !['BANDING', 'CONFIRMED'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Action must be BANDING or CONFIRMED' },
        { status: 400 }
      );
    }

    if (action === 'BANDING') {
      try {
        await pool.query(
          `INSERT INTO ${SCHEMA}.ro_banding_notices (ro_id, banding_by, banding_at, status, message)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            ro_id,
            session.user.id,
            new Date().toISOString(),
            'PENDING',
            'Warehouse confirmed correct quantities. SPG/B must re-check arrived stock. Possible miscount or fraud indication.'
          ]
        );
      } catch (insertErr) {
        console.error('Banding insert error:', insertErr);
        const msg = insertErr instanceof Error ? insertErr.message : 'Insert failed';
        return NextResponse.json(
          { success: false, error: msg },
          { status: 500 }
        );
      }

      try {
        await pool.query(
          `UPDATE ${SCHEMA}.ro_process SET status = $1, updated_at = $2 WHERE ro_id = $3`,
          ['BANDING_SENT', new Date().toISOString(), ro_id]
        );
      } catch (updateErr) {
        console.error('RO status update error:', updateErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Banding notice created and RO status updated to BANDING_SENT'
      });
    } else {
      // CONFIRMED action
      const { rows: receiptData } = await pool.query(
        `SELECT article_code, fisik, pairs_per_box, boxes_ddd, boxes_ljbb
         FROM ${SCHEMA}.ro_receipt
         WHERE ro_id = $1`,
        [ro_id]
      );

      for (const item of receiptData || []) {
        const fisikBoxes = Math.ceil(item.fisik / item.pairs_per_box);

        const totalOriginalBoxes = item.boxes_ddd + item.boxes_ljbb;
        let dddBoxes = 0;
        let ljbbBoxes = 0;

        if (totalOriginalBoxes > 0) {
          const dddRatio = item.boxes_ddd / totalOriginalBoxes;
          dddBoxes = Math.round(fisikBoxes * dddRatio);
          ljbbBoxes = fisikBoxes - dddBoxes;
        }

        try {
          await pool.query(
            `UPDATE ${SCHEMA}.ro_process
             SET status = $1, boxes_allocated_ddd = $2, boxes_allocated_ljbb = $3, updated_at = $4
             WHERE ro_id = $5 AND article_code = $6`,
            ['COMPLETED', dddBoxes, ljbbBoxes, new Date().toISOString(), ro_id, item.article_code]
          );
        } catch (processUpdateErr) {
          console.error('Process update error:', processUpdateErr);
        }
      }

      try {
        await pool.query(
          `UPDATE ${SCHEMA}.ro_receipt
           SET status = $1, confirmed_by = $2, confirmed_at = $3
           WHERE ro_id = $4`,
          ['CONFIRMED_DISCREPANCY', session.user.id, new Date().toISOString(), ro_id]
        );
      } catch (receiptUpdateErr) {
        console.error('Receipt update error:', receiptUpdateErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Discrepancy confirmed - RO marked as COMPLETED with actual received quantities'
      });
    }
  } catch (err) {
    console.error('Banding API error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
