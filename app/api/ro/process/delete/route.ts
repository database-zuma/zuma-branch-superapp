import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const roId = searchParams.get('roId');

  if (!roId) {
    return NextResponse.json({ error: 'Missing roId' }, { status: 400 });
  }

  try {
    // Delete all rows with this ro_id
    // This assumes ro_id is consistently populated for all items in the batch
    const result = await pool.query(
      'DELETE FROM branch_super_app_clawdbot.ro_process WHERE ro_id = $1',
      [roId]
    );

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.rowCount 
    });
  } catch (error) {
    console.error('Failed to delete RO:', error);
    return NextResponse.json(
      { error: 'Failed to delete RO' },
      { status: 500 }
    );
  }
}
