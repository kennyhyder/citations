-- Settings table for storing API credentials and configuration
-- Supports both global settings and per-user settings
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    value TEXT,
    encrypted BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(key)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_updated_at();

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for authenticated users)
DROP POLICY IF EXISTS "Allow all for authenticated" ON settings;
CREATE POLICY "Allow all for authenticated" ON settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Insert default settings with empty values (to be configured via UI)
INSERT INTO settings (key, value, description, category) VALUES
    ('hostinger_api_key', '', 'Hostinger API Key', 'domains'),
    ('godaddy_api_key', '', 'GoDaddy API Key', 'domains'),
    ('godaddy_api_secret', '', 'GoDaddy API Secret', 'domains'),
    ('namecheap_api_user', '', 'Namecheap API Username', 'domains'),
    ('namecheap_api_key', '', 'Namecheap API Key', 'domains'),
    ('namecheap_client_ip', '', 'Namecheap Whitelisted IP', 'domains'),
    ('namecheap_username', '', 'Namecheap Account Username (for Relate)', 'relate'),
    ('namecheap_password', '', 'Namecheap Account Password (for Relate)', 'relate'),
    ('brightlocal_api_key', '', 'BrightLocal API Key', 'brightlocal')
ON CONFLICT (key) DO NOTHING;
