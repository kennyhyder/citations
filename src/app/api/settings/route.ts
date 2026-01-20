import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface SettingWithMeta {
  id: string;
  key: string;
  value: string;
  hasValue: boolean;
  description: string | null;
  category: string;
  encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const settings = await db.getSettings();

    // Group by category
    const grouped = settings.reduce((acc, s) => {
      if (!acc[s.category]) {
        acc[s.category] = [];
      }
      // Mask sensitive values for display
      const settingWithMeta: SettingWithMeta = {
        ...s,
        value: s.value ? (s.key.includes('password') || s.key.includes('secret') ? '••••••••' : s.value) : '',
        hasValue: !!s.value,
      };
      acc[s.category].push(settingWithMeta);
      return acc;
    }, {} as Record<string, SettingWithMeta[]>);

    return NextResponse.json({
      success: true,
      settings: grouped,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to load settings',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings } = body as { settings: Record<string, string | null> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({
        success: false,
        message: 'Settings object required',
      }, { status: 400 });
    }

    // Filter out masked values (don't update if value is just asterisks)
    const filteredSettings: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (value && !value.match(/^•+$/)) {
        filteredSettings[key] = value;
      } else if (value === '' || value === null) {
        filteredSettings[key] = null;
      }
    }

    await db.updateSettings(filteredSettings);

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save settings',
    }, { status: 500 });
  }
}
