import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError, validateRequestBody } from '@/lib/api-utils';
import { createTopicSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ topics: [] });

  try {
    const { data: topics, error } = await supabase.from('topics').select('*').order('name');
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ topics: topics || [] });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Not configured', 503);

  try {
    // Validate request body with Zod
    const validation = await validateRequestBody(request, createTopicSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { name, description, color, icon } = validation.data;

    const { data: topic, error } = await supabase
      .from('topics').upsert({ name, description, color, icon }, { onConflict: 'name' })
      .select().single();

    if (error) return errorResponse(error.message, 500);
    return NextResponse.json(topic);
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}
