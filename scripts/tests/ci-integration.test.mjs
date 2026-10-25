import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = new URL('../ci/integration.sh', import.meta.url).pathname
const run = (database, ...args) => spawnSync('bash', [script, ...args], {
  env: { ...process.env, QA_DATABASE: database }, encoding: 'utf8', timeout: 3000,
})

for (const database of ['', 'blufftable', 'postgres', 'production_qa', 'blufftable_qa; DROP DATABASE x']) {
  test(`integration refuses non-disposable target ${JSON.stringify(database)}`, () => {
    const result = run(database)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /explicit disposable/)
  })
}

test('integration refuses a missing server artifact before connecting to PostgreSQL', () => {
  const result = run('blufftable_testqa', '/tmp/bluff-ci-deliberately-missing-server.jar')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Build the server jar first/)
})
