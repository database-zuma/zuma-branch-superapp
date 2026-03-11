import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

const VALID_STATUSES = [
  'QUEUE',
  'APPROVED',
  'PICKING',
  'PICK_VERIFIED',
  'DNPB_PROCESS',
  'READY_TO_SHIP',
  'IN_DELIVERY',
  'ARRIVED',
  'BANDING_SENT',
  'COMPLETED',
  'CANCELLED'
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  'QUEUE': ['APPROVED', 'CANCELLED'],
  'APPROVED': ['PICKING', 'CANCELLED'],
  'PICKING': ['PICK_VERIFIED', 'CANCELLED'],
  'PICK_VERIFIED': ['DNPB_PROCESS', 'CANCELLED'],
  'DNPB_PROCESS': ['READY_TO_SHIP', 'CANCELLED'],
  'READY_TO_SHIP': ['IN_DELIVERY', 'CANCELLED'],
  'IN_DELIVERY': ['ARRIVED', 'CANCELLED'],
  'ARRIVED': ['COMPLETED', 'CANCELLED'],
  'BANDING_SENT': ['ARRIVED', 'COMPLETED', 'CANCELLED'],
  'COMPLETED': [],
  'CANCELLED': []
};

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { roId, status } = await request.json();

    if (!roId || !status) {
      return NextResponse.json(
        { success: false, error: 'roId and status are required' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const { rows: currentData } = await pool.query(
      `SELECT status FROM ${SCHEMA}.ro_process WHERE ro_id = $1 LIMIT 1`,
      [roId]
    );

    if (!currentData || currentData.length === 0) {
      return NextResponse.json(
        { success: false, error: `RO ${roId} not found` },
        { status: 404 }
      );
    }

    const currentStatus = currentData[0].status;
    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Cannot transition from ${currentStatus} to ${status}. Allowed: ${allowedNextStatuses.join(', ') || 'none'}` },
        { status: 400 }
      );
    }

    // CHECK: Guardrail for 0 quantity items before Approval
    if (status === 'APPROVED' && currentStatus === 'QUEUE') {
      const { rows: zeroItems } = await pool.query(
        `SELECT article_code, 
                (boxes_allocated_ddd + boxes_allocated_ljbb + boxes_allocated_mbb + boxes_allocated_ubb) as total_qty
         FROM ${SCHEMA}.ro_process 
         WHERE ro_id = $1`,
        [roId]
      );

      const invalidItems = zeroItems.filter(item => Number(item.total_qty) <= 0);
      
      if (invalidItems.length > 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot approve: Found ${invalidItems.length} items with 0 quantity (${invalidItems.map((i: { article_code: string }) => i.article_code).join(', ')}). Please remove them or update quantity.`
          },
          { status: 400 }
        );
      }
    }

    // When transitioning APPROVED → PICKING, copy plan values to actual as initial values
    if (status === 'PICKING' && currentStatus === 'APPROVED') {
      await pool.query(
        `UPDATE ${SCHEMA}.ro_process
         SET boxes_actual_ddd = boxes_allocated_ddd,
             boxes_actual_ljbb = boxes_allocated_ljbb,
             boxes_actual_mbb = boxes_allocated_mbb,
             boxes_actual_ubb = boxes_allocated_ubb
         WHERE ro_id = $1`,
        [roId]
      );
    }

    const { rows: data } = await pool.query(
      `UPDATE ${SCHEMA}.ro_process SET status = $1, updated_at = $2 WHERE ro_id = $3 RETURNING *`,
      [status, new Date().toISOString(), roId]
    );

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `RO ${roId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        roId,
        status,
        updatedRows: data.length
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating RO status:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
