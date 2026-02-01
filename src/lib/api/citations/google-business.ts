/**
 * Google Business Profile API Client
 * https://developers.google.com/my-business
 *
 * Tier 1 Direct API - Direct Google/Maps integration
 * Requires OAuth2 and project approval
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';

interface GoogleBusinessLocation {
  name?: string; // Resource name: accounts/{account}/locations/{location}
  title: string; // Display name
  storefrontAddress: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  };
  phoneNumbers?: {
    primaryPhone?: string;
    additionalPhones?: string[];
  };
  websiteUri?: string;
  regularHours?: {
    periods: Array<{
      openDay: string;
      openTime: { hours: number; minutes: number };
      closeDay: string;
      closeTime: { hours: number; minutes: number };
    }>;
  };
  categories?: {
    primaryCategory: { name: string; displayName?: string };
    additionalCategories?: Array<{ name: string; displayName?: string }>;
  };
  profile?: {
    description?: string;
  };
  metadata?: {
    mapsUri?: string;
    newReviewUri?: string;
  };
}

interface GoogleBusinessResponse<T> {
  data?: T;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface GoogleBusinessAccount {
  name: string;
  accountName: string;
  type: string;
}

// Day name mapping for Google's API
const GOOGLE_DAYS: Record<string, string> = {
  monday: 'MONDAY',
  tuesday: 'TUESDAY',
  wednesday: 'WEDNESDAY',
  thursday: 'THURSDAY',
  friday: 'FRIDAY',
  saturday: 'SATURDAY',
  sunday: 'SUNDAY',
};

class GoogleBusinessClient extends BaseCitationClient {
  readonly providerSlug = 'google-business';
  readonly providerName = 'Google Business Profile';
  readonly tier = 1;

  private baseUrl = 'https://mybusinessbusinessinformation.googleapis.com/v1';
  private accountManagementUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1';
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  private get clientId(): string {
    return process.env.GOOGLE_BUSINESS_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_BUSINESS_CLIENT_SECRET || '';
  }

  private get refreshToken(): string {
    return process.env.GOOGLE_BUSINESS_REFRESH_TOKEN || '';
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  /**
   * Refresh the OAuth2 access token
   */
  private async refreshAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry) {
      const buffer = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiry.getTime() - buffer) {
        return this.accessToken;
      }
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Google token: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);

    return this.accessToken!;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl: string = this.baseUrl
  ): Promise<GoogleBusinessResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error('Google Business Profile credentials are not configured');
    }

    const token = await this.refreshAccessToken();

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Google Business API error: ${response.status} - ${error.error?.message || error.message}`);
    }

    return { data: await response.json() };
  }

  /**
   * Get all accounts accessible by the authenticated user
   */
  async getAccounts(): Promise<GoogleBusinessAccount[]> {
    const result = await this.request<{ accounts: GoogleBusinessAccount[] }>(
      '/accounts',
      {},
      this.accountManagementUrl
    );
    return result.data?.accounts || [];
  }

  /**
   * Convert our hours format to Google's format
   */
  private convertHours(hours: Record<string, { open: string; close: string }> | undefined): GoogleBusinessLocation['regularHours'] | undefined {
    if (!hours) return undefined;

    const periods = Object.entries(hours)
      .filter(([day]) => GOOGLE_DAYS[day.toLowerCase()])
      .map(([day, times]) => {
        const [openHours, openMinutes] = times.open.split(':').map(Number);
        const [closeHours, closeMinutes] = times.close.split(':').map(Number);

        return {
          openDay: GOOGLE_DAYS[day.toLowerCase()],
          openTime: { hours: openHours || 0, minutes: openMinutes || 0 },
          closeDay: GOOGLE_DAYS[day.toLowerCase()],
          closeTime: { hours: closeHours || 0, minutes: closeMinutes || 0 },
        };
      });

    return periods.length > 0 ? { periods } : undefined;
  }

  /**
   * Convert NormalizedLocation to Google Business format
   */
  private toGoogleLocation(location: NormalizedLocation): Omit<GoogleBusinessLocation, 'name'> {
    return {
      title: location.businessName,
      storefrontAddress: {
        addressLines: [location.street],
        locality: location.city,
        administrativeArea: location.state,
        postalCode: location.zip,
        regionCode: location.country === 'US' ? 'US' : location.country,
      },
      phoneNumbers: location.phone ? {
        primaryPhone: this.formatPhone(location.phone),
      } : undefined,
      websiteUri: location.website,
      regularHours: this.convertHours(location.hours),
      profile: location.description ? {
        description: location.description,
      } : undefined,
    };
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
      // Get accounts first
      const accounts = await this.getAccounts();
      if (accounts.length === 0) {
        return {
          success: false,
          error: 'No Google Business accounts found. Please create an account first.',
        };
      }

      const account = accounts[0]; // Use first account
      const googleLocation = this.toGoogleLocation(location);

      const result = await this.request<GoogleBusinessLocation>(
        `/${account.name}/locations`,
        {
          method: 'POST',
          body: JSON.stringify(googleLocation),
        }
      );

      if (!result.data) {
        return {
          success: false,
          error: result.error?.message || 'Failed to create location',
        };
      }

      // Extract location ID from resource name
      const locationId = result.data.name?.split('/').pop();

      return {
        success: true,
        externalId: locationId,
        externalUrl: result.data.metadata?.mapsUri,
        message: 'Location created successfully',
        metadata: {
          resourceName: result.data.name,
          accountName: account.name,
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
      const googleLocation = this.toGoogleLocation(location);

      // We need the full resource name (accounts/{account}/locations/{location})
      // If externalId is just the location ID, we need to find the account
      let resourceName = externalId;
      if (!resourceName.includes('/')) {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
          return {
            success: false,
            error: 'No Google Business accounts found',
          };
        }
        resourceName = `${accounts[0].name}/locations/${externalId}`;
      }

      await this.request<GoogleBusinessLocation>(
        `/${resourceName}`,
        {
          method: 'PATCH',
          body: JSON.stringify(googleLocation),
        }
      );

      return {
        success: true,
        message: 'Location updated successfully',
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
      // Build resource name if needed
      let resourceName = externalId;
      if (!resourceName.includes('/')) {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
          return {
            success: false,
            status: 'error',
            error: 'No Google Business accounts found',
          };
        }
        resourceName = `${accounts[0].name}/locations/${externalId}`;
      }

      const result = await this.request<GoogleBusinessLocation>(
        `/${resourceName}`,
        { method: 'GET' }
      );

      if (!result.data) {
        return {
          success: true,
          status: 'not_found',
          message: 'Location not found',
        };
      }

      return {
        success: true,
        status: 'verified',
        externalUrl: result.data.metadata?.mapsUri,
        message: `Location: ${result.data.title}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('404')) {
        return {
          success: true,
          status: 'not_found',
          message: 'Location not found',
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
   * List all locations for an account
   */
  async listLocations(accountName?: string): Promise<GoogleBusinessLocation[]> {
    try {
      let account = accountName;
      if (!account) {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) return [];
        account = accounts[0].name;
      }

      const result = await this.request<{ locations: GoogleBusinessLocation[] }>(
        `/${account}/locations`
      );

      return result.data?.locations || [];
    } catch {
      return [];
    }
  }
}

export const googleBusinessClient = new GoogleBusinessClient();
