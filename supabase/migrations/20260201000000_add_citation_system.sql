-- Citation System Database Schema
-- Supports tiered citation management with aggregators and direct providers

-- ============ Citation Providers ============
-- Registry of all directories/aggregators with tier, auth method, rate limits
CREATE TABLE IF NOT EXISTS citation_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('api_key', 'oauth2', 'none')),
  base_url TEXT,
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 1000,
  requires_credentials BOOLEAN NOT NULL DEFAULT true,
  is_aggregator BOOLEAN NOT NULL DEFAULT false,
  coverage_description TEXT,
  documentation_url TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Aggregator Distributions ============
-- Maps which directories are fed by which aggregators
CREATE TABLE IF NOT EXISTS aggregator_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_slug TEXT NOT NULL,
  directory_name TEXT NOT NULL,
  directory_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(aggregator_slug, directory_name)
);

-- ============ Provider Credentials ============
-- Secure credential storage (encrypted values should be handled at app level)
CREATE TABLE IF NOT EXISTS provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug TEXT NOT NULL REFERENCES citation_providers(slug) ON DELETE CASCADE,
  credential_key TEXT NOT NULL,
  credential_value TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_slug, credential_key)
);

-- ============ Citation Submissions ============
-- Per-domain per-provider tracking with external IDs, status, errors
CREATE TABLE IF NOT EXISTS citation_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  provider_slug TEXT NOT NULL REFERENCES citation_providers(slug) ON DELETE CASCADE,
  external_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'submitting', 'submitted', 'verified', 'error', 'needs_update')),
  brand_info_hash TEXT,
  error_message TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_submitted_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id, provider_slug)
);

-- ============ Citation Queue ============
-- Async processing queue with priority, retry logic
CREATE TABLE IF NOT EXISTS citation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES citation_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submit', 'update', 'verify', 'delete')),
  priority INTEGER NOT NULL DEFAULT 50,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ Citation Batches ============
-- Bulk operation tracking
CREATE TABLE IF NOT EXISTS citation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  total_submissions INTEGER NOT NULL DEFAULT 0,
  completed_submissions INTEGER NOT NULL DEFAULT 0,
  failed_submissions INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add batch_id to queue for tracking
ALTER TABLE citation_queue ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES citation_batches(id) ON DELETE SET NULL;

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_citation_providers_tier ON citation_providers(tier);
CREATE INDEX IF NOT EXISTS idx_citation_providers_slug ON citation_providers(slug);
CREATE INDEX IF NOT EXISTS idx_citation_providers_enabled ON citation_providers(is_enabled);

CREATE INDEX IF NOT EXISTS idx_aggregator_distributions_aggregator ON aggregator_distributions(aggregator_slug);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider ON provider_credentials(provider_slug);

CREATE INDEX IF NOT EXISTS idx_citation_submissions_domain ON citation_submissions(domain_id);
CREATE INDEX IF NOT EXISTS idx_citation_submissions_provider ON citation_submissions(provider_slug);
CREATE INDEX IF NOT EXISTS idx_citation_submissions_status ON citation_submissions(status);
CREATE INDEX IF NOT EXISTS idx_citation_submissions_domain_provider ON citation_submissions(domain_id, provider_slug);

CREATE INDEX IF NOT EXISTS idx_citation_queue_scheduled ON citation_queue(scheduled_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_citation_queue_priority ON citation_queue(priority DESC, scheduled_at ASC) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_citation_queue_submission ON citation_queue(submission_id);
CREATE INDEX IF NOT EXISTS idx_citation_queue_batch ON citation_queue(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_citation_batches_status ON citation_batches(status);

-- ============ Row Level Security ============
ALTER TABLE citation_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregator_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on citation_providers" ON citation_providers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on aggregator_distributions" ON aggregator_distributions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on provider_credentials" ON provider_credentials
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on citation_submissions" ON citation_submissions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on citation_queue" ON citation_queue
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on citation_batches" ON citation_batches
  FOR ALL USING (true) WITH CHECK (true);

-- ============ Updated At Triggers ============
-- Reuse existing trigger function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_citation_providers_updated_at
  BEFORE UPDATE ON citation_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_credentials_updated_at
  BEFORE UPDATE ON provider_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_citation_submissions_updated_at
  BEFORE UPDATE ON citation_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_citation_queue_updated_at
  BEFORE UPDATE ON citation_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_citation_batches_updated_at
  BEFORE UPDATE ON citation_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============ Seed Data: Citation Providers ============
INSERT INTO citation_providers (slug, name, tier, auth_method, base_url, is_aggregator, coverage_description, documentation_url, rate_limit_per_minute, rate_limit_per_day) VALUES
  -- Tier 1: Direct APIs
  ('foursquare', 'Foursquare', 1, 'api_key', 'https://api.foursquare.com/v3', false, 'Feeds Snapchat, Uber, 50+ navigation apps', 'https://developer.foursquare.com/', 500, 100000),
  ('data-axle', 'Data Axle', 1, 'api_key', 'https://api.data-axle.com', false, '~95% of search traffic', 'https://developer.data-axle.com/', 60, 5000),
  ('google-business', 'Google Business Profile', 1, 'oauth2', 'https://mybusinessbusinessinformation.googleapis.com/v1', false, 'Direct Google/Maps integration', 'https://developers.google.com/my-business', 60, 10000),
  ('facebook', 'Facebook/Meta', 1, 'oauth2', 'https://graph.facebook.com/v18.0', false, 'Facebook Places', 'https://developers.facebook.com/docs/pages-api/', 200, 50000),
  ('brownbook', 'Brownbook.net', 1, 'api_key', 'https://api.brownbook.net', false, 'Global business directory', 'https://www.brownbook.net/api/', 30, 1000),

  -- Tier 2: Aggregator APIs
  ('lde', 'Local Data Exchange', 2, 'api_key', 'https://local-data-exchange.p.rapidapi.com', true, '130+ directories including Apple, Bing, TomTom, HERE, Yahoo, Uber', 'https://rapidapi.com/lde/api/local-data-exchange', 100, 10000),
  ('localeze', 'Neustar Localeze', 2, 'api_key', 'https://api.neustarlocaleze.biz', true, '200+ partners including Google, Apple, Bing, HERE, TomTom', 'https://www.home.neustar/local/', 60, 5000),
  ('yext', 'Yext', 2, 'api_key', 'https://api.yext.com/v2', true, '150+ directories - comprehensive but expensive', 'https://developer.yext.com/', 1000, 50000),

  -- Tier 3: Manual/No API (track only)
  ('bing-places', 'Bing Places', 3, 'none', NULL, false, 'API in transition - contact partneronbp@microsoft.com', NULL, 0, 0),
  ('apple-business', 'Apple Business Connect', 3, 'none', NULL, false, 'API only through partners', NULL, 0, 0),
  ('yelp', 'Yelp', 3, 'none', NULL, false, 'No bulk submission API', NULL, 0, 0),
  ('yellowpages', 'YellowPages', 3, 'none', NULL, false, 'No bulk submission API', NULL, 0, 0),
  ('merchantcircle', 'MerchantCircle', 3, 'none', NULL, false, 'No bulk submission API', NULL, 0, 0)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  auth_method = EXCLUDED.auth_method,
  base_url = EXCLUDED.base_url,
  is_aggregator = EXCLUDED.is_aggregator,
  coverage_description = EXCLUDED.coverage_description,
  documentation_url = EXCLUDED.documentation_url,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
  rate_limit_per_day = EXCLUDED.rate_limit_per_day,
  updated_at = NOW();

-- ============ Seed Data: Aggregator Distributions ============
-- These directories are automatically populated when you submit to aggregators
INSERT INTO aggregator_distributions (aggregator_slug, directory_name, directory_url, notes) VALUES
  -- LDE distributions
  ('lde', 'Apple Maps', 'https://mapsconnect.apple.com', 'Via LDE API'),
  ('lde', 'Bing Places', 'https://www.bingplaces.com', 'Via LDE API'),
  ('lde', 'TomTom', 'https://www.tomtom.com', 'Navigation'),
  ('lde', 'HERE', 'https://www.here.com', 'Navigation'),
  ('lde', 'Yahoo', 'https://www.yahoo.com', 'Search'),
  ('lde', 'Uber', 'https://www.uber.com', 'Ride sharing'),
  ('lde', 'Navmii', 'https://www.navmii.com', 'Navigation'),
  ('lde', 'MapQuest', 'https://www.mapquest.com', 'Navigation'),

  -- Foursquare distributions
  ('foursquare', 'Snapchat', 'https://www.snapchat.com', 'Via Foursquare'),
  ('foursquare', 'Uber', 'https://www.uber.com', 'Via Foursquare'),
  ('foursquare', 'Samsung', 'https://www.samsung.com', 'Via Foursquare'),
  ('foursquare', 'Microsoft', 'https://www.microsoft.com', 'Via Foursquare'),
  ('foursquare', 'Apple', 'https://www.apple.com', 'Via Foursquare'),
  ('foursquare', 'Spotify', 'https://www.spotify.com', 'Via Foursquare'),

  -- Localeze distributions
  ('localeze', 'Google', 'https://www.google.com', 'Via Localeze'),
  ('localeze', 'Apple', 'https://www.apple.com', 'Via Localeze'),
  ('localeze', 'Bing', 'https://www.bing.com', 'Via Localeze'),
  ('localeze', 'HERE', 'https://www.here.com', 'Via Localeze'),
  ('localeze', 'TomTom', 'https://www.tomtom.com', 'Via Localeze'),
  ('localeze', 'Alexa', 'https://www.amazon.com/alexa', 'Via Localeze'),
  ('localeze', 'Facebook', 'https://www.facebook.com', 'Via Localeze'),

  -- Data Axle distributions
  ('data-axle', 'Google', 'https://www.google.com', 'Via Data Axle'),
  ('data-axle', 'Yelp', 'https://www.yelp.com', 'Via Data Axle'),
  ('data-axle', 'Facebook', 'https://www.facebook.com', 'Via Data Axle'),
  ('data-axle', 'Yahoo', 'https://www.yahoo.com', 'Via Data Axle'),
  ('data-axle', 'Bing', 'https://www.bing.com', 'Via Data Axle')
ON CONFLICT (aggregator_slug, directory_name) DO NOTHING;

-- ============ Seed Data: Provider Credentials ============
-- Initialize credential placeholders for providers that need them
INSERT INTO provider_credentials (provider_slug, credential_key, is_configured) VALUES
  ('foursquare', 'api_key', false),
  ('data-axle', 'api_key', false),
  ('google-business', 'client_id', false),
  ('google-business', 'client_secret', false),
  ('google-business', 'refresh_token', false),
  ('facebook', 'app_id', false),
  ('facebook', 'app_secret', false),
  ('facebook', 'access_token', false),
  ('brownbook', 'api_key', false),
  ('lde', 'rapidapi_key', false),
  ('localeze', 'api_key', false),
  ('yext', 'api_key', false)
ON CONFLICT (provider_slug, credential_key) DO NOTHING;
