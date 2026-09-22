// Fast local/CI guard. Reports locations and types, NEVER credential values.
// This is a targeted scan, not a replacement for GitHub secret scanning.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['Google refresh token', /\b1\/\/[A-Za-z0-9_-]{30,}\b/g],
  ['Resend secret', /\bre_[A-Za-z0-9_]{25,}\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private API key', /\bkwp_live_[a-f0-9]{32}\b/g],
  ['credentialed database URL', /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]{8,}@/g],
];
let findings = 0, files = 0;
function scan(text, label) {
  for (const [type, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      // Documentation placeholder in backup instructions, never an actual password.
      if (type === 'credentialed database URL' && match[0].includes('LACONTRASEÑA')) continue;
      console.error(`${label}:${line}: ${type} [REDACTED]`); findings++;
    }
  }
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const claim = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url'));
      if (claim.role === 'anon') continue; // Intentional public client credential.
      console.error(`${label}:${text.slice(0, match.index).split('\n').length}: non-public JWT [REDACTED]`); findings++;
    } catch { /* Not a JWT */ }
  }
  for (const match of text.matchAll(/\b(?:[a-z_]*(?:secret|secreto|password|api_key|refresh_token)[a-z_]*|SERVICE_ROLE_KEY)\s*['"]?\s*(?:text\s*)?(?::?=|:)\s*(['"])([^'"\n]{8,})\1/gi)) {
    if (/\.test\.|scan-secrets|\.example$/.test(label) || /^(?:Dejar |\.\.\.|<|LACONTRASE|PON_AQUI_|test-)/.test(match[2])) continue;
    console.error(`${label}:${text.slice(0, match.index).split('\n').length}: literal credential [REDACTED]`); findings++;
  }
}
if (process.argv.includes('--history')) {
  // Distinct historical blobs, no mutations and no secret contents in output.
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim().split('\n');
  const paths = new Map();
  for (const object of objects) {
    const [sha, ...parts] = object.split(' '); const path = parts.join(' ');
    if (!/\.(?:html|js|mjs|ts|sql|sh|json|env|md|yml)$/.test(path) || /(?:^|\/)(?:node_modules|vendor)\//.test(path) || /(?:package|deno)-?lock/.test(path)) continue;
    paths.set(sha, path);
  }
  const child = spawn('git', ['cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const completed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error('git cat-file failed'))); });
  child.stdin.end([...paths.keys()].join('\n') + '\n');
  let buffer = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const newline = buffer.indexOf(10);
      if (newline < 0) break;
      const [sha, kind, sizeRaw] = buffer.subarray(0, newline).toString().split(' ');
      if (kind !== 'blob') throw new Error('Unexpected history object type');
      const end = newline + 1 + Number(sizeRaw);
      if (buffer.length <= end) break;
      scan(buffer.subarray(newline + 1, end).toString('utf8'), `${sha.slice(0, 10)}:${paths.get(sha)}`);
      files++;
      buffer = buffer.subarray(end + 1);
    }
  }
  await completed;
} else {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of paths) {
    if (!existsSync(path) || /\.(?:png|jpg|jpeg|ico|pdf|lock)$/.test(path) || path === 'package-lock.json') continue;
    scan(readFileSync(path, 'utf8'), path); files++;
  }
}
console.log(`Scanned ${files} files/blobs; ${findings} potential secrets. Public Supabase keys are allowed.`);
if (findings) process.exitCode = 1;
