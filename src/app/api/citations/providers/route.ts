/**
 * Citation Providers API
 * Manage and view citation provider configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProviderStatus } from '@/lib/api/citations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier');
    const slug = searchParams.get('slug');

    // Get single provider by slug
    if (slug) {
      const provider = await db.getCitationProviderBySlug(slug);
      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      const status = getProviderStatus();
      const isConfigured = status.find((s) => s.slug === slug)?.configured || false;

      // Get aggregator distributions if it's an aggregator
      let distributions: Array<{ name: string; url: string | null }> = [];
      if (provider.is_aggregator) {
        const dists = await db.getAggregatorDistributions(slug);
        distributions = dists.map((d) => ({
          name: d.directory_name,
          url: d.directory_url,
        }));
      }

      return NextResponse.json({
        ...provider,
        isConfigured,
        distributions,
      });
    }

    // Get all providers
    const providers = await db.getCitationProviders();
    const status = getProviderStatus();
    const statusMap = new Map(status.map((s) => [s.slug, s.configured]));

    // Get all aggregator distributions
    const distributions = await db.getAggregatorDistributions();
    const distByAggregator = distributions.reduce((acc, d) => {
      if (!acc[d.aggregator_slug]) {
        acc[d.aggregator_slug] = [];
      }
      acc[d.aggregator_slug].push({
        name: d.directory_name,
        url: d.directory_url,
      });
      return acc;
    }, {} as Record<string, Array<{ name: string; url: string | null }>>);

    // Filter by tier if specified
    let filteredProviders = providers;
    if (tier) {
      const tierNum = parseInt(tier);
      filteredProviders = providers.filter((p) => p.tier === tierNum);
    }

    // Group by tier
    const byTier = filteredProviders.reduce((acc, p) => {
      if (!acc[p.tier]) {
        acc[p.tier] = [];
      }
      acc[p.tier].push({
        ...p,
        isConfigured: statusMap.get(p.slug) || false,
        distributions: p.is_aggregator ? distByAggregator[p.slug] || [] : undefined,
      });
      return acc;
    }, {} as Record<number, Array<typeof providers[0] & { isConfigured: boolean; distributions?: Array<{ name: string; url: string | null }> }>>);

    // Calculate coverage stats
    const configuredCount = status.filter((s) => s.configured).length;
    const tier1Count = providers.filter((p) => p.tier === 1).length;
    const tier2Count = providers.filter((p) => p.tier === 2).length;
    const aggregators = providers.filter((p) => p.is_aggregator);

    // Estimate total directory coverage
    let estimatedCoverage = 0;
    for (const agg of aggregators) {
      if (statusMap.get(agg.slug)) {
        estimatedCoverage += (distByAggregator[agg.slug]?.length || 0);
      }
    }

    return NextResponse.json({
      summary: {
        total: providers.length,
        configured: configuredCount,
        tier1: tier1Count,
        tier2: tier2Count,
        aggregators: aggregators.length,
        estimatedDirectoryCoverage: estimatedCoverage,
      },
      tierDescriptions: {
        1: 'Direct APIs - Submit directly to major platforms',
        2: 'Aggregator APIs - Single submission distributes to 100+ directories',
        3: 'Manual/No API - Track only, no automated submission',
        4: 'Fed by Aggregators - Automatically covered by Tier 2 submissions',
      },
      byTier,
    });
  } catch (error) {
    console.error('Citation providers GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get providers' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, is_enabled } = body;

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const provider = await db.getCitationProviderBySlug(slug);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Update provider enabled status
    // Note: This uses the supabase client directly since we don't have a dedicated update method
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('citation_providers')
      .update({ is_enabled })
      .eq('slug', slug)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      provider: data,
    });
  } catch (error) {
    console.error('Citation providers PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update provider' },
      { status: 500 }
    );
  }
}
