#!/usr/bin/env tsx
/**
 * Supabase Topics Seeding Script
 * 
 * Seeds the database with Pinnacle CPA exam subjects.
 * Run with: npm run setup
 */

import { createClient } from '@supabase/supabase-js';
import { PINNACLE_SUBJECTS } from '../src/lib/pinnacle';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Supabase credentials not found in .env.local');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Topic colors for each subject
const TOPIC_COLORS: Record<string, string> = {
  'Financial Accounting and Reporting': '#3b82f6',      // Blue
  'Advanced Financial Accounting and Reporting': '#8b5cf6', // Purple
  'Management Services': '#10b981',                      // Green
  'Auditing Theory': '#f59e0b',                         // Amber
  'Auditing Practice': '#ef4444',                       // Red
  'Taxation': '#06b6d4',                                // Cyan
  'Regulatory Framework for Business Transactions': '#ec4899', // Pink
};

// Icons for each subject
const TOPIC_ICONS: Record<string, string> = {
  'Financial Accounting and Reporting': '💰',
  'Advanced Financial Accounting and Reporting': '📊',
  'Management Services': '📈',
  'Auditing Theory': '🔍',
  'Auditing Practice': '✅',
  'Taxation': '💵',
  'Regulatory Framework for Business Transactions': '⚖️',
};

async function seedTopics() {
  console.log('🌱 Starting topics seeding...\n');

  try {
    // Check connection
    const { error: connectionError } = await supabase.from('topics').select('id').limit(1);
    if (connectionError) {
      throw new Error(`Connection failed: ${connectionError.message}`);
    }

    console.log('✅ Connected to Supabase\n');

    // Prepare topics data
    const topics = PINNACLE_SUBJECTS.map((subject) => ({
      name: subject.name,
      description: `${subject.code} - Pages ${subject.startPage}–${subject.endPage}`,
      color: TOPIC_COLORS[subject.name] || '#3b82f6',
      icon: TOPIC_ICONS[subject.name] || '📚',
    }));

    console.log(`📝 Seeding ${topics.length} topics...\n`);

    // Upsert topics (insert or update if exists)
    const { data, error } = await supabase
      .from('topics')
      .upsert(topics, { onConflict: 'name' })
      .select();

    if (error) {
      throw new Error(`Seeding failed: ${error.message}`);
    }

    console.log('✅ Topics seeded successfully!\n');
    console.log('Created/Updated topics:');
    data?.forEach((topic) => {
      console.log(`  ${topic.icon} ${topic.name} (${topic.color})`);
    });

    console.log('\n✨ Setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Start the dev server: npm run dev');
    console.log('  2. Start the Python extractor: cd extractor && python -m uvicorn main:app --reload');
    console.log('  3. Open http://localhost:3000');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the seeding
seedTopics();
