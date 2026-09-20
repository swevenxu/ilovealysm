import crypto from 'crypto';

export function questionHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
