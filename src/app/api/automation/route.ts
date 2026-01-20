import { NextRequest, NextResponse } from 'next/server';
import { getRelateAutomation, closeRelateAutomation } from '@/lib/automation';
import { db } from '@/lib/db';
import type { BrandInfo } from '@/lib/api/relate';

export const maxDuration = 300; // 5 minutes for long-running automation

interface AutomationRequest {
  action: 'login' | 'create-brand' | 'sync-brand' | 'list-brands' | 'push-domain';
  domainId?: string;
  brandId?: string;
  brandInfo?: BrandInfo;
  headless?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AutomationRequest;
    const { action, domainId, brandId, brandInfo, headless = true } = body;

    // Validate required environment variables
    if (!process.env.NAMECHEAP_USERNAME || !process.env.NAMECHEAP_PASSWORD) {
      return NextResponse.json({
        success: false,
        message: 'NAMECHEAP_USERNAME and NAMECHEAP_PASSWORD must be configured',
      }, { status: 400 });
    }

    const automation = getRelateAutomation({ headless });

    try {
      switch (action) {
        case 'login': {
          const result = await automation.login();
          return NextResponse.json(result);
        }

        case 'create-brand': {
          if (!brandInfo) {
            return NextResponse.json({
              success: false,
              message: 'brandInfo is required for create-brand action',
            }, { status: 400 });
          }
          const result = await automation.createBrand(brandInfo);
          return NextResponse.json(result);
        }

        case 'sync-brand': {
          if (!brandId) {
            return NextResponse.json({
              success: false,
              message: 'brandId is required for sync-brand action',
            }, { status: 400 });
          }
          const result = await automation.syncBrand(brandId);
          return NextResponse.json(result);
        }

        case 'list-brands': {
          const result = await automation.listBrands();
          return NextResponse.json(result);
        }

        case 'push-domain': {
          // Push a domain from our database to Relate
          if (!domainId) {
            return NextResponse.json({
              success: false,
              message: 'domainId is required for push-domain action',
            }, { status: 400 });
          }

          // Get domain with brand info from database
          const domain = await db.getDomain(domainId);
          if (!domain) {
            return NextResponse.json({
              success: false,
              message: `Domain not found: ${domainId}`,
            }, { status: 404 });
          }

          if (!domain.brand_info) {
            return NextResponse.json({
              success: false,
              message: `Domain ${domain.domain} has no brand info configured`,
            }, { status: 400 });
          }

          // Convert database brand info to automation format
          const automationBrandInfo: BrandInfo = {
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

          // Update relate_brands status to syncing
          await db.upsertRelateBrand({
            domain_id: domainId,
            relate_brand_id: null,
            status: 'syncing',
            directory_count: 0,
            last_synced_at: null,
            error_message: null,
          });

          // Create brand via automation
          const result = await automation.createBrand(automationBrandInfo);

          // Update relate_brands with result
          if (result.success) {
            await db.upsertRelateBrand({
              domain_id: domainId,
              relate_brand_id: result.brandId || null,
              status: 'active',
              directory_count: 0,
              last_synced_at: new Date().toISOString(),
              error_message: null,
            });
          } else {
            await db.upsertRelateBrand({
              domain_id: domainId,
              relate_brand_id: null,
              status: 'error',
              directory_count: 0,
              last_synced_at: null,
              error_message: result.error || result.message,
            });
          }

          return NextResponse.json({
            ...result,
            domain: domain.domain,
          });
        }

        default:
          return NextResponse.json({
            success: false,
            message: `Unknown action: ${action}`,
          }, { status: 400 });
      }
    } finally {
      // Always close the browser after the request
      await closeRelateAutomation();
    }

  } catch (error) {
    console.error('Automation error:', error);
    await closeRelateAutomation();
    return NextResponse.json({
      success: false,
      message: 'Automation failed',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function GET() {
  const configured = !!(process.env.NAMECHEAP_USERNAME && process.env.NAMECHEAP_PASSWORD);

  return NextResponse.json({
    status: configured ? 'ready' : 'not_configured',
    message: configured
      ? 'Automation is configured and ready'
      : 'NAMECHEAP_USERNAME and NAMECHEAP_PASSWORD must be set',
    actions: {
      'login': 'Test login to Namecheap',
      'list-brands': 'List existing brands in Relate',
      'create-brand': 'Create a new brand (requires brandInfo)',
      'sync-brand': 'Trigger sync for a brand (requires brandId)',
      'push-domain': 'Push a domain from database to Relate (requires domainId)',
    },
  });
}
