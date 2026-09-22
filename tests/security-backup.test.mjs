import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash';
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Z]):/i, (_, drive) => '/' + drive.toLowerCase());
test('backup refuses missing encryption configuration and never promotes a failed dump', { skip: !existsSync(bash) }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kw-security-backup-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const stub = (name, body) => writeFileSync(join(bin, name), '#!/bin/bash\n' + body, { mode: 0o700 });
  stub('git', `case "$1 $2" in
    'rev-parse --show-toplevel') echo "$BACKUP_TEST_ROOT";;
    'bundle create') touch "$3";;
    'bundle verify') echo 'complete history';;
    'log --oneline') echo 'fixture commit';;
    *) exit 1;;
  esac\n`);
  stub('pg_dump', `touch "$BACKUP_DIRECTORY/dump-called"
    printf 'fixture-row\\n'
    exit "${'${BACKUP_TEST_FAIL_DUMP:-0}'}"\n`);
  // A stub verifies orchestration, not age cryptography. No production data.
  stub('age', `test "$1" = '-r' && test -n "$2" && test "$3" = '-o' || exit 1
    cat >/dev/null
    printf 'encrypted-fixture\\n' > "$4"\n`);
  const baseEnv = { ...process.env, PATH: `${posix(bin)}:/usr/bin:/bin`, BACKUP_TEST_ROOT: posix(dir),
    SUPABASE_DB_URL: 'fixture-db', BACKUP_AGE_RECIPIENT: 'fixture-public-recipient' };
  const script = posix(fileURLToPath(new URL('../herramientas/respaldo.sh', import.meta.url)));
  function run(name, env) {
    const destination = join(dir, name);
    const result = spawnSync(bash, [script], { encoding: 'utf8', env: { ...baseEnv, BACKUP_DIRECTORY: posix(destination), ...env } });
    return { result, destination, files: existsSync(destination) ? readdirSync(destination, { recursive: true }).map(String) : [] };
  }
  try {
    const missing = run('missing', { BACKUP_AGE_RECIPIENT: '' });
    assert.equal(missing.result.status, 1, missing.result.stderr);
    assert(!existsSync(join(missing.destination, 'dump-called')));
    const failed = run('failed', { BACKUP_TEST_FAIL_DUMP: '1' });
    assert.equal(failed.result.status, 1, failed.result.stderr);
    assert(!failed.files.some((name) => name.endsWith('.sql.gz.age')));
    const success = run('success', {});
    assert.equal(success.result.status, 0, success.result.stderr);
    const archive = success.files.find((name) => name.endsWith('.sql.gz.age'));
    assert(archive);
    assert.equal(readFileSync(join(success.destination, archive), 'utf8'), 'encrypted-fixture\n');
    assert(!success.files.some((name) => /\.sql(?:\.gz)?$/.test(name)));
  } finally {
    // Exact directory created by this test, never the user's backup directory.
    rmSync(dir, { recursive: true, force: true });
  }
});
