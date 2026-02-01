export { hostingerClient, type HostingerDomain } from './hostinger';
export { godaddyClient, type GoDaddyDomain } from './godaddy';
export { namecheapClient, type NamecheapDomain } from './namecheap';
export { relateClient, type BrandInfo, type RelateBrand } from './relate';
export { brightLocalClient, type BrightLocalLocation, type BrightLocalCampaign, type CreateLocationParams } from './brightlocal';
export {
  mozLocalClient,
  type MozLocalLocation,
  type MozLocalBusiness,
  type MozLocalListingStatus,
  type MozLocalDashboard,
  type CreateLocationParams as MozLocalCreateLocationParams,
  type UpdateLocationParams as MozLocalUpdateLocationParams,
} from './mozlocal';

// Citation clients
export {
  citationClients,
  getCitationClient,
  getConfiguredClients,
  getClientsByTier,
  getProviderStatus,
  foursquareClient,
  dataAxleClient,
  googleBusinessClient,
  facebookClient,
  brownbookClient,
  ldeClient,
  localezeClient,
  type CitationSubmitResult,
  type CitationUpdateResult,
  type CitationVerifyResult,
  type CitationDeleteResult,
  type NormalizedLocation,
} from './citations';

export type DomainSource = 'hostinger' | 'godaddy' | 'namecheap' | 'manual';

export interface UnifiedDomain {
  id: string;
  domain: string;
  source: DomainSource;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export function normalizeHostingerDomain(d: import('./hostinger').HostingerDomain): UnifiedDomain {
  return {
    id: d.id.toString(),
    domain: d.domain!, // Already filtered out nulls
    source: 'hostinger',
    status: d.status,
    expiresAt: d.expires_at || null,
    createdAt: d.created_at,
  };
}

export function normalizeGoDaddyDomain(d: import('./godaddy').GoDaddyDomain): UnifiedDomain {
  return {
    id: d.domainId.toString(),
    domain: d.domain,
    source: 'godaddy',
    status: d.status,
    expiresAt: d.expires,
    createdAt: d.createdAt,
  };
}

export function normalizeNamecheapDomain(d: import('./namecheap').NamecheapDomain): UnifiedDomain {
  return {
    id: d.ID,
    domain: d.Name,
    source: 'namecheap',
    status: d.IsExpired ? 'expired' : 'active',
    expiresAt: d.Expires,
    createdAt: d.Created,
  };
}
