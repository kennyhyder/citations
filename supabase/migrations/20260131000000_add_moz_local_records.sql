-- Create moz_local_records table to track Moz Local location IDs for each domain
CREATE TABLE IF NOT EXISTS moz_local_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  moz_local_id TEXT,
  moz_business_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error')),
  visibility_index NUMERIC,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_moz_local_records_domain_id ON moz_local_records(domain_id);
CREATE INDEX IF NOT EXISTS idx_moz_local_records_moz_local_id ON moz_local_records(moz_local_id);

-- Enable RLS
ALTER TABLE moz_local_records ENABLE ROW LEVEL SECURITY;

-- Create policy (adjust based on your auth setup)
CREATE POLICY "Allow all operations on moz_local_records" ON moz_local_records
  FOR ALL USING (true) WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_moz_local_records_updated_at
  BEFORE UPDATE ON moz_local_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
