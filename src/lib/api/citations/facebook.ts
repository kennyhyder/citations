/**
 * Facebook/Meta Pages API Client
 * https://developers.facebook.com/docs/pages-api/
 *
 * Tier 1 Direct API - Facebook Places
 * Requires OAuth2 and app review for page management
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';
import { getCredential } from './credentials';

interface FacebookPage {
  id: string;
  name: string;
  about?: string;
  description?: string;
  location?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  phone?: string;
  website?: string;
  emails?: string[];
  hours?: {
    [key: string]: string; // e.g., "mon_1_open": "09:00"
  };
  category?: string;
  category_list?: Array<{ id: string; name: string }>;
  link?: string;
  is_published?: boolean;
  verification_status?: string;
  single_line_address?: string;
}

interface FacebookResponse<T> {
  data?: T;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

// Day name mapping for Facebook's hours format
const FB_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

class FacebookClient extends BaseCitationClient {
  readonly providerSlug = 'facebook';
  readonly providerName = 'Facebook/Meta';
  readonly tier = 1;

  private baseUrl = 'https://graph.facebook.com/v18.0';
  private cachedCredentials: { appId?: string; appSecret?: string; accessToken?: string } = {};

  private async getAppId(): Promise<string | null> {
    if (this.cachedCredentials.appId) return this.cachedCredentials.appId;
    this.cachedCredentials.appId = await getCredential('facebook', 'app_id', 'FACEBOOK_APP_ID') || undefined;
    return this.cachedCredentials.appId || null;
  }

  private async getAppSecret(): Promise<string | null> {
    if (this.cachedCredentials.appSecret) return this.cachedCredentials.appSecret;
    this.cachedCredentials.appSecret = await getCredential('facebook', 'app_secret', 'FACEBOOK_APP_SECRET') || undefined;
    return this.cachedCredentials.appSecret || null;
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.cachedCredentials.accessToken) return this.cachedCredentials.accessToken;
    this.cachedCredentials.accessToken = await getCredential('facebook', 'access_token', 'FACEBOOK_ACCESS_TOKEN') || undefined;
    return this.cachedCredentials.accessToken || null;
  }

  isConfigured(): boolean {
    return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_ACCESS_TOKEN);
  }

  async isConfiguredAsync(): Promise<boolean> {
    const [appId, appSecret, accessToken] = await Promise.all([
      this.getAppId(),
      this.getAppSecret(),
      this.getAccessToken(),
    ]);
    return !!(appId && appSecret && accessToken);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FacebookResponse<T>> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error('Facebook API credentials are not configured');
    }

    // Add access token to URL
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${endpoint}${separator}access_token=${accessToken}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Facebook API error: ${data.error.message} (${data.error.code})`);
    }

    return { data };
  }

  /**
   * Convert our hours format to Facebook format
   */
  private convertHours(hours: Record<string, { open: string; close: string }> | undefined): Record<string, string> | undefined {
    if (!hours) return undefined;

    const fbHours: Record<string, string> = {};
    const dayMap: Record<string, string> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };

    Object.entries(hours).forEach(([day, times]) => {
      const fbDay = dayMap[day.toLowerCase()];
      if (fbDay) {
        fbHours[`${fbDay}_1_open`] = times.open;
        fbHours[`${fbDay}_1_close`] = times.close;
      }
    });

    return Object.keys(fbHours).length > 0 ? fbHours : undefined;
  }

  /**
   * Get pages managed by the authenticated user
   */
  async getManagedPages(): Promise<FacebookPage[]> {
    const result = await this.request<FacebookPage[]>(
      '/me/accounts?fields=id,name,link,location,phone,website,category,is_published'
    );
    return Array.isArray(result.data) ? result.data : [];
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string): Promise<FacebookPage | null> {
    try {
      const fields = 'id,name,about,description,location,phone,website,emails,hours,category,category_list,link,is_published,verification_status,single_line_address';
      const result = await this.request<FacebookPage>(
        `/${pageId}?fields=${fields}`
      );
      return result.data || null;
    } catch {
      return null;
    }
  }

  /**
   * Search for places on Facebook
   */
  async searchPlaces(query: string, center?: { lat: number; lng: number }): Promise<FacebookPage[]> {
    const params = new URLSearchParams({
      type: 'place',
      q: query,
      fields: 'id,name,location,phone,website,link,single_line_address',
    });

    if (center) {
      params.set('center', `${center.lat},${center.lng}`);
      params.set('distance', '5000'); // 5km radius
    }

    const result = await this.request<FacebookPage[]>(
      `/search?${params.toString()}`
    );

    return Array.isArray(result.data) ? result.data : [];
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
      // Search for existing page first
      const existing = await this.searchPlaces(location.businessName);
      const match = existing.find(
        (p) =>
          p.name.toLowerCase() === location.businessName.toLowerCase() &&
          p.location?.city?.toLowerCase() === location.city.toLowerCase()
      );

      if (match) {
        return {
          success: true,
          externalId: match.id,
          externalUrl: match.link || `https://www.facebook.com/${match.id}`,
          message: 'Existing page found',
          metadata: { matched: true },
        };
      }

      // Creating a new page requires Page creation permission
      // Most apps will need to claim/manage existing pages
      // For now, we can create a page if the user has the right permissions
      const pageData = {
        name: location.businessName,
        about: location.description?.slice(0, 255),
        location: {
          street: location.street,
          city: location.city,
          state: location.state,
          zip: location.zip,
          country: location.country,
        },
        phone: this.formatPhone(location.phone),
        website: location.website,
        hours: this.convertHours(location.hours),
      };

      // Note: Creating pages via API is restricted
      // You need to go through the Page creation flow
      // This endpoint may not be available for all apps
      const result = await this.request<{ id: string }>(
        '/me/accounts',
        {
          method: 'POST',
          body: JSON.stringify(pageData),
        }
      );

      if (!result.data?.id) {
        return {
          success: false,
          error: 'Failed to create page - consider creating manually on Facebook',
        };
      }

      return {
        success: true,
        externalId: result.data.id,
        externalUrl: `https://www.facebook.com/${result.data.id}`,
        message: 'Page created successfully',
      };
    } catch (error) {
      // If page creation fails, return info about manual creation
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          suggestion: 'Create the page manually at https://www.facebook.com/pages/create/',
        },
      };
    }
  }

  async update(externalId: string, location: NormalizedLocation): Promise<CitationUpdateResult> {
    try {
      const pageData: Record<string, unknown> = {
        about: location.description?.slice(0, 255),
        phone: this.formatPhone(location.phone),
        website: location.website,
      };

      // Update location if provided
      if (location.street && location.city) {
        pageData.location = {
          street: location.street,
          city: location.city,
          state: location.state,
          zip: location.zip,
          country: location.country,
        };
      }

      // Update hours if provided
      const hours = this.convertHours(location.hours);
      if (hours) {
        pageData.hours = hours;
      }

      await this.request<{ success: boolean }>(
        `/${externalId}`,
        {
          method: 'POST',
          body: JSON.stringify(pageData),
        }
      );

      return {
        success: true,
        message: 'Page updated successfully',
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
      const page = await this.getPage(externalId);

      if (!page) {
        return {
          success: true,
          status: 'not_found',
          message: 'Page not found',
        };
      }

      const status = page.is_published ? 'verified' : 'pending';

      return {
        success: true,
        status,
        externalUrl: page.link || `https://www.facebook.com/${page.id}`,
        message: `Page: ${page.name}, Published: ${page.is_published ? 'Yes' : 'No'}`,
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get insights for a page
   */
  async getPageInsights(pageId: string, metrics: string[] = ['page_impressions', 'page_engaged_users']): Promise<Record<string, unknown>> {
    try {
      const result = await this.request<Array<{ name: string; values: Array<{ value: number }> }>>(
        `/${pageId}/insights?metric=${metrics.join(',')}&period=day`
      );

      const insights: Record<string, unknown> = {};
      result.data?.forEach((metric) => {
        insights[metric.name] = metric.values?.[0]?.value;
      });

      return insights;
    } catch {
      return {};
    }
  }
}

export const facebookClient = new FacebookClient();
