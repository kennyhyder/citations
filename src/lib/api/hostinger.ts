/**
 * Hostinger API Client
 * Docs: https://developers.hostinger.com/
 */

export interface HostingerDomain {
  id: number;
  domain: string | null;
  type: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

class HostingerClient {
  private baseUrl = 'https://developers.hostinger.com';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.HOSTINGER_API_KEY || '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('HOSTINGER_API_KEY is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hostinger API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async listDomains(): Promise<HostingerDomain[]> {
    try {
      // The portfolio endpoint returns an array of domains directly
      const response = await this.request<HostingerDomain[]>('/api/domains/v1/portfolio');
      // Filter out entries with null domain names (pending setup)
      return (response || []).filter(d => d.domain !== null);
    } catch (error) {
      console.error('Failed to fetch Hostinger domains:', error);
      throw error;
    }
  }

  async getDomain(domain: string): Promise<HostingerDomain> {
    const response = await this.request<HostingerDomain>(`/api/domains/v1/portfolio/${domain}`);
    return response;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export const hostingerClient = new HostingerClient();
