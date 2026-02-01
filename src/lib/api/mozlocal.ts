/**
 * Moz Local API Client
 * Docs: https://seomoz.github.io/local-public-api-docs/
 *
 * Base URLs:
 * - Production: https://localapp.moz.com/api/
 * - Sandbox: https://sandbox.localapp.moz.com/api/
 */

export interface MozLocalLocation {
  id?: string;
  businessId: string;
  name: string;
  streetNo?: string;
  street: string;
  addressExtra?: string;
  city: string;
  province: string; // state
  zip: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  lat?: number;
  lng?: number;
  categories?: string[];
  keywords?: string[];
  openingHours?: Record<string, { open: string; close: string }>;
  status?: 'ACTIVE' | 'INACTIVE';
  visibilityIndex?: number;
  profileCompleteness?: number;
  dateCreated?: string;
  lastUpdated?: string;
}

export interface MozLocalBusiness {
  id: string;
  name: string;
  dateCreated: string;
  lastUpdated: string;
}

export interface MozLocalListingStatus {
  directoryType: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'ERROR';
  claimStatus: string;
  url?: string;
}

export interface MozLocalDashboard {
  businessName: string;
  statistics: {
    activeDirectories: number;
    inactiveDirectories: number;
    unfilledFields: number;
    completionPercentage: number;
  };
  visibilityIndex: {
    score: number;
    maxPoints: number;
    pointsReached: number;
  };
  todos: string[];
}

export interface CreateLocationParams {
  businessId: string;
  name: string;
  street: string;
  streetNo?: string;
  addressExtra?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  lat?: number;
  lng?: number;
  categories?: string[];
  keywords?: string[];
  openingHours?: Record<string, { open: string; close: string }>;
}

export interface UpdateLocationParams {
  name?: string;
  street?: string;
  streetNo?: string;
  addressExtra?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
  website?: string;
  email?: string;
  lat?: number;
  lng?: number;
  categories?: string[];
  keywords?: string[];
  openingHours?: Record<string, { open: string; close: string }>;
}

interface MozLocalApiResponse<T> {
  status: 'SUCCESS' | 'ERROR';
  response: T;
  message?: string;
}

class MozLocalClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    // Use sandbox for development, production for live
    const useSandbox = process.env.MOZ_LOCAL_SANDBOX === 'true';
    this.baseUrl = useSandbox
      ? 'https://sandbox.localapp.moz.com/api'
      : 'https://localapp.moz.com/api';
  }

  private get email(): string {
    return process.env.MOZ_LOCAL_EMAIL || '';
  }

  private get password(): string {
    return process.env.MOZ_LOCAL_PASSWORD || '';
  }

  /**
   * Authenticate and get access token
   */
  async authenticate(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry) {
      const buffer = 5 * 60 * 1000; // 5 minutes
      if (new Date().getTime() < this.tokenExpiry.getTime() - buffer) {
        return this.accessToken;
      }
    }

    if (!this.email || !this.password) {
      throw new Error('MOZ_LOCAL_EMAIL and MOZ_LOCAL_PASSWORD are not configured');
    }

    const response = await fetch(`${this.baseUrl}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moz Local authentication failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;

    // Production tokens expire after 60 days, sandbox resets every 2 weeks
    const expiryDays = process.env.MOZ_LOCAL_SANDBOX === 'true' ? 14 : 60;
    this.tokenExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    return this.accessToken!;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<MozLocalApiResponse<T>> {
    const token = await this.authenticate();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'accessToken': token,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moz Local API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Check if the client is configured with credentials
   */
  isConfigured(): boolean {
    return !!(this.email && this.password);
  }

  // ============ Business Methods ============

  /**
   * Get all businesses for the account
   */
  async getBusinesses(): Promise<MozLocalBusiness[]> {
    const result = await this.request<MozLocalBusiness[]>('/businesses');
    return result.response;
  }

  // ============ Location Methods ============

  /**
   * Create a new location
   */
  async createLocation(params: CreateLocationParams): Promise<MozLocalLocation> {
    const result = await this.request<MozLocalLocation>('/locations', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return result.response;
  }

  /**
   * Update an existing location
   * Note: Blank parameters delete values; unspecified parameters remain unchanged
   */
  async updateLocation(id: string, params: UpdateLocationParams): Promise<MozLocalLocation> {
    const result = await this.request<MozLocalLocation>(`/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
    return result.response;
  }

  /**
   * Get a specific location by ID
   */
  async getLocation(id: string): Promise<MozLocalLocation & { listings: MozLocalListingStatus[] }> {
    const result = await this.request<MozLocalLocation & { listings: MozLocalListingStatus[] }>(
      `/locations/${id}`
    );
    return result.response;
  }

  /**
   * Find locations by search criteria
   */
  async findLocations(params?: {
    identifier?: string;
    query?: string;
    offset?: number;
  }): Promise<{ locations: MozLocalLocation[]; offset: number; max: number; count: number }> {
    const searchParams = new URLSearchParams();
    if (params?.identifier) searchParams.set('identifier', params.identifier);
    if (params?.query) searchParams.set('query', params.query);
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const queryString = searchParams.toString();
    const endpoint = `/locations${queryString ? `?${queryString}` : ''}`;

    const result = await this.request<{
      locations: MozLocalLocation[];
      offset: number;
      max: number;
      count: number;
    }>(endpoint);
    return result.response;
  }

  /**
   * Get location dashboard data
   */
  async getLocationDashboard(id: string): Promise<MozLocalDashboard> {
    const result = await this.request<MozLocalDashboard>(`/locations/${id}/dashboard`);
    return result.response;
  }

  // ============ Insights Methods ============

  /**
   * Get historical visibility index data
   */
  async getVisibilityHistory(
    locationId: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{
    score: number;
    maxPoints: number;
    pointsReached: number;
    timestamp: string;
  }>> {
    const result = await this.request<Array<{
      score: number;
      maxPoints: number;
      pointsReached: number;
      timestamp: string;
    }>>(
      `/locations/${locationId}/visibilityindexes/interesting?startDate=${startDate}&endDate=${endDate}`
    );
    return result.response;
  }

  /**
   * Get insights data (views, clicks, etc.) from directories
   */
  async getInsights(params: {
    type: 'google' | 'facebook' | 'yelp';
    businessIds?: string[];
    locationIds?: string[];
    startDate?: string;
    endDate?: string;
    group?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  }): Promise<{
    matchedLocations: number;
    metrics: Array<{ period: string; count: number }>;
  }> {
    const searchParams = new URLSearchParams();
    searchParams.set('type', params.type);
    if (params.businessIds) searchParams.set('businessIds', params.businessIds.join(','));
    if (params.locationIds) searchParams.set('locationIds', params.locationIds.join(','));
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.group) searchParams.set('group', params.group);

    const result = await this.request<{
      matchedLocations: number;
      metrics: Array<{ period: string; count: number }>;
    }>(`/dashboard/insightsData?${searchParams.toString()}`);
    return result.response;
  }

  // ============ Reviews/Data Points Methods ============

  /**
   * Get data points (reviews, photos, check-ins)
   */
  async getDataPoints(params?: {
    businessIds?: string[];
    directoryTypes?: string[];
    dataPointTypes?: ('PHOTO' | 'REVIEW' | 'CHECKIN' | 'CONVERSATION' | 'QUESTION')[];
    ratings?: number[];
    page?: number;
  }): Promise<{
    dataPoints: Array<{
      id: string;
      type: string;
      author: string;
      rating?: number;
      content?: string;
      directLink?: string;
      canReply: boolean;
      dateCreated: string;
    }>;
    pagination: { page: number; totalPages: number; totalCount: number };
  }> {
    const searchParams = new URLSearchParams();
    if (params?.businessIds) searchParams.set('businessIds', params.businessIds.join(','));
    if (params?.directoryTypes) searchParams.set('directoryTypes', params.directoryTypes.join(','));
    if (params?.dataPointTypes) searchParams.set('dataPointTypes', params.dataPointTypes.join(','));
    if (params?.ratings) searchParams.set('ratings', params.ratings.join(','));
    if (params?.page) searchParams.set('page', params.page.toString());

    const queryString = searchParams.toString();
    const endpoint = `/datapoints${queryString ? `?${queryString}` : ''}`;

    const result = await this.request<{
      dataPoints: Array<{
        id: string;
        type: string;
        author: string;
        rating?: number;
        content?: string;
        directLink?: string;
        canReply: boolean;
        dateCreated: string;
      }>;
      pagination: { page: number; totalPages: number; totalCount: number };
    }>(endpoint);
    return result.response;
  }

  /**
   * Get data points statistics (review counts, average ratings)
   */
  async getDataPointsStatistics(params?: {
    businessIds?: string[];
    directoryTypes?: string[];
  }): Promise<{
    totalCount: number;
    reviewCount: number;
    photoCount: number;
    averageRating: number;
    unreadCount: number;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.businessIds) searchParams.set('businessIds', params.businessIds.join(','));
    if (params?.directoryTypes) searchParams.set('directoryTypes', params.directoryTypes.join(','));

    const queryString = searchParams.toString();
    const endpoint = `/datapoints/statistics${queryString ? `?${queryString}` : ''}`;

    const result = await this.request<{
      totalCount: number;
      reviewCount: number;
      photoCount: number;
      averageRating: number;
      unreadCount: number;
    }>(endpoint);
    return result.response;
  }
}

export const mozLocalClient = new MozLocalClient();
