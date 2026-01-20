import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use 'any' for database type since we don't have generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// Database types
export interface Domain {
  id: string;
  domain: string;
  source: 'hostinger' | 'godaddy' | 'namecheap' | 'manual';
  source_id: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

export interface BrandInfo {
  id: string;
  domain_id: string;
  business_name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
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
  status: 'pending' | 'active' | 'syncing' | 'error';
  directory_count: number;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface Setting {
  id: string;
  key: string;
  value: string | null;
  encrypted: boolean;
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

// Extended domain with brand info
export interface DomainWithBrand extends Domain {
  brand_info: BrandInfo | null;
  relate_brand: RelateBrand | null;
  brightlocal_brand: BrightLocalBrand | null;
}

// Create Supabase client with lazy initialization
// This prevents errors during build when env vars aren't available
let _supabase: SupabaseClient<Database> | null = null;
let _supabaseAdmin: SupabaseClient<Database> | null = null;

function getSupabase(): SupabaseClient<Database> {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key must be configured in environment variables');
  }

  _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (_supabaseAdmin) return _supabaseAdmin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL must be configured in environment variables');
  }

  if (supabaseServiceKey) {
    _supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey);
  } else {
    _supabaseAdmin = getSupabase();
  }
  return _supabaseAdmin;
}

export { getSupabase as supabase, getSupabaseAdmin as supabaseAdmin };

// Database helper functions
export const db = {
  // Domains
  async getDomains(): Promise<Domain[]> {
    const { data, error } = await getSupabase()
      .from('domains')
      .select('*')
      .order('domain', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getDomainsWithBrands(): Promise<DomainWithBrand[]> {
    // Supabase has a default limit of 1000 rows, so we need to paginate to get all
    const allData: DomainWithBrand[] = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await getSupabase()
        .from('domains')
        .select(`
          *,
          brand_info (*),
          relate_brand:relate_brands (*),
          brightlocal_brand:brightlocal_brands (*)
        `)
        .order('domain', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        // Handle both array and single object responses from Supabase
        const normalizeSingle = (val: unknown) => {
          if (!val) return null;
          if (Array.isArray(val)) return val[0] || null;
          return val;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = data.map((d: any) => ({
          ...d,
          brand_info: normalizeSingle(d.brand_info),
          relate_brand: normalizeSingle(d.relate_brand),
          brightlocal_brand: normalizeSingle(d.brightlocal_brand),
        }));
        allData.push(...mapped);
        offset += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return allData;
  },

  async getDomain(id: string): Promise<DomainWithBrand | null> {
    const { data, error } = await getSupabase()
      .from('domains')
      .select(`
        *,
        brand_info (*),
        relate_brand:relate_brands (*),
        brightlocal_brand:brightlocal_brands (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    // Handle both array and single object responses from Supabase
    const normalizeSingle = (val: unknown) => {
      if (!val) return null;
      if (Array.isArray(val)) return val[0] || null;
      return val;
    };
    return {
      ...d,
      brand_info: normalizeSingle(d.brand_info),
      relate_brand: normalizeSingle(d.relate_brand),
      brightlocal_brand: normalizeSingle(d.brightlocal_brand),
    };
  },

  async getDomainByName(domain: string): Promise<Domain | null> {
    const { data, error } = await getSupabase()
      .from('domains')
      .select('*')
      .eq('domain', domain)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsertDomain(domain: Omit<Domain, 'id' | 'created_at' | 'updated_at'>): Promise<Domain> {
    const { data, error } = await getSupabase()
      .from('domains')
      .upsert(domain, { onConflict: 'domain' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async bulkUpsertDomains(domains: Omit<Domain, 'id' | 'created_at' | 'updated_at'>[]): Promise<Domain[]> {
    const { data, error } = await getSupabase()
      .from('domains')
      .upsert(domains, { onConflict: 'domain' })
      .select();

    if (error) throw error;
    return data || [];
  },

  // Brand Info
  async getBrandInfo(domainId: string): Promise<BrandInfo | null> {
    const { data, error } = await getSupabase()
      .from('brand_info')
      .select('*')
      .eq('domain_id', domainId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsertBrandInfo(brandInfo: Omit<BrandInfo, 'id' | 'created_at' | 'updated_at'>): Promise<BrandInfo> {
    const { data, error } = await getSupabase()
      .from('brand_info')
      .upsert(brandInfo, { onConflict: 'domain_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Relate Brands
  async getRelateBrand(domainId: string): Promise<RelateBrand | null> {
    const { data, error } = await getSupabase()
      .from('relate_brands')
      .select('*')
      .eq('domain_id', domainId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsertRelateBrand(brand: Omit<RelateBrand, 'id' | 'created_at' | 'updated_at'>): Promise<RelateBrand> {
    const { data, error } = await getSupabase()
      .from('relate_brands')
      .upsert(brand, { onConflict: 'domain_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPendingRelateBrands(): Promise<(RelateBrand & { domain: Domain; brand_info: BrandInfo })[]> {
    const { data, error } = await getSupabase()
      .from('relate_brands')
      .select(`
        *,
        domain:domains (*),
        brand_info:brand_info (*)
      `)
      .in('status', ['pending', 'error'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((d: any) => ({
      ...d,
      domain: d.domain,
      brand_info: d.brand_info?.[0] || null,
    }));
  },

  // Sync Logs
  async createSyncLog(log: Pick<SyncLog, 'sync_type' | 'source'>): Promise<SyncLog> {
    const { data, error } = await getSupabase()
      .from('sync_logs')
      .insert({
        ...log,
        status: 'started',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSyncLog(
    id: string,
    updates: Partial<Pick<SyncLog, 'status' | 'domains_found' | 'domains_added' | 'domains_updated' | 'brands_pushed' | 'error_message' | 'completed_at' | 'metadata'>>
  ): Promise<SyncLog> {
    const { data, error } = await getSupabase()
      .from('sync_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getRecentSyncLogs(limit: number = 10): Promise<SyncLog[]> {
    const { data, error } = await getSupabase()
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // BrightLocal Brands
  async getBrightLocalBrand(domainId: string): Promise<BrightLocalBrand | null> {
    const { data, error } = await getSupabase()
      .from('brightlocal_brands')
      .select('*')
      .eq('domain_id', domainId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsertBrightLocalBrand(brand: Omit<BrightLocalBrand, 'id' | 'created_at' | 'updated_at'>): Promise<BrightLocalBrand> {
    const { data, error } = await getSupabase()
      .from('brightlocal_brands')
      .upsert(brand, { onConflict: 'domain_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateBrightLocalStatus(domainId: string, updates: {
    brightlocal_location_id?: string | null;
    brightlocal_campaign_id?: string | null;
    brightlocal_status?: string;
    brightlocal_synced_at?: string | null;
    error_message?: string | null;
  }): Promise<BrightLocalBrand> {
    // First try to update existing record
    const existing = await db.getBrightLocalBrand(domainId);

    if (existing) {
      const { data, error } = await getSupabase()
        .from('brightlocal_brands')
        .update({
          brightlocal_location_id: updates.brightlocal_location_id ?? existing.brightlocal_location_id,
          brightlocal_campaign_id: updates.brightlocal_campaign_id ?? existing.brightlocal_campaign_id,
          status: updates.brightlocal_status ?? existing.status,
          last_synced_at: updates.brightlocal_synced_at ?? existing.last_synced_at,
          error_message: updates.error_message ?? existing.error_message,
        })
        .eq('domain_id', domainId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new record
      return db.upsertBrightLocalBrand({
        domain_id: domainId,
        brightlocal_location_id: updates.brightlocal_location_id || null,
        brightlocal_campaign_id: updates.brightlocal_campaign_id || null,
        status: (updates.brightlocal_status as 'pending' | 'active' | 'syncing' | 'error') || 'pending',
        citations_ordered: 0,
        citations_completed: 0,
        last_synced_at: updates.brightlocal_synced_at || null,
        error_message: updates.error_message || null,
      });
    }
  },

  // Stats
  async getDashboardStats(): Promise<{
    totalDomains: number;
    bySource: Record<string, number>;
    inRelate: number;
    inBrightLocal: number;
    pendingSync: number;
    withBrandInfo: number;
  }> {
    const supabase = getSupabase();
    const [domainsResult, relateResult, brightLocalResult, brandResult] = await Promise.all([
      supabase.from('domains').select('source', { count: 'exact' }),
      supabase.from('relate_brands').select('status', { count: 'exact' }),
      supabase.from('brightlocal_brands').select('status', { count: 'exact' }),
      supabase.from('brand_info').select('id', { count: 'exact' }),
    ]);

    const domains = domainsResult.data || [];
    const relateBrands = relateResult.data || [];
    const brightLocalBrands = brightLocalResult.data || [];

    const bySource = domains.reduce((acc, d) => {
      acc[d.source] = (acc[d.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalDomains: domainsResult.count || 0,
      bySource,
      inRelate: relateBrands.filter(r => r.status === 'active').length,
      inBrightLocal: brightLocalBrands.filter(r => r.status === 'active').length,
      pendingSync: relateBrands.filter(r => r.status === 'pending' || r.status === 'error').length +
                   brightLocalBrands.filter(r => r.status === 'pending' || r.status === 'error').length,
      withBrandInfo: brandResult.count || 0,
    };
  },

  // Settings
  async getSettings(): Promise<Setting[]> {
    const { data, error } = await getSupabase()
      .from('settings')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getSettingsByCategory(category: string): Promise<Setting[]> {
    const { data, error } = await getSupabase()
      .from('settings')
      .select('*')
      .eq('category', category)
      .order('key', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await getSupabase()
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.value || null;
  },

  async getSettingsMap(): Promise<Record<string, string>> {
    const settings = await db.getSettings();
    return settings.reduce((acc, s) => {
      if (s.value) {
        acc[s.key] = s.value;
      }
      return acc;
    }, {} as Record<string, string>);
  },

  async upsertSetting(key: string, value: string | null, description?: string, category?: string): Promise<Setting> {
    const { data, error } = await getSupabase()
      .from('settings')
      .upsert({
        key,
        value,
        description,
        category: category || 'general',
      }, { onConflict: 'key' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSettings(settings: Record<string, string | null>): Promise<void> {
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
    }));

    for (const update of updates) {
      await getSupabase()
        .from('settings')
        .update({ value: update.value })
        .eq('key', update.key);
    }
  },
};
