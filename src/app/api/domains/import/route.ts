import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface CSVRow {
  domain: string;
  business_name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  categories?: string;
  description?: string;
  logo_url?: string;
  // Social links
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  // Hours (open/close for each day)
  monday_open?: string;
  monday_close?: string;
  tuesday_open?: string;
  tuesday_close?: string;
  wednesday_open?: string;
  wednesday_close?: string;
  thursday_open?: string;
  thursday_close?: string;
  friday_open?: string;
  friday_close?: string;
  saturday_open?: string;
  saturday_close?: string;
  sunday_open?: string;
  sunday_close?: string;
}

function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Validate required headers
  if (!headers.includes('domain') || !headers.includes('business_name')) {
    throw new Error('CSV must have "domain" and "business_name" columns');
  }

  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields with commas
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ''));

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    if (row.domain && row.business_name) {
      rows.push(row as unknown as CSVRow);
    }
  }

  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        message: 'No file provided'
      }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No valid rows found in CSV'
      }, { status: 400 });
    }

    const results = {
      total: rows.length,
      imported: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      try {
        // Check if domain exists
        const existingDomain = await db.getDomainByName(row.domain);

        let domainId: string;

        if (existingDomain) {
          domainId = existingDomain.id;
          results.updated++;
        } else {
          // Create new domain
          const newDomain = await db.upsertDomain({
            domain: row.domain,
            source: 'manual' as 'hostinger' | 'godaddy' | 'namecheap', // Add manual as valid source
            source_id: null,
            status: 'active',
            expires_at: null,
            last_synced_at: new Date().toISOString(),
          });
          domainId = newDomain.id;
          results.imported++;
        }

        // Build hours object from CSV columns
        const hours: Record<string, { open: string; close: string }> = {};
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        let hasHours = false;
        for (const day of days) {
          const openKey = `${day}_open` as keyof CSVRow;
          const closeKey = `${day}_close` as keyof CSVRow;
          if (row[openKey] || row[closeKey]) {
            hours[day] = {
              open: (row[openKey] as string) || '',
              close: (row[closeKey] as string) || '',
            };
            hasHours = true;
          }
        }

        // Build social links object
        const socialLinks: Record<string, string> = {};
        let hasSocialLinks = false;
        const platforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'];
        for (const platform of platforms) {
          const value = row[platform as keyof CSVRow] as string | undefined;
          if (value) {
            socialLinks[platform] = value;
            hasSocialLinks = true;
          }
        }

        // Save brand info
        await db.upsertBrandInfo({
          domain_id: domainId,
          business_name: row.business_name,
          street: row.street || null,
          city: row.city || null,
          state: row.state || null,
          zip: row.zip || null,
          country: row.country || 'US',
          phone: row.phone || null,
          email: row.email || null,
          website: row.website || null,
          categories: row.categories ? row.categories.split(',').map(c => c.trim()) : null,
          description: row.description || null,
          hours: hasHours ? hours : null,
          social_links: hasSocialLinks ? socialLinks : null,
          logo_url: row.logo_url || null,
          image_urls: null,
        });

      } catch (error) {
        results.errors.push(`${row.domain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${results.imported} new domains, updated ${results.updated} existing domains`,
      results,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to import CSV',
    }, { status: 500 });
  }
}
