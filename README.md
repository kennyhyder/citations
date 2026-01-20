# Citation Management Tool

Automate syncing domains from Hostinger, GoDaddy, and Namecheap into Namecheap's RelateLocal app for citation building (business listing management across 40+ directories).

## Features

- **Multi-source domain sync**: Pull domains from Hostinger, GoDaddy, and Namecheap APIs
- **Brand management**: Add business NAP (Name, Address, Phone), categories, hours, and social links per domain
- **RelateLocal integration**: Push domains with brand info to Relate for citation building
- **Automated sync**: Daily cron job via Vercel for hands-off operation
- **Dashboard**: Overview of all domains, sync status, and recent activity

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Hostinger  │     │   GoDaddy   │     │  Namecheap  │
│    API      │     │    API      │     │    API      │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────┬───────┴───────────────────┘
                   ▼
         ┌─────────────────┐
         │   Next.js App   │
         │   (Dashboard)   │
         └────────┬────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
   ┌──────────┐    ┌──────────────┐
   │ Supabase │    │ Relate API   │
   │ (State)  │    │ (Citations)  │
   └──────────┘    └──────────────┘
```

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd citations
npm install
```

### 2. Configure Supabase

1. Create a new Supabase project at https://supabase.com
2. Go to Settings > API and copy your project URL and anon key
3. Run the SQL schema in `src/lib/db/schema.sql` via the Supabase SQL Editor

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Domain providers (configure as needed)
HOSTINGER_API_KEY=
GODADDY_API_KEY=
GODADDY_API_SECRET=
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_CLIENT_IP=

# Relate API
RELATE_API_TOKEN=
```

### 4. Run locally

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Deploy to Vercel

```bash
vercel
```

The cron job is configured in `vercel.json` to run daily at 6 AM UTC.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync` | POST | Trigger a sync (`type`: domains/relate/full, `source`: all/hostinger/godaddy/namecheap) |
| `/api/domains` | GET | List all domains with brand info |
| `/api/domains/[id]` | GET | Get single domain details |
| `/api/domains/[id]/brand` | POST | Save brand info for a domain |
| `/api/cron/sync` | GET | Cron endpoint for scheduled syncs |

## Pages

- `/` - Dashboard with stats and recent activity
- `/domains` - List all domains with status
- `/sync` - Manual sync controls
- `/brands/[id]` - Edit brand info for a domain

## Domain Provider API Requirements

| Service | Requirements | Docs |
|---------|-------------|------|
| Hostinger | API key from hPanel | [Hostinger API](https://developers.hostinger.com/) |
| GoDaddy | API key + secret (10+ domains required) | [GoDaddy API](https://developer.godaddy.com/) |
| Namecheap | API key + IP whitelist ($50 balance or 20+ domains) | [Namecheap API](https://www.namecheap.com/support/api/) |
| Relate | API token from Participant menu | Contact Namecheap |

## Database Tables

- `domains` - Unified domain list with source tracking
- `brand_info` - Full business info per domain (NAP, categories, hours, etc.)
- `relate_brands` - Domains pushed to Relate with sync status
- `sync_logs` - Audit trail of all sync operations
