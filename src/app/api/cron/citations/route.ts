/**
 * Citations Cron Job
 * Processes pending citation queue items
 *
 * Call this endpoint periodically to process queued submissions
 * Recommended: Every 1-5 minutes via Vercel Cron or external scheduler
 */

import { NextRequest, NextResponse } from 'next/server';
import { processQueue, getBatch, updateBatchStatus } from '@/lib/sync/citations';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Get optional limit from request body
    let limit = 10;
    try {
      const body = await request.json();
      if (body.limit && typeof body.limit === 'number') {
        limit = Math.min(Math.max(1, body.limit), 50); // Clamp between 1 and 50
      }
    } catch {
      // No body or invalid JSON, use default limit
    }

    // Process queue
    const result = await processQueue(limit);

    // Check for completed batches
    const { data: processingBatches } = await supabase
      .from('citation_batches')
      .select('*')
      .eq('status', 'processing');

    for (const batch of processingBatches || []) {
      // Get pending items for this batch
      const { count } = await supabase
        .from('citation_queue')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .is('completed_at', null);

      if (count === 0) {
        // All items processed, mark batch as completed or failed
        const newStatus = batch.failed_submissions > 0 && batch.completed_submissions === 0
          ? 'failed'
          : 'completed';
        await updateBatchStatus(batch.id, newStatus);
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: `Processed ${result.processed} items: ${result.succeeded} succeeded, ${result.failed} failed`,
    });
  } catch (error) {
    console.error('Citations cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing and Vercel Cron
export async function GET(request: NextRequest) {
  // For GET requests, just verify it's from Vercel Cron or has the secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    // Vercel Cron sends the secret in a specific header
    const vercelCronSecret = request.headers.get('x-vercel-cron-secret');

    if (authHeader !== `Bearer ${cronSecret}` && vercelCronSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Delegate to POST handler
  return POST(request);
}
