import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import fs from 'fs';
import { PINNACLE_SUBJECTS, isPinnacleFile } from '@/lib/pinnacle';

export const dynamic = 'force-dynamic';

const EXTRACTOR_URL = process.env.PYTHON_EXTRACTOR_URL || 'http://localhost:8000';

/**
 * Import files from the local filesystem into the database.
 * This registers them, runs verification via the Python extractor,
 * and stores the extracted pages — all from the local file path.
 *
 * Body: { files: [{ filepath, filename, extension, sizeBytes, topicPath }] }
 */
export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { files } = await request.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const results: any[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const fileInfo of files) {
      const { filepath, filename, extension, sizeBytes, topicPath } = fileInfo;

      if (!isPinnacleFile(filename)) {
        failed++;
        results.push({ filename, status: 'failed', reason: 'Only pinnacle ho.pdf is supported' });
        continue;
      }

      // Check if file is already imported (by filepath)
      const { data: existing } = await supabase
        .from('files')
        .select('id')
        .eq('storage_path', filepath)
        .single();

      if (existing) {
        if (isPinnacleFile(filename)) {
          for (const subject of PINNACLE_SUBJECTS) {
            const { data: subjectTopic } = await supabase
              .from('topics')
              .upsert({ name: subject.name, description: `${subject.code} section from Pinnacle Ho` }, { onConflict: 'name' })
              .select()
              .single();
            if (subjectTopic) {
              await supabase.from('file_topics').upsert({
                file_id: existing.id,
                topic_id: subjectTopic.id,
              });
            }
          }
        }
        skipped++;
        results.push({ filename, status: 'skipped', reason: 'Already imported' });
        continue;
      }

      // Verify the file exists on disk
      if (!fs.existsSync(filepath)) {
        failed++;
        results.push({ filename, status: 'failed', reason: 'File not found on disk' });
        continue;
      }

      // Create file record in DB (using filepath as storage_path)
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          filename,
          file_type: extension,
          storage_path: filepath,  // Local filesystem path
          file_size_bytes: sizeBytes,
          verification_status: 'pending',
          processing_status: 'pending',
        })
        .select()
        .single();

      if (dbError) {
        failed++;
        results.push({ filename, status: 'failed', reason: dbError.message });
        continue;
      }

      // Auto-create topic from folder path if it looks like a subject
      if (topicPath) {
        const topFolder = topicPath.split('/')[0] || '';
        const topicName = topFolder.replace(/^\d+\.\s*/, '').trim();
        if (topicName && topicName.length > 2) {
          // Upsert topic
          const { data: topic } = await supabase
            .from('topics')
            .upsert({ name: topicName }, { onConflict: 'name' })
            .select()
            .single();

          if (topic) {
            // Link file to topic
            await supabase
              .from('file_topics')
              .upsert({ file_id: fileRecord.id, topic_id: topic.id })
              .select();
          }

          if (isPinnacleFile(filename)) {
            for (const subject of PINNACLE_SUBJECTS) {
              const { data: subjectTopic } = await supabase
                .from('topics')
                .upsert({ name: subject.name, description: `${subject.code} section from Pinnacle Ho` }, { onConflict: 'name' })
                .select()
                .single();
              if (subjectTopic) {
                await supabase.from('file_topics').upsert({
                  file_id: fileRecord.id,
                  topic_id: subjectTopic.id,
                });
              }
            }
          }
        }
      }

      // Try to verify and extract via the Python extractor
      try {
        // Read the file from disk
        const fileBuffer = fs.readFileSync(filepath);
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append('file', blob, filename);

        // Verify
        const verifyRes = await fetch(`${EXTRACTOR_URL}/verify`, {
          method: 'POST',
          body: formData,
        });

        if (verifyRes.ok) {
          const report = await verifyRes.json();

          await supabase
            .from('files')
            .update({
              verification_status: report.status,
              verification_report: report,
              page_count: report.page_count,
            })
            .eq('id', fileRecord.id);

          // Extract text if verified
          if (report.status === 'readable' || report.status === 'needs_ocr') {
            const extractForm = new FormData();
            extractForm.append('file', blob, filename);

            const extractRes = await fetch(`${EXTRACTOR_URL}/extract`, {
              method: 'POST',
              body: extractForm,
            });

            if (extractRes.ok) {
              const extracted = await extractRes.json();
              const pageRows = extracted.pages.map((page: any) => ({
                file_id: fileRecord.id,
                page_number: page.page_number,
                raw_text: page.text,
                extraction_method: page.extraction_method,
              }));

              if (pageRows.length > 0) {
                await supabase
                  .from('pages')
                  .upsert(pageRows, { onConflict: 'file_id,page_number' });
              }

              await supabase
                .from('files')
                .update({ processing_status: 'completed' })
                .eq('id', fileRecord.id);
            }
          }

          imported++;
          results.push({
            filename,
            status: 'imported',
            verificationStatus: report.status,
            pageCount: report.page_count,
          });
        } else {
          // Extractor not available — register file but skip verification
          imported++;
          results.push({
            filename,
            status: 'registered',
            reason: 'Extractor service not available — file registered but not yet verified',
          });
        }
      } catch (extractorError: any) {
        // Extractor might not be running — still register the file
        imported++;
        results.push({
          filename,
          status: 'registered',
          reason: 'Extractor not reachable — file registered for later processing',
        });
      }
    }

    return NextResponse.json({
      total: files.length,
      imported,
      skipped,
      failed,
      results,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
