/**
 * Citations API
 * Main endpoint for managing citation submissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCitationClient, getProviderStatus } from '@/lib/api/citations';
import {
  queueDomainForSubmission,
  queueBulkSubmission,
  getDomainCitationCoverage,
  processQueueItem,
  getSubmission,
} from '@/lib/sync/citations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');
    const action = searchParams.get('action') || 'list';

    if (action === 'coverage' && domainId) {
      // Get citation coverage for a domain
      const coverage = await getDomainCitationCoverage(domainId);
      return NextResponse.json(coverage);
    }

    if (action === 'status') {
      // Get provider configuration status
      const status = getProviderStatus();
      const providers = await db.getCitationProviders();

      return NextResponse.json({
        configured: status.filter((s) => s.configured).length,
        total: status.length,
        providers: status.map((s) => {
          const provider = providers.find((p) => p.slug === s.slug);
          return {
            ...s,
            tier: provider?.tier || 0,
            isAggregator: provider?.is_aggregator || false,
            coverage: provider?.coverage_description || null,
          };
        }),
      });
    }

    if (domainId) {
      // Get submissions for a specific domain
      const submissions = await db.getCitationSubmissionsForDomain(domainId);
      return NextResponse.json({ submissions });
    }

    // Return general info
    const providers = await db.getEnabledCitationProviders();
    const status = getProviderStatus();

    return NextResponse.json({
      message: 'Citations API',
      endpoints: {
        'GET /api/citations?domainId=xxx': 'Get submissions for a domain',
        'GET /api/citations?domainId=xxx&action=coverage': 'Get citation coverage summary',
        'GET /api/citations?action=status': 'Get provider configuration status',
        'POST /api/citations': 'Submit citations (see actions below)',
      },
      actions: {
        'submit-single': 'Submit a domain to a single provider',
        'submit-bulk': 'Submit multiple domains to multiple providers',
        'check-status': 'Check status of a submission',
        'verify': 'Verify a submission exists on provider',
      },
      providers: providers.map((p) => ({
        slug: p.slug,
        name: p.name,
        tier: p.tier,
        configured: status.find((s) => s.slug === p.slug)?.configured || false,
      })),
    });
  } catch (error) {
    console.error('Citations GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get citations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'submit-single': {
        const { domainId, providerSlug } = body;

        if (!domainId || !providerSlug) {
          return NextResponse.json(
            { error: 'domainId and providerSlug are required' },
            { status: 400 }
          );
        }

        // Verify domain exists
        const domain = await db.getDomain(domainId);
        if (!domain) {
          return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        // Verify brand info exists
        const brandInfo = await db.getBrandInfo(domainId);
        if (!brandInfo) {
          return NextResponse.json(
            { error: 'Brand info not found for domain' },
            { status: 400 }
          );
        }

        // Check if provider is configured
        const client = getCitationClient(providerSlug);
        if (!client) {
          return NextResponse.json(
            { error: `Unknown provider: ${providerSlug}` },
            { status: 400 }
          );
        }

        if (!client.isConfigured()) {
          return NextResponse.json(
            { error: `Provider ${providerSlug} is not configured` },
            { status: 400 }
          );
        }

        // Submit directly (not queued)
        const result = await client.submit(client.normalizeBrandInfo(brandInfo));

        if (result.success) {
          // Save submission record
          await db.upsertCitationSubmission({
            domain_id: domainId,
            provider_slug: providerSlug,
            external_id: result.externalId || null,
            external_url: result.externalUrl || null,
            status: 'submitted',
            brand_info_hash: client.hashBrandInfo(brandInfo),
            error_message: null,
            error_count: 0,
            last_submitted_at: new Date().toISOString(),
            last_verified_at: null,
            last_error_at: null,
            metadata: result.metadata || {},
          });
        }

        return NextResponse.json({
          success: result.success,
          message: result.message || (result.success ? 'Submitted successfully' : 'Submission failed'),
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          error: result.error,
        });
      }

      case 'submit-bulk': {
        const { domainIds, providerSlugs, pushAll } = body;

        let targetDomainIds = domainIds;
        let targetProviderSlugs = providerSlugs;

        // If pushAll is true, get all domains with brand info
        if (pushAll) {
          const domains = await db.getDomainsWithBrands();
          targetDomainIds = domains
            .filter((d) => d.brand_info)
            .map((d) => d.id);
        }

        // If no providers specified, use all configured providers
        if (!targetProviderSlugs || targetProviderSlugs.length === 0) {
          const status = getProviderStatus();
          targetProviderSlugs = status
            .filter((s) => s.configured)
            .map((s) => s.slug);
        }

        if (!targetDomainIds || targetDomainIds.length === 0) {
          return NextResponse.json(
            { error: 'No domains to process' },
            { status: 400 }
          );
        }

        if (targetProviderSlugs.length === 0) {
          return NextResponse.json(
            { error: 'No providers configured' },
            { status: 400 }
          );
        }

        // Queue bulk submission
        const result = await queueBulkSubmission(
          targetDomainIds,
          targetProviderSlugs,
          body.batchName
        );

        const totalQueued = result.results.reduce((sum, r) => sum + r.queued.length, 0);
        const totalSkipped = result.results.reduce((sum, r) => sum + r.skipped.length, 0);
        const totalErrors = result.results.reduce((sum, r) => sum + r.errors.length, 0);

        return NextResponse.json({
          success: true,
          batchId: result.batchId,
          summary: {
            domains: targetDomainIds.length,
            providers: targetProviderSlugs.length,
            queued: totalQueued,
            skipped: totalSkipped,
            errors: totalErrors,
          },
          results: result.results,
        });
      }

      case 'check-status': {
        const { domainId, providerSlug } = body;

        if (!domainId || !providerSlug) {
          return NextResponse.json(
            { error: 'domainId and providerSlug are required' },
            { status: 400 }
          );
        }

        const submission = await getSubmission(domainId, providerSlug);

        if (!submission) {
          return NextResponse.json(
            { error: 'No submission found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          submission: {
            id: submission.id,
            status: submission.status,
            externalId: submission.external_id,
            externalUrl: submission.external_url,
            lastSubmittedAt: submission.last_submitted_at,
            lastVerifiedAt: submission.last_verified_at,
            errorMessage: submission.error_message,
            errorCount: submission.error_count,
          },
        });
      }

      case 'verify': {
        const { domainId, providerSlug } = body;

        if (!domainId || !providerSlug) {
          return NextResponse.json(
            { error: 'domainId and providerSlug are required' },
            { status: 400 }
          );
        }

        const submission = await getSubmission(domainId, providerSlug);
        if (!submission || !submission.external_id) {
          return NextResponse.json(
            { error: 'No submission with external ID found' },
            { status: 404 }
          );
        }

        const client = getCitationClient(providerSlug);
        if (!client || !client.isConfigured()) {
          return NextResponse.json(
            { error: `Provider ${providerSlug} is not available` },
            { status: 400 }
          );
        }

        const result = await client.verify(submission.external_id);

        // Update submission status
        if (result.success) {
          await db.updateCitationSubmissionStatus(submission.id, {
            status: result.status === 'verified' ? 'verified' : submission.status,
            last_verified_at: new Date().toISOString(),
            external_url: result.externalUrl || submission.external_url,
          });
        }

        return NextResponse.json({
          success: result.success,
          status: result.status,
          externalUrl: result.externalUrl,
          message: result.message,
          error: result.error,
        });
      }

      case 'queue-single': {
        const { domainId, providerSlugs } = body;

        if (!domainId) {
          return NextResponse.json(
            { error: 'domainId is required' },
            { status: 400 }
          );
        }

        let targetProviders = providerSlugs;
        if (!targetProviders || targetProviders.length === 0) {
          const status = getProviderStatus();
          targetProviders = status.filter((s) => s.configured).map((s) => s.slug);
        }

        const result = await queueDomainForSubmission(domainId, targetProviders);

        return NextResponse.json({
          success: result.errors.length === 0,
          queued: result.queued,
          skipped: result.skipped,
          errors: result.errors,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Citations POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process citation request' },
      { status: 500 }
    );
  }
}
