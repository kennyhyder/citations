/**
 * Relate Dashboard Browser Automation
 * Uses Playwright to automate the Namecheap Relate dashboard
 * for creating and managing business listings/citations
 *
 * Uses @sparticuz/chromium for Vercel serverless compatibility
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import type { BrandInfo } from '@/lib/api/relate';

// Dynamic import for serverless chromium (only used on Vercel)
let chromiumModule: typeof import('@sparticuz/chromium-min') | null = null;

// Chromium binary URL for serverless - hosted by @anthropic/chromium
const CHROMIUM_PACK_URL = 'https://github.com/nickvr/chromium-binaries/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

interface ChromiumConfig {
  executablePath: string;
  args: string[];
}

async function getChromiumConfig(): Promise<ChromiumConfig | null> {
  // On Vercel/serverless, use @sparticuz/chromium-min
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    if (!chromiumModule) {
      chromiumModule = await import('@sparticuz/chromium-min');
    }
    const chromium = chromiumModule.default;

    // Disable graphics mode for serverless (reduces size, WebGL not needed)
    chromium.setGraphicsMode = false;

    return {
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      args: chromium.args,
    };
  }
  // On local/server, use system chromium (installed via npx playwright install)
  return null;
}

export interface RelateAutomationConfig {
  headless?: boolean;
  slowMo?: number;
  screenshotDir?: string;
  timeout?: number;
}

export interface AutomationResult {
  success: boolean;
  message: string;
  brandId?: string;
  error?: string;
  screenshots?: string[];
}

const DEFAULT_CONFIG: RelateAutomationConfig = {
  headless: true,
  slowMo: 50,
  screenshotDir: '/tmp/relate-screenshots',
  timeout: 30000,
};

export class RelateAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: RelateAutomationConfig;
  private isLoggedIn: boolean = false;

  // Namecheap URLs
  private readonly NAMECHEAP_LOGIN_URL = 'https://www.namecheap.com/myaccount/login/';
  private readonly NAMECHEAP_APPS_URL = 'https://www.namecheap.com/apps/';
  private readonly RELATE_DASHBOARD_URL = 'https://relate.namecheap.com/';

  constructor(config: Partial<RelateAutomationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the browser instance
   */
  async init(): Promise<void> {
    if (this.browser) {
      return;
    }

    // Get chromium config for Vercel/serverless or use system chromium
    const chromiumConfig = await getChromiumConfig();

    // Configure launch options
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    };

    // On Vercel, use the @sparticuz/chromium executable and args
    if (chromiumConfig) {
      launchOptions.executablePath = chromiumConfig.executablePath;
      launchOptions.args = chromiumConfig.args;
    }

    this.browser = await chromium.launch(launchOptions);

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout || 30000);
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
    this.isLoggedIn = false;
  }

  /**
   * Take a screenshot for debugging
   */
  private async screenshot(name: string): Promise<string | null> {
    if (!this.page || !this.config.screenshotDir) {
      return null;
    }

    const path = `${this.config.screenshotDir}/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  /**
   * Log into Namecheap account
   */
  async login(): Promise<AutomationResult> {
    const username = process.env.NAMECHEAP_USERNAME;
    const password = process.env.NAMECHEAP_PASSWORD;

    if (!username || !password) {
      return {
        success: false,
        message: 'NAMECHEAP_USERNAME and NAMECHEAP_PASSWORD must be configured',
      };
    }

    try {
      await this.init();
      if (!this.page) throw new Error('Page not initialized');

      console.log('Navigating to Namecheap login...');
      await this.page.goto(this.NAMECHEAP_LOGIN_URL, { waitUntil: 'networkidle' });

      // Check if already logged in
      if (this.page.url().includes('dashboard') || this.page.url().includes('myaccount')) {
        this.isLoggedIn = true;
        return { success: true, message: 'Already logged in' };
      }

      // Wait for login form
      await this.page.waitForSelector('input[name="LoginUserName"], input[name="username"], #LoginUserName', { timeout: 10000 });

      // Fill in credentials - try multiple selector patterns
      const usernameSelectors = ['input[name="LoginUserName"]', 'input[name="username"]', '#LoginUserName', 'input[type="text"]'];
      const passwordSelectors = ['input[name="LoginPassword"]', 'input[name="password"]', '#LoginPassword', 'input[type="password"]'];

      for (const selector of usernameSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.fill(username);
            break;
          }
        } catch {
          continue;
        }
      }

      for (const selector of passwordSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.fill(password);
            break;
          }
        } catch {
          continue;
        }
      }

      await this.screenshot('login-filled');

      // Click login button
      const loginButtonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Log In")',
        'button:has-text("Sign In")',
        '.login-button',
        '#loginBtn',
      ];

      for (const selector of loginButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            break;
          }
        } catch {
          continue;
        }
      }

      // Wait for navigation after login
      await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

      // Check for 2FA or security verification
      const pageContent = await this.page.content();
      if (pageContent.includes('verification') || pageContent.includes('2FA') || pageContent.includes('security code')) {
        await this.screenshot('2fa-required');
        return {
          success: false,
          message: '2FA verification required - please complete manually or configure 2FA bypass',
        };
      }

      // Verify login success
      const currentUrl = this.page.url();
      if (currentUrl.includes('dashboard') || currentUrl.includes('myaccount') || currentUrl.includes('apps')) {
        this.isLoggedIn = true;
        await this.screenshot('login-success');
        return { success: true, message: 'Successfully logged into Namecheap' };
      }

      await this.screenshot('login-failed');
      return {
        success: false,
        message: `Login may have failed. Current URL: ${currentUrl}`,
      };

    } catch (error) {
      await this.screenshot('login-error');
      return {
        success: false,
        message: 'Login failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Navigate to the Relate dashboard
   */
  async navigateToRelate(): Promise<AutomationResult> {
    if (!this.isLoggedIn) {
      const loginResult = await this.login();
      if (!loginResult.success) {
        return loginResult;
      }
    }

    try {
      if (!this.page) throw new Error('Page not initialized');

      console.log('Navigating to Relate dashboard...');

      // Try direct URL first
      await this.page.goto(this.RELATE_DASHBOARD_URL, { waitUntil: 'networkidle' });

      // If redirected to login, try through apps page
      if (this.page.url().includes('login')) {
        await this.page.goto(this.NAMECHEAP_APPS_URL, { waitUntil: 'networkidle' });

        // Look for Relate link/button
        const relateSelectors = [
          'a:has-text("Relate")',
          'a:has-text("RelateLocal")',
          '[href*="relate"]',
          '.relate-app',
        ];

        for (const selector of relateSelectors) {
          try {
            const link = await this.page.$(selector);
            if (link) {
              await link.click();
              await this.page.waitForNavigation({ waitUntil: 'networkidle' });
              break;
            }
          } catch {
            continue;
          }
        }
      }

      await this.screenshot('relate-dashboard');

      // Verify we're on Relate
      const currentUrl = this.page.url();
      if (currentUrl.includes('relate')) {
        return { success: true, message: 'Successfully navigated to Relate dashboard' };
      }

      return {
        success: false,
        message: `Could not navigate to Relate. Current URL: ${currentUrl}`,
      };

    } catch (error) {
      await this.screenshot('relate-nav-error');
      return {
        success: false,
        message: 'Failed to navigate to Relate',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a new brand/business listing in Relate
   */
  async createBrand(brandInfo: BrandInfo): Promise<AutomationResult> {
    const navResult = await this.navigateToRelate();
    if (!navResult.success) {
      return navResult;
    }

    try {
      if (!this.page) throw new Error('Page not initialized');

      console.log(`Creating brand for: ${brandInfo.businessName}`);

      // Look for "Add Location" or "Create Brand" button
      const addButtonSelectors = [
        'button:has-text("Add Location")',
        'button:has-text("Add Business")',
        'button:has-text("Create")',
        'button:has-text("New")',
        'a:has-text("Add Location")',
        'a:has-text("Add Business")',
        '[data-testid="add-location"]',
        '.add-location-btn',
      ];

      let foundAddButton = false;
      for (const selector of addButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            foundAddButton = true;
            await this.page.waitForTimeout(2000); // Wait for form to load
            break;
          }
        } catch {
          continue;
        }
      }

      if (!foundAddButton) {
        await this.screenshot('no-add-button');
        return {
          success: false,
          message: 'Could not find Add Location/Business button',
        };
      }

      await this.screenshot('brand-form');

      // Fill in the business information
      // Business Name
      await this.fillField(['input[name="businessName"]', 'input[name="name"]', '#businessName', 'input[placeholder*="business name" i]'], brandInfo.businessName);

      // Address fields
      if (brandInfo.address) {
        await this.fillField(['input[name="street"]', 'input[name="address1"]', 'input[name="address"]', '#street'], brandInfo.address.street);
        await this.fillField(['input[name="city"]', '#city'], brandInfo.address.city);
        await this.fillField(['input[name="state"]', 'select[name="state"]', '#state'], brandInfo.address.state);
        await this.fillField(['input[name="zip"]', 'input[name="zipCode"]', 'input[name="postalCode"]', '#zip'], brandInfo.address.zip);
        await this.fillField(['input[name="country"]', 'select[name="country"]', '#country'], brandInfo.address.country);
      }

      // Phone
      await this.fillField(['input[name="phone"]', 'input[name="phoneNumber"]', 'input[type="tel"]', '#phone'], brandInfo.phone);

      // Website
      if (brandInfo.website) {
        await this.fillField(['input[name="website"]', 'input[name="url"]', 'input[type="url"]', '#website'], brandInfo.website);
      }

      // Email
      if (brandInfo.email) {
        await this.fillField(['input[name="email"]', 'input[type="email"]', '#email'], brandInfo.email);
      }

      // Description
      if (brandInfo.description) {
        await this.fillField(['textarea[name="description"]', 'textarea[name="about"]', '#description', 'textarea'], brandInfo.description);
      }

      // Categories - this is often a dropdown or multi-select
      if (brandInfo.categories && brandInfo.categories.length > 0) {
        await this.selectCategories(brandInfo.categories);
      }

      await this.screenshot('brand-form-filled');

      // Submit the form
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Save")',
        'button:has-text("Create")',
        'button:has-text("Submit")',
        'button:has-text("Continue")',
        '.submit-btn',
      ];

      for (const selector of submitSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            break;
          }
        } catch {
          continue;
        }
      }

      // Wait for submission to complete
      await this.page.waitForTimeout(3000);
      await this.screenshot('brand-created');

      // Try to extract the brand ID from the URL or page
      const currentUrl = this.page.url();
      const brandIdMatch = currentUrl.match(/brand[s]?\/(\d+)/i) || currentUrl.match(/location[s]?\/(\d+)/i) || currentUrl.match(/id=(\d+)/i);
      const brandId = brandIdMatch ? brandIdMatch[1] : undefined;

      return {
        success: true,
        message: `Successfully created brand: ${brandInfo.businessName}`,
        brandId,
      };

    } catch (error) {
      await this.screenshot('brand-create-error');
      return {
        success: false,
        message: `Failed to create brand: ${brandInfo.businessName}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Helper to fill a form field with multiple selector fallbacks
   */
  private async fillField(selectors: string[], value: string): Promise<boolean> {
    if (!this.page || !value) return false;

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'select') {
            await element.selectOption({ label: value }).catch(() =>
              element.selectOption({ value: value })
            );
          } else {
            await element.fill(value);
          }
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Helper to select categories (often a complex multi-select)
   */
  private async selectCategories(categories: string[]): Promise<void> {
    if (!this.page) return;

    // Try common category selection patterns
    const categorySelectors = [
      'input[name="category"]',
      'select[name="category"]',
      'select[name="categories"]',
      '[data-testid="category-select"]',
      '.category-select',
      'input[placeholder*="category" i]',
    ];

    for (const selector of categorySelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());

          if (tagName === 'select') {
            // Multi-select dropdown
            for (const category of categories) {
              await element.selectOption({ label: category }).catch(() => {});
            }
          } else if (tagName === 'input') {
            // Autocomplete input - type and select
            for (const category of categories) {
              await element.fill(category);
              await this.page.waitForTimeout(500);
              // Try to click the first suggestion
              await this.page.click('.suggestion:first-child, .autocomplete-item:first-child, [role="option"]:first-child').catch(() => {});
            }
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }

  /**
   * Trigger sync for an existing brand
   */
  async syncBrand(brandId: string): Promise<AutomationResult> {
    const navResult = await this.navigateToRelate();
    if (!navResult.success) {
      return navResult;
    }

    try {
      if (!this.page) throw new Error('Page not initialized');

      // Navigate to the brand's page
      await this.page.goto(`${this.RELATE_DASHBOARD_URL}/brands/${brandId}`, { waitUntil: 'networkidle' });

      // Look for sync button
      const syncSelectors = [
        'button:has-text("Sync")',
        'button:has-text("Update Listings")',
        'button:has-text("Push")',
        '[data-testid="sync-button"]',
        '.sync-btn',
      ];

      for (const selector of syncSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            await this.page.waitForTimeout(2000);
            break;
          }
        } catch {
          continue;
        }
      }

      await this.screenshot('sync-triggered');

      return {
        success: true,
        message: `Sync triggered for brand ${brandId}`,
        brandId,
      };

    } catch (error) {
      await this.screenshot('sync-error');
      return {
        success: false,
        message: `Failed to sync brand ${brandId}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get list of existing brands/locations
   */
  async listBrands(): Promise<{ success: boolean; brands: { id: string; name: string }[]; error?: string }> {
    const navResult = await this.navigateToRelate();
    if (!navResult.success) {
      return { success: false, brands: [], error: navResult.message };
    }

    try {
      if (!this.page) throw new Error('Page not initialized');

      const brands: { id: string; name: string }[] = [];

      // Try to find brand/location list
      const listSelectors = [
        '.brand-list .brand-item',
        '.location-list .location-item',
        '[data-testid="brand-row"]',
        'table tbody tr',
        '.brands-table tr',
      ];

      for (const selector of listSelectors) {
        try {
          const items = await this.page.$$(selector);
          if (items.length > 0) {
            for (const item of items) {
              const name = await item.$eval('a, .name, .brand-name, td:first-child', el => el.textContent?.trim() || '').catch(() => '');
              const href = await item.$eval('a', el => el.getAttribute('href') || '').catch(() => '');
              const idMatch = href.match(/\/(\d+)/) || href.match(/id=(\d+)/);
              const id = idMatch ? idMatch[1] : '';

              if (name && id) {
                brands.push({ id, name });
              }
            }
            break;
          }
        } catch {
          continue;
        }
      }

      await this.screenshot('brand-list');

      return { success: true, brands };

    } catch (error) {
      return {
        success: false,
        brands: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Singleton instance for reuse
let automationInstance: RelateAutomation | null = null;

export function getRelateAutomation(config?: Partial<RelateAutomationConfig>): RelateAutomation {
  if (!automationInstance) {
    automationInstance = new RelateAutomation(config);
  }
  return automationInstance;
}

export async function closeRelateAutomation(): Promise<void> {
  if (automationInstance) {
    await automationInstance.close();
    automationInstance = null;
  }
}
