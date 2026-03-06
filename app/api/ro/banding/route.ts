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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
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

        await client.query(
          `UPDATE ${SCHEMA}.ro_process SET status = $1, updated_at = $2 WHERE ro_id = $3`,
          ['BANDING_SENT', new Date().toISOString(), ro_id]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Banding transaction error:', txErr);
        const msg = txErr instanceof Error ? txErr.message : 'Transaction failed';
        return NextResponse.json(
          { success: false, error: msg },
          { status: 500 }
        );
      } finally {
        client.release();
      }

      return NextResponse.json({
        success: true,
        message: 'Banding notice created and RO status updated to BANDING_SENT'
      });
    } else {
      // CONFIRMED action
      const { rows: receiptData } = await pool.query(
        `SELECT article_code, fisik, pairs_per_box, boxes_ddd, boxes_ljbb, boxes_mbb, boxes_ubb
         FROM ${SCHEMA}.ro_receipt
         WHERE ro_id = $1`,
        [ro_id]
      );

      // Group by article_code and sum fisik across all sizes
      const articleMap = new Map<string, { totalFisik: number; pairsPerBox: number; boxesDdd: number; boxesLjbb: number; boxesMbb: number; boxesUbb: number }>();

      for (const item of receiptData || []) {
        const existing = articleMap.get(item.article_code);
        if (existing) {
          existing.totalFisik += item.fisik;
        } else {
          articleMap.set(item.article_code, {
            totalFisik: item.fisik,
            pairsPerBox: item.pairs_per_box,
            boxesDdd: item.boxes_ddd || 0,
            boxesLjbb: item.boxes_ljbb || 0,
            boxesMbb: item.boxes_mbb || 0,
            boxesUbb: item.boxes_ubb || 0,
          });
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const [articleCode, data] of articleMap.entries()) {
          const fisikBoxes = Math.ceil(data.totalFisik / data.pairsPerBox);
          const totalOriginalBoxes = data.boxesDdd + data.boxesLjbb + data.boxesMbb + data.boxesUbb;

          let dddBoxes = 0, ljbbBoxes = 0, mbbBoxes = 0, ubbBoxes = 0;

          if (totalOriginalBoxes > 0) {
            dddBoxes = Math.round(fisikBoxes * (data.boxesDdd / totalOriginalBoxes));
            ljbbBoxes = Math.round(fisikBoxes * (data.boxesLjbb / totalOriginalBoxes));
            mbbBoxes = Math.round(fisikBoxes * (data.boxesMbb / totalOriginalBoxes));
            ubbBoxes = fisikBoxes - dddBoxes - ljbbBoxes - mbbBoxes;
          }

          await client.query(
            `UPDATE ${SCHEMA}.ro_process
             SET status = $1, boxes_allocated_ddd = $2, boxes_allocated_ljbb = $3,
                 boxes_allocated_mbb = $4, boxes_allocated_ubb = $5, updated_at = $6
             WHERE ro_id = $7 AND article_code = $8`,
            ['COMPLETED', dddBoxes, ljbbBoxes, mbbBoxes, ubbBoxes, new Date().toISOString(), ro_id, articleCode]
          );
        }

        await client.query(
          `UPDATE ${SCHEMA}.ro_receipt
           SET status = $1, confirmed_by = $2, confirmed_at = $3
           WHERE ro_id = $4`,
          ['CONFIRMED_DISCREPANCY', session.user.id, new Date().toISOString(), ro_id]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Confirmed transaction error:', txErr);
        throw txErr;
      } finally {
        client.release();
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
