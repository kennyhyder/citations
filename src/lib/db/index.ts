/**
 * Database module
 * Uses Supabase for data storage
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ============ Types ============

export interface Domain {
  id: string;
  domain: string;
  source: 'hostinger' | 'godaddy' | 'namecheap' | 'manual';
  source_id: string | null;
  status: string;
  expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandInfo {
  id: string;
  domain_id: string;
  business_name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  categories: string[] | null;
  description: string | null;
  hours: Record<string, { open: string; close: string }> | null;
  social_links: Record<string, string> | null;
  logo_url: string | null;
  image_urls: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface RelateBrand {
  id: string;
  domain_id: string;
  relate_brand_id: string | null;
  status: 'pending' | 'active' | 'error';
  directory_count: number;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MozLocalRecord {
  id: string;
  domain_id: string;
  moz_local_id: string | null;
  moz_business_id: string | null;
  status: 'pending' | 'active' | 'error';
  visibility_index: number | null;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  category: string;
  encrypted: boolean;
  created_at: string;
  updated_at: string;
}

// ============ Domain Methods ============

async function getDomain(id: string): Promise<Domain | null> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

async function getDomainByName(domain: string): Promise<Domain | null> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('domain', domain)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

async function getDomains(): Promise<Domain[]> {
  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getDomainsWithBrands(): Promise<(Domain & { brand_info: BrandInfo | null; relate_brand?: RelateBrand | null })[]> {
  const { data, error } = await supabase
    .from('domains')
    .select(`
      *,
      brand_info (*),
      relate_brands (*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Handle Supabase response format (can be object or array)
  return (data || []).map((d: Domain & { brand_info: BrandInfo | BrandInfo[] | null; relate_brands?: RelateBrand | RelateBrand[] | null }) => ({
    ...d,
    brand_info: Array.isArray(d.brand_info) ? d.brand_info[0] || null : d.brand_info,
    relate_brand: Array.isArray(d.relate_brands) ? d.relate_brands[0] || null : d.relate_brands || null,
  }));
}

async function upsertDomain(domain: Omit<Domain, 'id' | 'created_at' | 'updated_at'>): Promise<Domain> {
  const { data, error } = await supabase
    .from('domains')
    .upsert(domain, { onConflict: 'domain' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Brand Info Methods ============

async function getBrandInfo(domainId: string): Promise<BrandInfo | null> {
  const { data, error } = await supabase
    .from('brand_info')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

async function upsertBrandInfo(
  brandInfo: Omit<BrandInfo, 'id' | 'created_at' | 'updated_at'>
): Promise<BrandInfo> {
  const { data, error } = await supabase
    .from('brand_info')
    .upsert(brandInfo, { onConflict: 'domain_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Relate Brand Methods ============

async function getRelateBrand(domainId: string): Promise<RelateBrand | null> {
  const { data, error } = await supabase
    .from('relate_brands')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

async function upsertRelateBrand(
  brand: Omit<RelateBrand, 'id' | 'created_at' | 'updated_at'>
): Promise<RelateBrand> {
  const { data, error } = await supabase
    .from('relate_brands')
    .upsert(brand, { onConflict: 'domain_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ BrightLocal Brand Methods ============

export interface BrightLocalBrand {
  id: string;
  domain_id: string;
  brightlocal_location_id: string | null;
  brightlocal_campaign_id: string | null;
  status: 'pending' | 'active' | 'syncing' | 'error';
  citations_ordered: number;
  citations_completed: number;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

async function getBrightLocalBrand(domainId: string): Promise<BrightLocalBrand | null> {
  const { data, error } = await supabase
    .from('brightlocal_brands')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

async function upsertBrightLocalBrand(
  brand: Omit<BrightLocalBrand, 'id' | 'created_at' | 'updated_at'>
): Promise<BrightLocalBrand> {
  const { data, error } = await supabase
    .from('brightlocal_brands')
    .upsert(brand, { onConflict: 'domain_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateBrightLocalStatus(
  domainId: string,
  updates: {
    brightlocal_location_id?: string;
    brightlocal_campaign_id?: string;
    brightlocal_status?: 'pending' | 'active' | 'syncing' | 'error';
    brightlocal_synced_at?: string;
    error_message?: string | null;
    citations_ordered?: number;
    citations_completed?: number;
  }
): Promise<BrightLocalBrand> {
  // Map the input to the correct column names
  const dbUpdates: Partial<BrightLocalBrand> = {};
  if (updates.brightlocal_location_id !== undefined) dbUpdates.brightlocal_location_id = updates.brightlocal_location_id;
  if (updates.brightlocal_campaign_id !== undefined) dbUpdates.brightlocal_campaign_id = updates.brightlocal_campaign_id;
  if (updates.brightlocal_status !== undefined) dbUpdates.status = updates.brightlocal_status;
  if (updates.brightlocal_synced_at !== undefined) dbUpdates.last_synced_at = updates.brightlocal_synced_at;
  if (updates.error_message !== undefined) dbUpdates.error_message = updates.error_message;
  if (updates.citations_ordered !== undefined) dbUpdates.citations_ordered = updates.citations_ordered;
  if (updates.citations_completed !== undefined) dbUpdates.citations_completed = updates.citations_completed;

  // First try to update existing record
  const { data: existing } = await supabase
    .from('brightlocal_brands')
    .select('id')
    .eq('domain_id', domainId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('brightlocal_brands')
      .update(dbUpdates)
      .eq('domain_id', domainId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Create new record
    const { data, error } = await supabase
      .from('brightlocal_brands')
      .insert({
        domain_id: domainId,
        ...dbUpdates,
        status: dbUpdates.status || 'pending',
        citations_ordered: dbUpdates.citations_ordered || 0,
        citations_completed: dbUpdates.citations_completed || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// ============ Moz Local Methods ============

async function getMozLocalRecord(domainId: string): Promise<MozLocalRecord | null> {
  const { data, error } = await supabase
    .from('moz_local_records')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

async function upsertMozLocalRecord(
  record: Omit<MozLocalRecord, 'id' | 'created_at' | 'updated_at'>
): Promise<MozLocalRecord> {
  const { data, error } = await supabase
    .from('moz_local_records')
    .upsert(record, { onConflict: 'domain_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getMozLocalRecordByMozId(mozLocalId: string): Promise<MozLocalRecord | null> {
  const { data, error } = await supabase
    .from('moz_local_records')
    .select('*')
    .eq('moz_local_id', mozLocalId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ============ Settings Methods ============

async function getSettings(): Promise<Setting[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .order('category', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function updateSettings(settings: Record<string, string | null>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    const { error } = await supabase
      .from('settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) throw error;
  }
}

// ============ Sync Logs Methods ============

export interface SyncLog {
  id: string;
  sync_type: 'domains' | 'relate' | 'full';
  status: 'started' | 'completed' | 'failed';
  source: string | null;
  domains_found: number;
  domains_added: number;
  domains_updated: number;
  brands_pushed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
}

async function getRecentSyncLogs(limit: number = 10): Promise<SyncLog[]> {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function createSyncLog(
  log: Pick<SyncLog, 'sync_type' | 'source'> & { status?: SyncLog['status'] }
): Promise<SyncLog> {
  const { data, error } = await supabase
    .from('sync_logs')
    .insert({ ...log, status: log.status || 'started' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateSyncLog(
  id: string,
  updates: Partial<Omit<SyncLog, 'id' | 'started_at'>>
): Promise<SyncLog> {
  const { data, error } = await supabase
    .from('sync_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============ Dashboard Stats ============

interface DashboardStats {
  totalDomains: number;
  bySource: Record<string, number>;
  inRelate: number;
  pendingSync: number;
  withBrandInfo: number;
}

async function getDashboardStats(): Promise<DashboardStats> {
  // Get all domains with related data
  const { data: domains, error: domainsError } = await supabase
    .from('domains')
    .select('id, source');

  if (domainsError) throw domainsError;

  // Get brand info count
  const { count: brandInfoCount, error: brandError } = await supabase
    .from('brand_info')
    .select('*', { count: 'exact', head: true });

  if (brandError) throw brandError;

  // Get relate brands count
  const { count: relateCount, error: relateError } = await supabase
    .from('relate_brands')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (relateError) throw relateError;

  // Calculate stats
  const bySource: Record<string, number> = {};
  for (const domain of domains || []) {
    bySource[domain.source] = (bySource[domain.source] || 0) + 1;
  }

  // Pending sync = domains with brand_info but not in relate
  const { count: pendingCount, error: pendingError } = await supabase
    .from('brand_info')
    .select('domain_id', { count: 'exact', head: true });

  if (pendingError) throw pendingError;

  return {
    totalDomains: domains?.length || 0,
    bySource,
    inRelate: relateCount || 0,
    pendingSync: (pendingCount || 0) - (relateCount || 0),
    withBrandInfo: brandInfoCount || 0,
  };
}

// ============ Citation Types ============

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
  documentation_url: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

// ============ Citation Provider Methods ============

async function getCitationProviders(): Promise<CitationProvider[]> {
  const { data, error } = await supabase
    .from('citation_providers')
    .select('*')
    .order('tier', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getCitationProviderBySlug(slug: string): Promise<CitationProvider | null> {
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

async function getEnabledCitationProviders(): Promise<CitationProvider[]> {
  const { data, error } = await supabase
    .from('citation_providers')
    .select('*')
    .eq('is_enabled', true)
    .order('tier', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============ Citation Submission Methods ============

async function getCitationSubmission(domainId: string, providerSlug: string): Promise<CitationSubmission | null> {
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

async function getCitationSubmissionsForDomain(domainId: string): Promise<CitationSubmission[]> {
  const { data, error } = await supabase
    .from('citation_submissions')
    .select('*')
    .eq('domain_id', domainId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function upsertCitationSubmission(
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

async function updateCitationSubmissionStatus(
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

// ============ Citation Queue Methods ============

async function addToCitationQueue(
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

async function getNextCitationQueueItems(limit: number = 10): Promise<(CitationQueueItem & { submission: CitationSubmission })[]> {
  const { data, error } = await supabase
    .from('citation_queue')
    .select(`
      *,
      submission:citation_submissions(*)
    `)
    .is('completed_at', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  // Filter out items that have exceeded max_attempts
  return (data || []).filter(item => item.attempts < item.max_attempts);
}

async function updateCitationQueueItem(
  id: string,
  updates: Partial<Pick<CitationQueueItem, 'started_at' | 'completed_at' | 'error_message' | 'attempts'>>
): Promise<void> {
  const { error } = await supabase
    .from('citation_queue')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

// ============ Citation Batch Methods ============

async function createCitationBatch(name?: string, createdBy?: string): Promise<CitationBatch> {
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

async function getCitationBatch(id: string): Promise<CitationBatch | null> {
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

async function updateCitationBatchStatus(
  id: string,
  status: CitationBatch['status'],
  counts?: { completed?: number; failed?: number; total?: number }
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'processing') {
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
  if (counts?.total !== undefined) {
    updates.total_submissions = counts.total;
  }

  const { error } = await supabase
    .from('citation_batches')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

async function getCitationBatches(status?: CitationBatch['status']): Promise<CitationBatch[]> {
  let query = supabase
    .from('citation_batches')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============ Aggregator Distribution Methods ============

interface AggregatorDistribution {
  id: string;
  aggregator_slug: string;
  directory_name: string;
  directory_url: string | null;
  notes: string | null;
  created_at: string;
}

async function getAggregatorDistributions(aggregatorSlug?: string): Promise<AggregatorDistribution[]> {
  let query = supabase
    .from('aggregator_distributions')
    .select('*')
    .order('directory_name', { ascending: true });

  if (aggregatorSlug) {
    query = query.eq('aggregator_slug', aggregatorSlug);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============ Export ============

export const db = {
  // Domains
  getDomain,
  getDomainByName,
  getDomains,
  getDomainsWithBrands,
  upsertDomain,

  // Brand Info
  getBrandInfo,
  upsertBrandInfo,

  // Relate Brands
  getRelateBrand,
  upsertRelateBrand,

  // BrightLocal Brands
  getBrightLocalBrand,
  upsertBrightLocalBrand,
  updateBrightLocalStatus,

  // Moz Local
  getMozLocalRecord,
  upsertMozLocalRecord,
  getMozLocalRecordByMozId,

  // Settings
  getSettings,
  updateSettings,

  // Sync Logs
  getRecentSyncLogs,
  createSyncLog,
  updateSyncLog,

  // Dashboard
  getDashboardStats,

  // Citation Providers
  getCitationProviders,
  getCitationProviderBySlug,
  getEnabledCitationProviders,

  // Citation Submissions
  getCitationSubmission,
  getCitationSubmissionsForDomain,
  upsertCitationSubmission,
  updateCitationSubmissionStatus,

  // Citation Queue
  addToCitationQueue,
  getNextCitationQueueItems,
  updateCitationQueueItem,

  // Citation Batches
  createCitationBatch,
  getCitationBatch,
  updateCitationBatchStatus,
  getCitationBatches,

  // Aggregator Distributions
  getAggregatorDistributions,
};
