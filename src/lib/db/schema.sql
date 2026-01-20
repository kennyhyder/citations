-- Citation Management Tool - Database Schema
-- Run this in Supabase SQL Editor to create the necessary tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domains table: unified list of domains from all sources
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL CHECK (source IN ('hostinger', 'godaddy', 'namecheap')),
  source_id VARCHAR(255), -- Original ID from source provider
  status VARCHAR(50) DEFAULT 'active',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE
);

-- Brand info table: full business information per domain
CREATE TABLE IF NOT EXISTS brand_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  -- Address fields (NAP)
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100) DEFAULT 'US',
  -- Contact info
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(500),
  -- Business details
  categories TEXT[], -- Array of category strings
  description TEXT,
  -- Hours of operation (stored as JSONB)
  hours JSONB,
  -- Social links (stored as JSONB)
  social_links JSONB,
  -- Media
  logo_url VARCHAR(500),
  image_urls TEXT[],
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(domain_id)
);

-- Relate brands table: domains pushed to RelateLocal
CREATE TABLE IF NOT EXISTS relate_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  relate_brand_id VARCHAR(255), -- ID from Relate API
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'syncing', 'error')),
  directory_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(domain_id)
);

-- Sync logs table: track sync history and status
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('domains', 'relate', 'full')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  source VARCHAR(50), -- 'hostinger', 'godaddy', 'namecheap', 'all', or 'relate'
  domains_found INTEGER DEFAULT 0,
  domains_added INTEGER DEFAULT 0,
  domains_updated INTEGER DEFAULT 0,
  brands_pushed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB -- Additional sync details
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_domains_source ON domains(source);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_brand_info_domain_id ON brand_info(domain_id);
CREATE INDEX IF NOT EXISTS idx_relate_brands_domain_id ON relate_brands(domain_id);
CREATE INDEX IF NOT EXISTS idx_relate_brands_status ON relate_brands(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
CREATE TRIGGER update_domains_updated_at
  BEFORE UPDATE ON domains
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_brand_info_updated_at ON brand_info;
CREATE TRIGGER update_brand_info_updated_at
  BEFORE UPDATE ON brand_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_relate_brands_updated_at ON relate_brands;
CREATE TRIGGER update_relate_brands_updated_at
  BEFORE UPDATE ON relate_brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (optional, for future multi-tenant support)
-- ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE brand_info ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE relate_brands ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
