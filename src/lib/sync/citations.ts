/**
 * Citation Sync Workflow
 * Bulk sync engine for managing citation submissions across providers
 */

import { createClient } from '@supabase/supabase-js';
import { db, BrandInfo } from '@/lib/db';
import { getCitationClient, getConfiguredClients, BaseCitationClient } from '@/lib/api/citations';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export interface CitationProvider {
  id: string;
  slug: string;
  name: string;
  tier: number;
  auth_method: string;
  base_url: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  requires_credentials: boolean;
  is_aggregator: boolean;
  coverage_description: string | null;
  is_enabled: boolean;
}

export interface CitationSubmission {
  id: string;
  domain_id: string;
  provider_slug: string;
  external_id: string | null;
  external_url: string | null;
  status: 'pending' | 'queued' | 'submitting' | 'submitted' | 'verified' | 'error' | 'needs_update';
  brand_info_hash: string | null;
  error_message: string | null;
  error_count: number;
  last_submitted_at: string | null;
  last_verified_at: string | null;
  last_error_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CitationQueueItem {
  id: string;
  submission_id: string;
  action: 'submit' | 'update' | 'verify' | 'delete';
  priority: number;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  batch_id: string | null;
}

export interface CitationBatch {
  id: string;
  name: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_submissions: number;
  completed_submissions: number;
  failed_submissions: number;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
}

// ============ Provider Methods ============

export async function getProviders(): Promise<CitationProvider[]> {
  const { data, error } = await supabase
    .from('citation_providers')
    .select('*')
    .order('tier', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getProviderBySlug(slug: string): Promise<CitationProvider | null> {
  const { data, error } = await supabase
    .from('citation_providers')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getEnabledProviders(): Promise<CitationProvider[]> {
  const { data, error } = await supabase
    .from('citation_providers')
    .select('*')
    .eq('is_enabled', true)
    .order('tier', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============ Submission Methods ============

export async function getSubmission(domainId: string, providerSlug: string): Promise<CitationSubmission | null> {
  const { data, error } = await supabase
    .from('citation_submissions')
    .select('*')
    .eq('domain_id', domainId)
    .eq('provider_slug', providerSlug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getSubmissionsForDomain(domainId: string): Promise<CitationSubmission[]> {
  const { data, error } = await supabase
    .from('citation_submissions')
    .select('*')
    .eq('domain_id', domainId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertSubmission(
  submission: Omit<CitationSubmission, 'id' | 'created_at' | 'updated_at'>
): Promise<CitationSubmission> {
  const { data, error } = await supabase
    .from('citation_submissions')
    .upsert(submission, { onConflict: 'domain_id,provider_slug' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSubmissionStatus(
  id: string,
  updates: Partial<Pick<CitationSubmission, 'status' | 'external_id' | 'external_url' | 'error_message' | 'error_count' | 'last_submitted_at' | 'last_verified_at' | 'last_error_at' | 'metadata'>>
): Promise<CitationSubmission> {
  const { data, error } = await supabase
    .from('citation_submissions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Queue Methods ============

export async function addToQueue(
  submissionId: string,
  action: CitationQueueItem['action'],
  priority: number = 50,
  batchId?: string
): Promise<CitationQueueItem> {
  const { data, error } = await supabase
    .from('citation_queue')
    .insert({
      submission_id: submissionId,
      action,
      priority,
      batch_id: batchId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getNextQueueItems(limit: number = 10): Promise<(CitationQueueItem & { submission: CitationSubmission })[]> {
  const { data, error } = await supabase
    .from('citation_queue')
    .select(`
      *,
      submission:citation_submissions(*)
    `)
    .is('completed_at', null)
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', supabase.rpc('get_max_attempts'))
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  // Filter out items that have exceeded max_attempts
  return (data || []).filter(item => item.attempts < item.max_attempts);
}

export async function markQueueItemStarted(id: string): Promise<void> {
  const { error } = await supabase
    .from('citation_queue')
    .update({
      started_at: new Date().toISOString(),
      attempts: supabase.rpc('increment_attempts', { row_id: id }),
    })
    .eq('id', id);

  // Fallback: increment manually
  if (error) {
    await supabase
      .from('citation_queue')
      .update({ started_at: new Date().toISOString() })
      .eq('id', id);

    // Get current attempts and increment
    const { data: item } = await supabase
      .from('citation_queue')
      .select('attempts')
      .eq('id', id)
      .single();

    if (item) {
      await supabase
        .from('citation_queue')
        .update({ attempts: item.attempts + 1 })
        .eq('id', id);
    }
  }
}

export async function markQueueItemCompleted(id: string): Promise<void> {
  const { error } = await supabase
    .from('citation_queue')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function markQueueItemFailed(id: string, errorMessage: string): Promise<void> {
  // Just update the error message, the attempts are already incremented
  const { error } = await supabase
    .from('citation_queue')
    .update({
      error_message: errorMessage,
      started_at: null, // Reset so it can be retried
    })
    .eq('id', id);

  if (error) throw error;
}

// ============ Batch Methods ============

export async function createBatch(
  name?: string,
  createdBy?: string
): Promise<CitationBatch> {
  const { data, error } = await supabase
    .from('citation_batches')
    .insert({
      name,
      created_by: createdBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getBatch(id: string): Promise<CitationBatch | null> {
  const { data, error } = await supabase
    .from('citation_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function updateBatchStatus(
  id: string,
  status: CitationBatch['status'],
  counts?: { completed?: number; failed?: number }
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'processing' && !counts) {
    updates.started_at = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.completed_at = new Date().toISOString();
  }

  if (counts?.completed !== undefined) {
    updates.completed_submissions = counts.completed;
  }

  if (counts?.failed !== undefined) {
    updates.failed_submissions = counts.failed;
  }

  const { error } = await supabase
    .from('citation_batches')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

// ============ Sync Workflow Methods ============

/**
 * Queue a single domain for citation submission to specified providers
 */
export async function queueDomainForSubmission(
  domainId: string,
  providerSlugs: string[],
  batchId?: string
): Promise<{ queued: string[]; skipped: string[]; errors: string[] }> {
  const result = { queued: [] as string[], skipped: [] as string[], errors: [] as string[] };

  // Get brand info for the domain
  const brandInfo = await db.getBrandInfo(domainId);
  if (!brandInfo) {
    result.errors.push('No brand info found for domain');
    return result;
  }

  // Get a client to compute the hash
  const configuredClients = getConfiguredClients();
  const hashClient = configuredClients[0];
  if (!hashClient) {
    result.errors.push('No citation clients configured');
    return result;
  }

  const brandInfoHash = hashClient.hashBrandInfo(brandInfo);

  for (const slug of providerSlugs) {
    try {
      const client = getCitationClient(slug);
      if (!client) {
        result.errors.push(`Unknown provider: ${slug}`);
        continue;
      }

      if (!client.isConfigured()) {
        result.skipped.push(`${slug} (not configured)`);
        continue;
      }

      // Check existing submission
      const existing = await getSubmission(domainId, slug);

      if (existing) {
        // Check if brand info has changed
        if (existing.brand_info_hash === brandInfoHash && existing.status === 'verified') {
          result.skipped.push(`${slug} (already verified, no changes)`);
          continue;
        }

        // Update existing submission
        await upsertSubmission({
          ...existing,
          status: 'queued',
          brand_info_hash: brandInfoHash,
        });

        // Add to queue with appropriate action
        const action = existing.external_id ? 'update' : 'submit';
        await addToQueue(existing.id, action, 50, batchId);
        result.queued.push(slug);
      } else {
        // Create new submission
        const submission = await upsertSubmission({
          domain_id: domainId,
          provider_slug: slug,
          external_id: null,
          external_url: null,
          status: 'queued',
          brand_info_hash: brandInfoHash,
          error_message: null,
          error_count: 0,
          last_submitted_at: null,
          last_verified_at: null,
          last_error_at: null,
          metadata: {},
        });

        await addToQueue(submission.id, 'submit', 50, batchId);
        result.queued.push(slug);
      }
    } catch (error) {
      result.errors.push(`${slug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return result;
}

/**
 * Queue multiple domains for citation submission
 */
export async function queueBulkSubmission(
  domainIds: string[],
  providerSlugs: string[],
  batchName?: string
): Promise<{
  batchId: string;
  results: Array<{ domainId: string; queued: string[]; skipped: string[]; errors: string[] }>;
}> {
  // Create batch
  const batch = await createBatch(batchName || `Bulk submission ${new Date().toISOString()}`);

  // Update batch with total count
  await supabase
    .from('citation_batches')
    .update({ total_submissions: domainIds.length * providerSlugs.length })
    .eq('id', batch.id);

  const results: Array<{ domainId: string; queued: string[]; skipped: string[]; errors: string[] }> = [];

  for (const domainId of domainIds) {
    const result = await queueDomainForSubmission(domainId, providerSlugs, batch.id);
    results.push({ domainId, ...result });
  }

  // Update batch status
  await updateBatchStatus(batch.id, 'processing');

  return { batchId: batch.id, results };
}

/**
 * Process a single queue item
 */
export async function processQueueItem(
  item: CitationQueueItem & { submission: CitationSubmission }
): Promise<{ success: boolean; message: string }> {
  const { submission } = item;

  try {
    // Get the client
    const client = getCitationClient(submission.provider_slug);
    if (!client) {
      throw new Error(`Unknown provider: ${submission.provider_slug}`);
    }

    if (!client.isConfigured()) {
      throw new Error(`Provider ${submission.provider_slug} is not configured`);
    }

    // Get brand info
    const brandInfo = await db.getBrandInfo(submission.domain_id);
    if (!brandInfo) {
      throw new Error('Brand info not found');
    }

    // Mark submission as submitting
    await updateSubmissionStatus(submission.id, { status: 'submitting' });

    // Perform the action
    let result;
    switch (item.action) {
      case 'submit':
        result = await client.submit(client.normalizeBrandInfo(brandInfo));
        break;
      case 'update':
        if (!submission.external_id) {
          throw new Error('No external ID for update');
        }
        result = await client.update(submission.external_id, client.normalizeBrandInfo(brandInfo));
        break;
      case 'verify':
        if (!submission.external_id) {
          throw new Error('No external ID for verification');
        }
        result = await client.verify(submission.external_id);
        break;
      case 'delete':
        if (!submission.external_id) {
          throw new Error('No external ID for deletion');
        }
        result = await client.delete(submission.external_id);
        break;
      default:
        throw new Error(`Unknown action: ${item.action}`);
    }

    // Update submission based on result
    if (result.success) {
      const updates: Partial<{
        status: CitationSubmission['status'];
        external_id: string | null;
        external_url: string | null;
        error_message: string | null;
        last_submitted_at: string | null;
        last_verified_at: string | null;
      }> = {
        status: item.action === 'verify' ? 'verified' : 'submitted',
        last_submitted_at: new Date().toISOString(),
        error_message: null,
      };

      if ('externalId' in result && result.externalId) {
        updates.external_id = result.externalId as string;
      }
      if ('externalUrl' in result && result.externalUrl) {
        updates.external_url = result.externalUrl as string;
      }
      if ('status' in result && result.status === 'verified') {
        updates.status = 'verified';
        updates.last_verified_at = new Date().toISOString();
      }

      await updateSubmissionStatus(submission.id, updates);
      await markQueueItemCompleted(item.id);

      return {
        success: true,
        message: result.message || `${item.action} completed successfully`,
      };
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await updateSubmissionStatus(submission.id, {
      status: 'error',
      error_message: errorMessage,
      error_count: submission.error_count + 1,
      last_error_at: new Date().toISOString(),
    });

    await markQueueItemFailed(item.id, errorMessage);

    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Process pending queue items (called by cron)
 */
export async function processQueue(limit: number = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ submissionId: string; provider: string; success: boolean; message: string }>;
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0, results: [] as Array<{ submissionId: string; provider: string; success: boolean; message: string }> };

  // Get next items from queue
  const items = await getNextQueueItems(limit);

  for (const item of items) {
    // Mark as started
    await markQueueItemStarted(item.id);

    // Process the item
    const result = await processQueueItem(item);

    stats.processed++;
    if (result.success) {
      stats.succeeded++;
    } else {
      stats.failed++;
    }

    stats.results.push({
      submissionId: item.submission_id,
      provider: item.submission.provider_slug,
      success: result.success,
      message: result.message,
    });

    // Update batch counters if part of a batch
    if (item.batch_id) {
      const batch = await getBatch(item.batch_id);
      if (batch) {
        await updateBatchStatus(batch.id, 'processing', {
          completed: batch.completed_submissions + (result.success ? 1 : 0),
          failed: batch.failed_submissions + (result.success ? 0 : 1),
        });
      }
    }
  }

  return stats;
}

/**
 * Get citation coverage summary for a domain
 */
export async function getDomainCitationCoverage(domainId: string): Promise<{
  total: number;
  submitted: number;
  verified: number;
  pending: number;
  errors: number;
  providers: Array<{ slug: string; name: string; status: string; url?: string }>;
}> {
  const submissions = await getSubmissionsForDomain(domainId);
  const providers = await getProviders();

  const providerMap = new Map(providers.map((p) => [p.slug, p]));

  const summary = {
    total: providers.filter((p) => p.tier <= 2 && p.is_enabled).length,
    submitted: 0,
    verified: 0,
    pending: 0,
    errors: 0,
    providers: [] as Array<{ slug: string; name: string; status: string; url?: string }>,
  };

  for (const sub of submissions) {
    const provider = providerMap.get(sub.provider_slug);
    if (!provider) continue;

    summary.providers.push({
      slug: sub.provider_slug,
      name: provider.name,
      status: sub.status,
      url: sub.external_url || undefined,
    });

    switch (sub.status) {
      case 'submitted':
        summary.submitted++;
        break;
      case 'verified':
        summary.verified++;
        break;
      case 'pending':
      case 'queued':
      case 'submitting':
        summary.pending++;
        break;
      case 'error':
      case 'needs_update':
        summary.errors++;
        break;
    }
  }

  return summary;
}
