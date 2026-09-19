import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ results: [] });

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    if (!query || query.trim().length === 0) return NextResponse.json({ results: [] });

    const results: any[] = [];

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
