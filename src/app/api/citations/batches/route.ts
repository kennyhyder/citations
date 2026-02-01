/**
 * Citation Batches API
 * Manage bulk citation operations and track batch progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');
    const status = searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null;

    // Get single batch by ID
    if (batchId) {
      const batch = await db.getCitationBatch(batchId);
      if (!batch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
      }

      // Get queue items for this batch
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: queueItems } = await supabase
        .from('citation_queue')
        .select(`
          *,
          submission:citation_submissions(
            id,
            domain_id,
            provider_slug,
            status,
            external_id,
            external_url,
            error_message
          )
        `)
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        batch,
        queueItems: queueItems || [],
        progress: {
          total: batch.total_submissions,
          completed: batch.completed_submissions,
          failed: batch.failed_submissions,
          pending: batch.total_submissions - batch.completed_submissions - batch.failed_submissions,
          percentage: batch.total_submissions > 0
            ? Math.round((batch.completed_submissions / batch.total_submissions) * 100)
            : 0,
        },
      });
    }

    // Get all batches, optionally filtered by status
    const batches = await db.getCitationBatches(status || undefined);

    return NextResponse.json({
      batches: batches.map((b) => ({
        ...b,
        progress: {
          completed: b.completed_submissions,
          failed: b.failed_submissions,
          total: b.total_submissions,
          percentage: b.total_submissions > 0
            ? Math.round((b.completed_submissions / b.total_submissions) * 100)
            : 0,
        },
      })),
    });
  } catch (error) {
    console.error('Citation batches GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get batches' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const batch = await db.getCitationBatch(id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    switch (action) {
      case 'cancel': {
        if (batch.status === 'completed' || batch.status === 'cancelled') {
          return NextResponse.json(
            { error: 'Batch is already completed or cancelled' },
            { status: 400 }
          );
        }

        await db.updateCitationBatchStatus(id, 'cancelled');

        // Cancel pending queue items
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        await supabase
          .from('citation_queue')
          .update({ completed_at: new Date().toISOString(), error_message: 'Batch cancelled' })
          .eq('batch_id', id)
          .is('completed_at', null);

        return NextResponse.json({
          success: true,
          message: 'Batch cancelled',
        });
      }

      case 'retry-failed': {
        // Re-queue failed items
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Get failed queue items
        const { data: failedItems } = await supabase
          .from('citation_queue')
          .select('*')
          .eq('batch_id', id)
          .not('error_message', 'is', null);

        if (!failedItems || failedItems.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No failed items to retry',
          });
        }

        // Reset failed items
        await supabase
          .from('citation_queue')
          .update({
            completed_at: null,
            started_at: null,
            error_message: null,
            attempts: 0,
          })
          .eq('batch_id', id)
          .not('error_message', 'is', null);

        // Update batch status
        await db.updateCitationBatchStatus(id, 'processing', {
          failed: 0,
        });

        return NextResponse.json({
          success: true,
          message: `Re-queued ${failedItems.length} failed items`,
          retriedCount: failedItems.length,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Citation batches PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update batch' },
      { status: 500 }
    );
  }
}
