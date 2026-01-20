import { db, type Domain } from '@/lib/db';
import {
  hostingerClient,
  godaddyClient,
  namecheapClient,
  relateClient,
  normalizeHostingerDomain,
  normalizeGoDaddyDomain,
  normalizeNamecheapDomain,
  type UnifiedDomain,
  type BrandInfo as RelateBrandInfo,
} from '@/lib/api';

export type SyncSource = 'all' | 'hostinger' | 'godaddy' | 'namecheap';
export type SyncType = 'domains' | 'relate' | 'full';

export interface SyncResult {
  success: boolean;
  message: string;
  domainsFound?: number;
  domainsAdded?: number;
  domainsUpdated?: number;
  brandsPushed?: number;
  errors?: string[];
}

export interface SyncOptions {
  type: SyncType;
  source?: SyncSource;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { type, source = 'all' } = options;

  switch (type) {
    case 'domains':
      return syncDomains(source);
    case 'relate':
      return syncToRelate();
    case 'full':
      const domainResult = await syncDomains(source);
      if (!domainResult.success) {
        return domainResult;
      }
      const relateResult = await syncToRelate();
      return {
        success: relateResult.success,
        message: `Full sync completed: ${domainResult.message}. ${relateResult.message}`,
        domainsFound: domainResult.domainsFound,
        domainsAdded: domainResult.domainsAdded,
        domainsUpdated: domainResult.domainsUpdated,
        brandsPushed: relateResult.brandsPushed,
        errors: [...(domainResult.errors || []), ...(relateResult.errors || [])],
      };
    default:
      return { success: false, message: `Unknown sync type: ${type}` };
  }
}

async function syncDomains(source: SyncSource): Promise<SyncResult> {
  const log = await db.createSyncLog({ sync_type: 'domains', source });
  const errors: string[] = [];
  let allDomains: UnifiedDomain[] = [];

  try {
    // Fetch domains from specified sources
    if (source === 'all' || source === 'hostinger') {
      try {
        if (hostingerClient.isConfigured()) {
          const domains = await hostingerClient.listDomains();
          allDomains.push(...domains.map(normalizeHostingerDomain));
        } else {
          errors.push('Hostinger API not configured');
        }
      } catch (e) {
        errors.push(`Hostinger: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (source === 'all' || source === 'godaddy') {
      try {
        if (godaddyClient.isConfigured()) {
          const domains = await godaddyClient.getAllDomains();
          allDomains.push(...domains.map(normalizeGoDaddyDomain));
        } else {
          errors.push('GoDaddy API not configured');
        }
      } catch (e) {
        errors.push(`GoDaddy: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    if (source === 'all' || source === 'namecheap') {
      try {
        if (namecheapClient.isConfigured()) {
          const domains = await namecheapClient.getAllDomains();
          allDomains.push(...domains.map(normalizeNamecheapDomain));
        } else {
          errors.push('Namecheap API not configured');
        }
      } catch (e) {
        errors.push(`Namecheap: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // Get existing domains
    const existingDomains = await db.getDomains();
    const existingDomainMap = new Map(existingDomains.map((d) => [d.domain, d]));

    let domainsAdded = 0;
    let domainsUpdated = 0;

    // Upsert domains
    for (const domain of allDomains) {
      const existing = existingDomainMap.get(domain.domain);
      const isNew = !existing;

      await db.upsertDomain({
        domain: domain.domain,
        source: domain.source,
        source_id: domain.id,
        status: domain.status,
        expires_at: domain.expiresAt,
        last_synced_at: new Date().toISOString(),
      });

      if (isNew) {
        domainsAdded++;
      } else {
        domainsUpdated++;
      }
    }

    await db.updateSyncLog(log.id, {
      status: 'completed',
      domains_found: allDomains.length,
      domains_added: domainsAdded,
      domains_updated: domainsUpdated,
      completed_at: new Date().toISOString(),
      metadata: { errors },
    });

    return {
      success: true,
      message: `Synced ${allDomains.length} domains (${domainsAdded} new, ${domainsUpdated} updated)`,
      domainsFound: allDomains.length,
      domainsAdded,
      domainsUpdated,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
    console.error('Sync error:', e);
    try {
      await db.updateSyncLog(log.id, {
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('Failed to update sync log:', logError);
    }

    return {
      success: false,
      message: `Sync failed: ${errorMessage}`,
      errors: [errorMessage, ...errors],
    };
  }
}

async function syncToRelate(): Promise<SyncResult> {
  const log = await db.createSyncLog({ sync_type: 'relate', source: 'relate' });
  const errors: string[] = [];
  let brandsPushed = 0;

  try {
    if (!relateClient.isConfigured()) {
      throw new Error('Relate is not configured. Set either RELATE_API_TOKEN or NAMECHEAP_USERNAME/NAMECHEAP_PASSWORD for automation.');
    }

    const useAutomation = relateClient.isUsingAutomation();

    // Get domains with brand info that haven't been pushed to Relate
    const domainsWithBrands = await db.getDomainsWithBrands();
    const pendingDomains = domainsWithBrands.filter(
      (d) => d.brand_info && (!d.relate_brand || d.relate_brand.status === 'pending' || d.relate_brand.status === 'error')
    );

    if (useAutomation) {
      // Use browser automation - import dynamically to avoid loading Playwright in all contexts
      const { getRelateAutomation, closeRelateAutomation } = await import('@/lib/automation');
      const automation = getRelateAutomation({ headless: true });

      try {
        for (const domain of pendingDomains) {
          if (!domain.brand_info) continue;

          try {
            // Update status to syncing
            await db.upsertRelateBrand({
              domain_id: domain.id,
              relate_brand_id: null,
              status: 'syncing',
              directory_count: 0,
              last_synced_at: null,
              error_message: null,
            });

            // Convert to automation brand format
            const brandInfo: RelateBrandInfo = {
              domain: domain.domain,
              businessName: domain.brand_info.business_name,
              address: {
                street: domain.brand_info.street || '',
                city: domain.brand_info.city || '',
                state: domain.brand_info.state || '',
                zip: domain.brand_info.zip || '',
                country: domain.brand_info.country || 'US',
              },
              phone: domain.brand_info.phone || '',
              website: domain.brand_info.website || undefined,
              email: domain.brand_info.email || undefined,
              categories: domain.brand_info.categories || [],
              description: domain.brand_info.description || undefined,
              hours: domain.brand_info.hours || undefined,
              socialLinks: domain.brand_info.social_links || undefined,
              logo: domain.brand_info.logo_url || undefined,
            };

            // Push via automation
            const result = await automation.createBrand(brandInfo);

            if (result.success) {
              await db.upsertRelateBrand({
                domain_id: domain.id,
                relate_brand_id: result.brandId || null,
                status: 'active',
                directory_count: 0,
                last_synced_at: new Date().toISOString(),
                error_message: null,
              });
              brandsPushed++;
            } else {
              throw new Error(result.error || result.message);
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            errors.push(`${domain.domain}: ${errorMessage}`);

            await db.upsertRelateBrand({
              domain_id: domain.id,
              relate_brand_id: null,
              status: 'error',
              directory_count: 0,
              last_synced_at: null,
              error_message: errorMessage,
            });
          }
        }
      } finally {
        await closeRelateAutomation();
      }
    } else {
      // Use API client
      for (const domain of pendingDomains) {
        if (!domain.brand_info) continue;

        try {
          // Update status to syncing
          await db.upsertRelateBrand({
            domain_id: domain.id,
            relate_brand_id: null,
            status: 'syncing',
            directory_count: 0,
            last_synced_at: null,
            error_message: null,
          });

          // Convert to Relate brand format
          const brandInfo: RelateBrandInfo = {
            domain: domain.domain,
            businessName: domain.brand_info.business_name,
            address: {
              street: domain.brand_info.street || '',
              city: domain.brand_info.city || '',
              state: domain.brand_info.state || '',
              zip: domain.brand_info.zip || '',
              country: domain.brand_info.country || 'US',
            },
            phone: domain.brand_info.phone || '',
            website: domain.brand_info.website || undefined,
            email: domain.brand_info.email || undefined,
            categories: domain.brand_info.categories || [],
            description: domain.brand_info.description || undefined,
            hours: domain.brand_info.hours || undefined,
            socialLinks: domain.brand_info.social_links || undefined,
            logo: domain.brand_info.logo_url || undefined,
          };

          // Push to Relate API
          const relateBrand = await relateClient.createBrand(brandInfo);

          // Update with success
          await db.upsertRelateBrand({
            domain_id: domain.id,
            relate_brand_id: relateBrand.id,
            status: 'active',
            directory_count: relateBrand.directoryCount || 0,
            last_synced_at: new Date().toISOString(),
            error_message: null,
          });

          brandsPushed++;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          errors.push(`${domain.domain}: ${errorMessage}`);

          // Update with error
          await db.upsertRelateBrand({
            domain_id: domain.id,
            relate_brand_id: null,
            status: 'error',
            directory_count: 0,
            last_synced_at: null,
            error_message: errorMessage,
          });
        }
      }
    }

    await db.updateSyncLog(log.id, {
      status: 'completed',
      brands_pushed: brandsPushed,
      completed_at: new Date().toISOString(),
      metadata: { errors, totalPending: pendingDomains.length, useAutomation },
    });

    return {
      success: true,
      message: `Pushed ${brandsPushed} brands to Relate${useAutomation ? ' (via automation)' : ''}`,
      brandsPushed,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    await db.updateSyncLog(log.id, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });

    return {
      success: false,
      message: `Relate sync failed: ${errorMessage}`,
      errors: [errorMessage, ...errors],
    };
  }
}
