import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isAllowedStudyFile } from '@/lib/pinnacle';

export const dynamic = 'force-dynamic';

// The root directory containing all study materials
const STUDY_ROOT = path.resolve(process.cwd(), '..');

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.pptx', '.txt', '.md',
  '.jpg', '.jpeg', '.png',
]);

// Folders to skip during scanning
const SKIP_FOLDERS = new Set([
  'study-hub',     // Our app itself
  'node_modules',
  '.next',
  '.git',
  '.gemini',
]);

interface ScannedFile {
  filename: string;
  filepath: string;         // Absolute path on disk
  relativePath: string;     // Relative to study root
  folder: string;           // Immediate parent folder (topic)
  topicPath: string;        // Full topic path hierarchy
  extension: string;
  sizeBytes: number;
}

function scanDirectory(dir: string, rootDir: string): ScannedFile[] {
  const results: ScannedFile[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_FOLDERS.has(entry.name)) continue;
        // Recurse into subdirectories
        results.push(...scanDirectory(fullPath, rootDir));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext) || !isAllowedStudyFile(entry.name)) continue;

        try {
          const stats = fs.statSync(fullPath);
          const relativePath = path.relative(rootDir, fullPath);
          const relativeDir = path.relative(rootDir, dir);

          // Extract topic from the folder hierarchy
          // e.g. "1. ACCOUNTING FUNDAMENTALS\Acctg Principles 8th Ed (24 Files)" 
          // → topic = "ACCOUNTING FUNDAMENTALS"
          const pathParts = relativeDir.split(path.sep);
          const topFolder = pathParts[0] || '';
          // Strip the leading number and dot pattern (e.g. "1. " or "12. ")
          const topicName = topFolder.replace(/^\d+\.\s*/, '').trim();

          results.push({
            filename: entry.name,
            filepath: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'),
            folder: path.basename(dir),
            topicPath: relativeDir.replace(/\\/g, '/'),
            extension: ext.slice(1), // Remove the dot
            sizeBytes: stats.size,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}

export async function GET() {
  try {
    const files = scanDirectory(STUDY_ROOT, STUDY_ROOT);

    // Group by top-level topic folder
    const topicMap: Record<string, ScannedFile[]> = {};
    for (const file of files) {
      const parts = file.topicPath.split('/');
      const topFolder = parts[0] || 'Root';
      if (!topicMap[topFolder]) topicMap[topFolder] = [];
      topicMap[topFolder].push(file);
    }

    // Build topic summary
    const topics = Object.entries(topicMap).map(([folder, topicFiles]) => ({
      folder,
      topicName: folder.replace(/^\d+\.\s*/, '').trim(),
      fileCount: topicFiles.length,
      totalSizeBytes: topicFiles.reduce((s, f) => s + f.sizeBytes, 0),
      extensions: [...new Set(topicFiles.map((f) => f.extension))],
    }));

    // Sort topics by folder name
    topics.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));

    return NextResponse.json({
      rootPath: STUDY_ROOT,
      totalFiles: files.length,
      totalSizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      topics,
      files,
    });
  } catch (error: any) {
    console.error('Scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
