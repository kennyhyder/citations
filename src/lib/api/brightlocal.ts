/**
 * BrightLocal API Client
 * Uses MCP (Model Context Protocol) to interact with BrightLocal's Management APIs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export interface BrightLocalLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  telephone: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BrightLocalCampaign {
  id: string;
  locationId: string;
  status: string;
  citationsOrdered: number;
  citationsCompleted: number;
  createdAt: string;
}

export interface CreateLocationParams {
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  telephone: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
}

class BrightLocalClient {
  private apiKey: string;
  private mcpUrl: string;
  private client: Client | null = null;
  private isConnected: boolean = false;
  private availableTools: string[] = [];

  constructor() {
    this.apiKey = process.env.BRIGHTLOCAL_API_KEY || '';
    this.mcpUrl = `https://mcp.brightlocal.com/sse?api-key=${this.apiKey}`;
  }

  /**
   * Initialize MCP connection
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const transport = new SSEClientTransport(new URL(this.mcpUrl));
      this.client = new Client({
        name: 'citations-app',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await this.client.connect(transport);
      this.isConnected = true;

      // List available tools
      const toolsResult = await this.client.listTools();
      this.availableTools = toolsResult.tools.map(t => t.name);
      console.log('BrightLocal MCP connected. Available tools:', this.availableTools);
    } catch (error) {
      console.error('Failed to connect to BrightLocal MCP:', error);
      throw error;
    }
  }

  /**
   * Disconnect MCP client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Call an MCP tool
   */
  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }

    const result = await this.client!.callTool({ name, arguments: args });

    // Parse the result content
    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
      const content = result.content[0];
      if ('type' in content && content.type === 'text' && 'text' in content) {
        try {
          return JSON.parse(content.text as string);
        } catch {
          return content.text;
        }
      }
    }

    return result;
  }

  /**
   * List all locations
   */
  async listLocations(): Promise<BrightLocalLocation[]> {
    try {
      const result = await this.callTool('list_locations', {});
      return (result as { locations?: BrightLocalLocation[] })?.locations || [];
    } catch (error) {
      console.error('Failed to list locations:', error);
      return [];
    }
  }

  /**
   * Get a specific location
   */
  async getLocation(locationId: string): Promise<BrightLocalLocation | null> {
    try {
      const result = await this.callTool('get_location', { location_id: locationId });
      return result as BrightLocalLocation;
    } catch (error) {
      console.error('Failed to get location:', error);
      return null;
    }
  }

  /**
   * Create a new location
   */
  async createLocation(params: CreateLocationParams): Promise<BrightLocalLocation> {
    const result = await this.callTool('create_location', {
      name: params.name,
      address: params.address,
      city: params.city,
      state: params.state,
      postcode: params.postcode,
      country: params.country,
      telephone: params.telephone,
      website: params.website,
      email: params.email,
      description: params.description,
      categories: params.categories,
    });

    return result as BrightLocalLocation;
  }

  /**
   * Update an existing location
   */
  async updateLocation(locationId: string, params: Partial<CreateLocationParams>): Promise<BrightLocalLocation> {
    const result = await this.callTool('update_location', {
      location_id: locationId,
      ...params,
    });

    return result as BrightLocalLocation;
  }

  /**
   * Delete a location
   */
  async deleteLocation(locationId: string): Promise<void> {
    await this.callTool('delete_location', { location_id: locationId });
  }

  /**
   * Create a citation campaign for a location
   */
  async createCitationCampaign(locationId: string): Promise<BrightLocalCampaign> {
    const result = await this.callTool('create_citation_campaign', {
      location_id: locationId,
    });

    return result as BrightLocalCampaign;
  }

  /**
   * Get citation campaign status
   */
  async getCitationCampaign(campaignId: string): Promise<BrightLocalCampaign | null> {
    try {
      const result = await this.callTool('get_citation_campaign', {
        campaign_id: campaignId,
      });
      return result as BrightLocalCampaign;
    } catch (error) {
      console.error('Failed to get citation campaign:', error);
      return null;
    }
  }

  /**
   * List all citation campaigns
   */
  async listCitationCampaigns(): Promise<BrightLocalCampaign[]> {
    try {
      const result = await this.callTool('list_citation_campaigns', {});
      return (result as { campaigns?: BrightLocalCampaign[] })?.campaigns || [];
    } catch (error) {
      console.error('Failed to list citation campaigns:', error);
      return [];
    }
  }

  /**
   * Get available tools from MCP
   */
  getAvailableTools(): string[] {
    return this.availableTools;
  }

  /**
   * Check if client is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export const brightLocalClient = new BrightLocalClient();
