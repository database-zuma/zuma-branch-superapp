import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

interface ConfirmArticle {
  articleCode: string;
  articleName: string;
  boxQty: number;
  boxesDdd: number;
  boxesLjbb: number;
  boxesMbb: number;
  boxesUbb: number;
}

interface ConfirmBody {
  storeName: string;
  articles: ConfirmArticle[];
  notes?: string;
}

/**
 * POST /api/ro/upload/confirm
 *
 * Accepts the confirmed parsed data from the upload preview.
 * Generates a single ro_id and bulk inserts all articles into ro_process
 * with status = 'QUEUE'.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: ConfirmBody = await request.json();
    const { storeName, articles, notes } = body;

    if (!storeName) {
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

    // Filter out articles without article_code (unmapped)
    // We allow 0 quantity articles to be inserted (they will be caught at approval stage)
    const validArticles = articles.filter(a => a.articleCode);
    
    if (validArticles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid articles to insert (all unmapped)' },
        { status: 400 }
      );
    }

    // Use transaction to ensure RO ID generation + insert are atomic
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate RO ID inside transaction
      const { rows: roIdResult } = await client.query(
        `SELECT ${SCHEMA}.generate_ro_id() as ro_id`
      );

      if (!roIdResult || roIdResult.length === 0 || !roIdResult[0].ro_id) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Failed to generate RO ID' },
          { status: 500 }
        );
      }

      const roId = roIdResult[0].ro_id as string;

      // Build bulk INSERT
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;

      for (const article of validArticles) {
        const totalBoxes = article.boxesDdd + article.boxesLjbb + article.boxesMbb + article.boxesUbb;

        placeholders.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        values.push(
          roId,
          article.articleCode,
          article.articleName,
          totalBoxes,
          article.boxesDdd,
          article.boxesLjbb,
          article.boxesMbb,
          article.boxesUbb,
          'QUEUE',
          storeName,
          notes || null
        );
      }

      const { rows: inserted } = await client.query(
        `INSERT INTO ${SCHEMA}.ro_process
          (ro_id, article_code, article_name, boxes_requested, boxes_allocated_ddd, boxes_allocated_ljbb, boxes_allocated_mbb, boxes_allocated_ubb, status, store_name, notes)
         VALUES ${placeholders.join(', ')}
         RETURNING id, ro_id, article_code, article_name, boxes_requested`,
        values
      );

      if (!inserted || inserted.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Failed to insert articles into ro_process' },
          { status: 500 }
        );
      }

      await client.query('COMMIT');

      const totalBoxes = validArticles.reduce((sum, a) => a.boxesDdd + a.boxesLjbb + a.boxesMbb + a.boxesUbb + sum, 0);

      return NextResponse.json({
        success: true,
        data: {
          roId,
          storeName,
          articlesInserted: inserted.length,
          totalBoxes,
          status: 'QUEUE',
          skippedUnmapped: articles.length - validArticles.length,
        },
      });
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in upload confirm API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
