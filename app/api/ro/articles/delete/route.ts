import { NextResponse } from 'next/server';
import { pool, SCHEMA } from '@/lib/db';

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const roId = searchParams.get('roId');
  const articleCode = searchParams.get('articleCode');

  if (!roId || !articleCode) {
    return NextResponse.json({ error: 'Missing roId or articleCode' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.ro_process WHERE ro_id = $1 AND article_code = $2`,
      [roId, articleCode]
    );

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.rowCount 
    });
  } catch (error) {
    console.error('Failed to delete RO item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
