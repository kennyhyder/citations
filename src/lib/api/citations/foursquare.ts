/**
 * Foursquare Places API Client
 * https://developer.foursquare.com/
 *
 * Tier 1 Direct API - Feeds 50+ partners including Snapchat, Uber, Samsung, Microsoft
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  CitationDeleteResult,
  NormalizedLocation,
} from './base';

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location: {
    address?: string;
    address_extended?: string;
    locality?: string;
    region?: string;
    postcode?: string;
    country?: string;
    formatted_address?: string;
  };
  tel?: string;
  email?: string;
  website?: string;
  description?: string;
  categories?: Array<{ id: number; name: string }>;
  hours?: {
    display?: string;
    open_now?: boolean;
    regular?: Array<{
      day: number;
      open: string;
      close: string;
    }>;
  };
  social_media?: {
    facebook_id?: string;
    instagram?: string;
    twitter?: string;
  };
  photos?: Array<{
    id: string;
    created_at: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
  }>;
  verified?: boolean;
  date_created?: string;
  date_updated?: string;
}

interface FoursquareSearchResponse {
  results: FoursquarePlace[];
  context?: {
    geo_bounds?: {
      circle?: { center: { latitude: number; longitude: number }; radius: number };
    };
  };
}

class FoursquareClient extends BaseCitationClient {
  readonly providerSlug = 'foursquare';
  readonly providerName = 'Foursquare';
  readonly tier = 1;

  private baseUrl = 'https://api.foursquare.com/v3';

  private get apiKey(): string {
    return process.env.FOURSQUARE_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Foursquare API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Foursquare API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Search for existing places matching the business
   */
  async search(query: string, near?: string): Promise<FoursquarePlace[]> {
    const params = new URLSearchParams({
      query,
      ...(near && { near }),
      limit: '5',
    });

    const result = await this.request<FoursquareSearchResponse>(
      `/places/search?${params.toString()}`
    );
    return result.results;
  }

  /**
   * Get a specific place by ID
   */
  async getPlace(fsqId: string): Promise<FoursquarePlace> {
    return this.request<FoursquarePlace>(`/places/${fsqId}`);
  }

  /**
   * Convert our hours format to Foursquare format
   */
  private convertHours(hours: Record<string, { open: string; close: string }> | undefined): Array<{ day: number; open: string; close: string }> | undefined {
    if (!hours) return undefined;

    const dayMap: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    };

    return Object.entries(hours)
      .filter(([day]) => dayMap[day.toLowerCase()] !== undefined)
      .map(([day, times]) => ({
        day: dayMap[day.toLowerCase()],
        open: times.open.replace(':', ''),
        close: times.close.replace(':', ''),
      }));
  }

  /**
   * Submit creates a new place proposal
   * Note: Foursquare has a venue suggestion/proposal system
   */
  async submit(location: NormalizedLocation): Promise<CitationSubmitResult> {
    const validation = this.validateRequired(location);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    try {
      // First, search for existing places to avoid duplicates
      const existing = await this.search(
        location.businessName,
        `${location.city}, ${location.state}`
      );

      // Check if any result closely matches (same name and address)
      const match = existing.find(
        (p) =>
          p.name.toLowerCase() === location.businessName.toLowerCase() &&
          p.location.address?.toLowerCase().includes(location.street.toLowerCase().split(' ')[0])
      );

      if (match) {
        return {
          success: true,
          externalId: match.fsq_id,
          externalUrl: `https://foursquare.com/v/${match.fsq_id}`,
          message: 'Existing place found',
          metadata: { matched: true },
        };
      }

      // Create a new place proposal
      // Note: Foursquare's Places API v3 doesn't have a direct create endpoint for all users
      // You need to apply for Places API Edit access
      // For now, we'll use the venue suggestion endpoint pattern
      const payload = {
        name: location.businessName,
        address: location.street,
        city: location.city,
        state: location.state,
        zip: location.zip,
        country: location.country,
        phone: this.formatPhone(location.phone),
        website: location.website,
        description: location.description,
        hours: this.convertHours(location.hours),
      };

      // This endpoint requires Places API Edit access
      // https://developer.foursquare.com/docs/manage-venue-data/suggest-an-edit
      const result = await this.request<{ fsq_id: string }>('/places/propose', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        externalId: result.fsq_id,
        externalUrl: `https://foursquare.com/v/${result.fsq_id}`,
        message: 'Place proposed successfully',
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
      const payload = {
        name: location.businessName,
        address: location.street,
        city: location.city,
        state: location.state,
        zip: location.zip,
        country: location.country,
        phone: this.formatPhone(location.phone),
        website: location.website,
        description: location.description,
        hours: this.convertHours(location.hours),
      };

      await this.request(`/places/${externalId}/propose`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        message: 'Update proposed successfully',
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
      const place = await this.getPlace(externalId);
      return {
        success: true,
        status: place.verified ? 'verified' : 'pending',
        externalUrl: `https://foursquare.com/v/${place.fsq_id}`,
        lastUpdated: place.date_updated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('404')) {
        return {
          success: true,
          status: 'not_found',
          message: 'Place not found',
        };
      }
      return {
        success: false,
        status: 'error',
        error: message,
      };
    }
  }

  async delete(externalId: string): Promise<CitationDeleteResult> {
    try {
      // Foursquare doesn't support deletion via API
      // You can flag a venue as closed or duplicated
      await this.request(`/places/${externalId}/flag`, {
        method: 'POST',
        body: JSON.stringify({ problem: 'closed' }),
      });

      return {
        success: true,
        message: 'Place flagged as closed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const foursquareClient = new FoursquareClient();
