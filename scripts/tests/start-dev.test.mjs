import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const scripts = new URL('../', import.meta.url)
const quote = value => `'${value.replaceAll("'", "'\\''")}'`

// Isolated processes and mocked commands exercise the actual shell scripts.
// No PostgreSQL, real game servers, or Tailscale configuration are used.
async function fixture(t, overrides = {}, tailnet = false) {
  const root = await mkdtemp(join(tmpdir(), 'bluff-start-test-'))
  const bin = join(root, 'bin')
  await mkdir(bin)
  await mkdir(join(root, 'scripts'))
  await mkdir(join(root, 'frontend/node_modules/vite/bin'), { recursive: true })
  await cp(new URL('start-dev.sh', scripts), join(root, 'scripts/start-dev.sh'))
  for (const directory of ['lib', 'dev', 'network']) {
    await cp(new URL(directory, scripts), join(root, 'scripts', directory), { recursive: true })
  }
  // Match the lost executable bits seen on copied checkouts.
  await chmod(join(root, 'scripts/network/tailscale.sh'), 0o644)
  const server = `
    const fs = require('node:fs');
    const path = require('node:path');
    const name = process.argv[2];
    const record = value => fs.appendFileSync(path.join(process.env.MOCK_ROOT, 'events'), value + '\\n');
    record(name + '-started');
    fs.writeFileSync(path.join(process.env.MOCK_ROOT, name + '.pid'), String(process.pid));
    if (name === 'frontend') {
      if (!fs.existsSync(path.join(process.env.MOCK_ROOT, 'backend-ready'))) process.exit(41);
      if (process.env.BLUFF_BACKEND_URL !== 'http://127.0.0.1:45871' || process.env.VITE_LOCAL_API_URL !== process.env.BLUFF_BACKEND_URL) process.exit(42);
    }
    if (process.env.MOCK_FAIL === name) process.exit(17);
    process.on('SIGTERM', () => { record(name + '-stopped'); process.exit(0); });
    setInterval(() => {
      if (name === 'frontend' && fs.existsSync(path.join(process.env.MOCK_ROOT, 'exit-frontend'))) process.exit(23);
    }, 25);
  `
  await writeFile(join(root, 'server.cjs'), server)
  await writeFile(join(root, 'gradlew'), `#!/bin/sh\nexec node ${quote(join(root, 'server.cjs'))} backend\n`, { mode: 0o644 })
  await writeFile(join(root, 'frontend/node_modules/vite/bin/vite.js'), `process.argv[2] = 'frontend';\n${server}`, { mode: 0o644 })
  await writeFile(join(bin, 'java'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  await writeFile(join(bin, 'node'), `#!/bin/sh
if [ "$1" = "--input-type=module" ]; then
  if [ "$MOCK_FAIL" = dependencies ]; then echo 'Cannot find native binding' >&2; exit 1; fi
  exit 0
fi
exec ${quote(process.execPath)} "$@"
`, { mode: 0o755 })
  await writeFile(join(bin, 'curl'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.MOCK_ROOT;
const health = process.argv.at(-1).endsWith('/api/health');
const ready = path.join(root, health ? 'backend-ready' : 'frontend-ready');
const pid = path.join(root, health ? 'backend.pid' : 'frontend.pid');
if (!fs.existsSync(pid) || (health && process.env.MOCK_FAIL === 'health')
    || process.env.MOCK_FAIL === (health ? 'backend' : 'frontend')) process.exit(22);
if (!fs.existsSync(ready)) {
  fs.writeFileSync(ready, 'ready');
  fs.appendFileSync(path.join(root, 'events'), (health ? 'backend-ready' : 'frontend-ready') + '\\n');
}
`, { mode: 0o755 })
  await writeFile(join(bin, 'tailscale'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
if (process.argv[2] === 'status') {
  console.log(JSON.stringify({ BackendState: process.env.MOCK_FAIL === 'tailnet' ? 'NeedsLogin' : 'Running' }));
} else if (process.argv.includes('--bg')) {
  fs.appendFileSync(path.join(process.env.MOCK_ROOT, 'events'), 'tailnet-served\\n');
  console.log('Tailnet ready');
}
`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_ROOT: root,
    DB_URL: 'jdbc:postgresql://unused.invalid/disposable', PORT: '45871', BLUFF_STARTUP_TIMEOUT: '5', ...overrides }
  // These are plain mock services, not nested Node test runner processes.
  delete env.NODE_TEST_CONTEXT
  const child = spawn('bash', [join(root, 'scripts/start-dev.sh'), ...(tailnet ? ['--tailnet'] : [])], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', value => { output += value })
  child.stderr.on('data', value => { output += value })
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) })
  const waitFor = async predicate => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) {
      if (predicate(output)) return
      if (child.exitCode !== null) throw new Error(output)
      await pause(25)
    }
    throw new Error(`Startup test timed out: ${output}`)
  }
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await done
    await rm(root, { recursive: true, force: true })
  })
  return { root, child, done, waitFor, output: () => output,
    events: async () => (await readFile(join(root, 'events'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean),
    assertStopped: async () => {
      for (const name of ['backend', 'frontend']) {
        const id = await readFile(join(root, `${name}.pid`), 'utf8').catch(() => null)
        if (id) assert.throws(() => process.kill(Number(id), 0), { code: 'ESRCH' })
      }
    },
  }
}

test('backend is ready before Vite starts; copied scripts run and TERM cleans up both servers', async t => {
  const f = await fixture(t, {}, true)
  await f.waitFor(output => output.includes('Press Ctrl+C'))
  assert.deepEqual(await f.events(), ['backend-started', 'backend-ready', 'frontend-started', 'frontend-ready', 'tailnet-served'])
  f.child.kill('SIGTERM')
  assert.equal((await f.done).code, 143)
  await f.assertStopped()
})

test('native dependency failure is caught before either server starts', async t => {
  const f = await fixture(t, { MOCK_FAIL: 'dependencies' })
  assert.equal((await f.done).code, 1)
  assert.match(f.output(), /npm ci --include=optional/)
  assert.deepEqual(await f.events(), [])
})

test('disconnected tailnet is caught before either server starts', async t => {
  const f = await fixture(t, { MOCK_FAIL: 'tailnet' }, true)
  assert.equal((await f.done).code, 1)
  assert.match(f.output(), /NeedsLogin/)
  assert.deepEqual(await f.events(), [])
})

test('backend startup failure is reported and never opens Vite', async t => {
  const f = await fixture(t, { MOCK_FAIL: 'backend' })
  assert.equal((await f.done).code, 1)
  assert.match(f.output(), /Spring Boot stopped with status 17/)
  assert.ok(!(await f.events()).includes('frontend-started'))
  await f.assertStopped()
})

test('backend readiness has a deadline and cleans up the process on timeout', async t => {
  const f = await fixture(t, { MOCK_FAIL: 'health', BLUFF_STARTUP_TIMEOUT: '1' })
  assert.equal((await f.done).code, 1)
  assert.match(f.output(), /Timed out after 1 seconds/)
  assert.ok(!(await f.events()).includes('frontend-started'))
  await f.assertStopped()
})

test('frontend startup failure stops the already-running backend', async t => {
  const f = await fixture(t, { MOCK_FAIL: 'frontend' })
  assert.equal((await f.done).code, 1)
  assert.match(f.output(), /Vite stopped with status 17/)
  await f.assertStopped()
})

test('an unexpected runtime exit stops the other server and preserves the exit status', async t => {
  const f = await fixture(t)
  await f.waitFor(output => output.includes('Press Ctrl+C'))
  await writeFile(join(f.root, 'exit-frontend'), '')
  assert.equal((await f.done).code, 23)
  await f.assertStopped()
})
