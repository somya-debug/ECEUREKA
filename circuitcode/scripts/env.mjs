// Minimal .env loader (no dependencies). Values already in process.env win over the file.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = resolve(ROOT, '.env')) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '127.0.0.1',
  app: resolve(ROOT, process.env.CC_APP || 'index.html'),
  filter: process.env.CC_FILTER || '',
  verbose: process.env.CC_VERBOSE === '1' || process.env.CC_VERBOSE === 'true'
};
