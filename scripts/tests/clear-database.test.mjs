import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = new URL('../clear-database.sh', import.meta.url).pathname
const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 3000 })

test('reset help and dry-run never connect or create a backup', () => {
  assert.equal(run('--help').status, 0)
  const result = run('--local', '--database', 'blufftable_ciqa', '--host', 'invalid.example', '--dry-run')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /No connection or changes made/)
})

for (const name of ['postgres', 'template0', 'template1', 'bad-name', 'db; DROP DATABASE x']) {
  test(`reset rejects unsafe database name ${JSON.stringify(name)} before connecting`, () => {
    assert.equal(run('--local', '--database', name, '--dry-run').status, 1)
  })
}

for (const args of [[], ['--local', '--container', 'db'], ['--container', '../db'], ['--local', '--port', '0'],
  ['--local', '--port', '65536'], ['--local', '--port', 'text'], ['--local', '--runtime', 'sh'], ['--database']]) {
  test(`reset rejects invalid arguments ${JSON.stringify(args)}`, () => {
    assert.notEqual(run(...args, '--dry-run').status, 0)
  })
}
