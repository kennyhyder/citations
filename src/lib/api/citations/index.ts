/**
 * Citation Clients Index
 * Exports all citation provider clients and types
 */

// Base types and class
export {
  BaseCitationClient,
  type CitationSubmitResult,
  type CitationUpdateResult,
  type CitationVerifyResult,
  type CitationDeleteResult,
  type NormalizedLocation,
} from './base';

// Tier 1: Direct APIs
export { foursquareClient } from './foursquare';
export { dataAxleClient } from './dataaxle';
export { googleBusinessClient } from './google-business';
export { facebookClient } from './facebook';
export { brownbookClient } from './brownbook';

// Tier 2: Aggregators
export { ldeClient } from './lde';
export { localezeClient } from './localeze';

// Client registry - all available clients
import { BaseCitationClient } from './base';
import { foursquareClient } from './foursquare';
import { dataAxleClient } from './dataaxle';
import { googleBusinessClient } from './google-business';
import { facebookClient } from './facebook';
import { brownbookClient } from './brownbook';
import { ldeClient } from './lde';
import { localezeClient } from './localeze';

// Map of slug to client instance
export const citationClients: Record<string, BaseCitationClient> = {
  'foursquare': foursquareClient,
  'data-axle': dataAxleClient,
  'google-business': googleBusinessClient,
  'facebook': facebookClient,
  'brownbook': brownbookClient,
  'lde': ldeClient,
  'localeze': localezeClient,
};

/**
 * Get a citation client by slug
 */
export function getCitationClient(slug: string): BaseCitationClient | null {
  return citationClients[slug] || null;
}

/**
 * Get all configured citation clients
 */
export function getConfiguredClients(): BaseCitationClient[] {
  return Object.values(citationClients).filter((client) => client.isConfigured());
}

/**
 * Get all citation clients grouped by tier
 */
export function getClientsByTier(): Record<number, BaseCitationClient[]> {
  const byTier: Record<number, BaseCitationClient[]> = { 1: [], 2: [], 3: [], 4: [] };

  for (const client of Object.values(citationClients)) {
    if (!byTier[client.tier]) {
      byTier[client.tier] = [];
    }
    byTier[client.tier].push(client);
  }

  return byTier;
}

/**
 * Check which providers are configured
 */
export function getProviderStatus(): Array<{
  slug: string;
  name: string;
  tier: number;
  configured: boolean;
}> {
  return Object.values(citationClients).map((client) => ({
    slug: client.providerSlug,
    name: client.providerName,
    tier: client.tier,
    configured: client.isConfigured(),
  }));
}
