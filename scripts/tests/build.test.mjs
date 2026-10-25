import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const scripts = new URL('../', import.meta.url)

async function fixture(t, fail = '') {
  const root = await mkdtemp(join(tmpdir(), 'bluff-build-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'scripts/lib'), { recursive: true })
  await mkdir(join(root, 'frontend'))
  await mkdir(join(root, 'bin'))
  await cp(new URL('build.sh', scripts), join(root, 'scripts/build.sh'))
  await cp(new URL('lib/common.sh', scripts), join(root, 'scripts/lib/common.sh'))
  const recorder = '#!/bin/bash\nprintf "%s\\n" "$*" >> "$BUILD_TEST_ROOT/events"\n'
  await writeFile(join(root, 'gradlew'), recorder + (fail === 'backend' ? 'exit 17\n' : ''), { mode: 0o644 })
  await writeFile(join(root, 'bin/java'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  await writeFile(join(root, 'bin/npm'), recorder + 'if [[ "$*" == *" ci "* && "$BUILD_TEST_FAIL" == dependencies ]]; then exit 18; fi\n', { mode: 0o755 })
  const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, BUILD_TEST_ROOT: root, BUILD_TEST_FAIL: fail }
  return {
    run: (...args) => spawnSync('bash', [join(root, 'scripts/build.sh'), ...args], { env, cwd: tmpdir(), encoding: 'utf8', timeout: 3000 }),
    events: async () => (await readFile(join(root, 'events'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean),
  }
}

test('one build entry point builds the backend and locked frontend without a database', async t => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await f.events(), ['--console=plain :server:bootJar', '--prefix frontend ci --include=optional', '--prefix frontend run build'])
  assert.match(result.stdout, /server\/build\/libs\/bluff-table.jar and frontend\/dist/)
})
test('failed backend build stops before frontend installation', async t => {
  const f = await fixture(t, 'backend')
  assert.equal(f.run().status, 17)
  assert.deepEqual(await f.events(), ['--console=plain :server:bootJar'])
})
test('failed dependency installation prevents a frontend build', async t => {
  const f = await fixture(t, 'dependencies')
  assert.equal(f.run().status, 18)
  assert.equal((await f.events()).length, 2)
})
test('build help and invalid arguments do not run either build', async t => {
  const f = await fixture(t)
  assert.equal(f.run('--help').status, 0)
  assert.equal(f.run('--unknown').status, 2)
  assert.equal(f.run('extra', 'arguments').status, 2)
  assert.deepEqual(await f.events(), [])
})
