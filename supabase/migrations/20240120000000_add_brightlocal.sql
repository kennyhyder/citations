-- Add BrightLocal brands table for tracking citation campaigns
CREATE TABLE IF NOT EXISTS brightlocal_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    brightlocal_location_id TEXT,
    brightlocal_campaign_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'syncing', 'error')),
    citations_ordered INTEGER NOT NULL DEFAULT 0,
    citations_completed INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_brightlocal_brands_domain_id ON brightlocal_brands(domain_id);
CREATE INDEX IF NOT EXISTS idx_brightlocal_brands_status ON brightlocal_brands(status);
CREATE INDEX IF NOT EXISTS idx_brightlocal_brands_location_id ON brightlocal_brands(brightlocal_location_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_brightlocal_brands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_brightlocal_brands_updated_at ON brightlocal_brands;
CREATE TRIGGER update_brightlocal_brands_updated_at
    BEFORE UPDATE ON brightlocal_brands
    FOR EACH ROW
    EXECUTE FUNCTION update_brightlocal_brands_updated_at();

-- Enable RLS
ALTER TABLE brightlocal_brands ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for service role)
DROP POLICY IF EXISTS "Allow all for service role" ON brightlocal_brands;
CREATE POLICY "Allow all for service role" ON brightlocal_brands
    FOR ALL
    USING (true)
    WITH CHECK (true);
