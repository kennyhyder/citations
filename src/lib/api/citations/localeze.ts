/**
 * Neustar Localeze API Client
 * https://www.home.neustar/local/
 *
 * Tier 2 Aggregator - 200+ partners
 * TransUnion company, feeds: Google, Apple, Bing, HERE, TomTom, Alexa, Facebook
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';
import { getCredential } from './credentials';

interface LocalezeLocation {
  businessName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  tollFreePhone?: string;
  fax?: string;
  website?: string;
  email?: string;
  description?: string;
  yearEstablished?: number;
  numberOfEmployees?: string;
  annualRevenue?: string;
  paymentMethods?: string[];
  categories?: string[];
  hours?: {
    [day: string]: { open: string; close: string; closed?: boolean };
  };
  specialHours?: Array<{
    date: string;
    open: string;
    close: string;
    closed?: boolean;
  }>;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };
  logo?: string;
  images?: string[];
  services?: string[];
  brands?: string[];
  products?: string[];
}

interface LocalezeResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

interface LocalezeListing {
  id: string;
  businessName: string;
  status: 'active' | 'pending' | 'suspended' | 'rejected';
  verificationStatus: 'verified' | 'unverified' | 'pending_verification';
  publisherStatus: Array<{
    publisher: string;
    status: 'published' | 'pending' | 'error';
    url?: string;
    lastUpdated?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

class LocalezeClient extends BaseCitationClient {
  readonly providerSlug = 'localeze';
  readonly providerName = 'Neustar Localeze';
  readonly tier = 2;

  private baseUrl = 'https://api.neustarlocaleze.biz/v2';
  private cachedApiKey: string | null = null;

  private async getApiKey(): Promise<string | null> {
    if (this.cachedApiKey) return this.cachedApiKey;
    this.cachedApiKey = await getCredential('localeze', 'api_key', 'NEUSTAR_LOCALEZE_API_KEY');
    return this.cachedApiKey;
  }

  isConfigured(): boolean {
    return !!process.env.NEUSTAR_LOCALEZE_API_KEY;
  }

  async isConfiguredAsync(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return !!apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<LocalezeResponse<T>> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Neustar Localeze API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Localeze API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Convert NormalizedLocation to Localeze format
   */
  private toLocalezeLocation(location: NormalizedLocation): LocalezeLocation {
    // Convert hours format
    const hours: LocalezeLocation['hours'] = location.hours
      ? Object.fromEntries(
          Object.entries(location.hours).map(([day, times]) => [
            day.toLowerCase(),
            { open: times.open, close: times.close },
          ])
        )
      : undefined;

    return {
      businessName: location.businessName,
      address1: location.street,
      city: location.city,
      state: location.state,
      postalCode: location.zip,
      country: location.country,
      phone: this.formatPhone(location.phone),
      website: location.website,
      email: location.email,
      description: location.description,
      categories: location.categories,
      hours,
      socialMedia: location.socialLinks ? {
        facebook: location.socialLinks.facebook,
        twitter: location.socialLinks.twitter,
        instagram: location.socialLinks.instagram,
        linkedin: location.socialLinks.linkedin,
        youtube: location.socialLinks.youtube,
      } : undefined,
      logo: location.logoUrl,
      images: location.imageUrls,
    };
  }

  /**
   * Search for existing listings
   */
  async search(businessName: string, city: string, state: string): Promise<LocalezeListing[]> {
    const params = new URLSearchParams({
      businessName,
      city,
      state,
    });

    const result = await this.request<LocalezeListing[]>(
      `/listings/search?${params.toString()}`
    );

    return result.data || [];
  }

  async submit(location: NormalizedLocation): Promise<CitationSubmitResult> {
    const validation = this.validateRequired(location);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    try {
      // Check for existing listing
      const existing = await this.search(
        location.businessName,
        location.city,
        location.state
      );

      if (existing.length > 0) {
        const match = existing[0];
        return {
          success: true,
          externalId: match.id,
          message: 'Existing listing found - use update to modify',
          metadata: {
            matched: true,
            status: match.status,
            verificationStatus: match.verificationStatus,
          },
        };
      }

      // Create new listing
      const lzLocation = this.toLocalezeLocation(location);

      const result = await this.request<LocalezeListing>('/listings', {
        method: 'POST',
        body: JSON.stringify(lzLocation),
      });

      if (result.status !== 'success' || !result.data) {
        return {
          success: false,
          error: result.message || result.errors?.map((e) => e.message).join(', ') || 'Unknown error',
        };
      }

      return {
        success: true,
        externalId: result.data.id,
        message: 'Listing created - pending distribution to 200+ partners',
        metadata: {
          status: result.data.status,
          publisherCount: result.data.publisherStatus?.length || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(externalId: string, location: NormalizedLocation): Promise<CitationUpdateResult> {
    try {
      const lzLocation = this.toLocalezeLocation(location);

      const result = await this.request<LocalezeListing>(
        `/listings/${externalId}`,
        {
          method: 'PUT',
          body: JSON.stringify(lzLocation),
        }
      );

      if (result.status !== 'success') {
        return {
          success: false,
          error: result.message || result.errors?.map((e) => e.message).join(', ') || 'Unknown error',
        };
      }

      return {
        success: true,
        message: 'Listing updated - changes will propagate to partners',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(externalId: string): Promise<CitationVerifyResult> {
    try {
      const result = await this.request<LocalezeListing>(
        `/listings/${externalId}`
      );

      if (result.status !== 'success' || !result.data) {
        return {
          success: false,
          status: 'error',
          error: result.message || 'Could not get listing',
        };
      }

      const listing = result.data;
      let status: 'verified' | 'pending' | 'not_found' | 'error' = 'pending';

      if (listing.verificationStatus === 'verified' && listing.status === 'active') {
        status = 'verified';
      } else if (listing.status === 'rejected' || listing.status === 'suspended') {
        status = 'error';
      }

      // Count published vs pending
      const published = listing.publisherStatus?.filter((p) => p.status === 'published').length || 0;
      const total = listing.publisherStatus?.length || 0;

      return {
        success: true,
        status,
        lastUpdated: listing.updatedAt,
        message: `Status: ${listing.status}, Published: ${published}/${total} directories`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('404')) {
        return {
          success: true,
          status: 'not_found',
          message: 'Listing not found',
        };
      }
      return {
        success: false,
        status: 'error',
        error: message,
      };
    }
  }

  /**
   * Get detailed publisher/directory status
   */
  async getPublisherStatus(externalId: string): Promise<LocalezeListing['publisherStatus']> {
    try {
      const result = await this.request<LocalezeListing>(
        `/listings/${externalId}`
      );
      return result.data?.publisherStatus || [];
    } catch {
      return [];
    }
  }

  /**
   * Request verification for a listing
   */
  async requestVerification(externalId: string, method: 'phone' | 'postcard' | 'email'): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await this.request<{ verificationId: string }>(
        `/listings/${externalId}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ method }),
        }
      );

      return {
        success: result.status === 'success',
        message: result.status === 'success'
          ? `Verification initiated via ${method}`
          : result.message,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const localezeClient = new LocalezeClient();
