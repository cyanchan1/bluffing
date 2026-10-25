import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const library = new URL('../lib/common.sh', import.meta.url).pathname
const run = (command, ...args) => spawnSync('bash', ['-c', 'set -euo pipefail; source "$1"; shift; ' + command, 'test', library, ...args], {
  encoding: 'utf8', timeout: 3000,
})

for (const port of ['1', '80', '00080', '65535']) {
  test(`shared port validation accepts ${port}`, () => assert.equal(run('validate_port "$1" PORT', port).status, 0))
}
for (const port of ['', '0', '65536', '-1', 'abc', '80; exit 0']) {
  test(`shared port validation rejects ${JSON.stringify(port)}`, () => {
    const result = run('validate_port "$1" PORT', port)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /PORT must be a number/)
  })
}
test('shared command checks identify the missing dependency', () => {
  const result = run('require_commands bash bluff_deliberately_missing_dependency')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Required command not found: bluff_deliberately_missing_dependency/)
})
test('project root resolution is independent of the caller working directory', () => {
  const result = run('printf "%s" "$project_root"')
  assert.equal(result.status, 0)
  assert.equal(result.stdout, new URL('../../', import.meta.url).pathname.replace(/\/$/, ''))
})
