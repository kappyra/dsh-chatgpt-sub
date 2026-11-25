// fork 安全约束：fork 构建不得被上游 npm 发版悄悄换掉自己的文件。
//
// 背景：本仓库是上游 dsh-chatgpt-sub 的 fork，包名与上游相同。插件的自更新检查的是
// npm 上「同名包」的最新版；若照常启用，上游一发版就会把本 fork 的 lib/ 换成上游代码，
// 用户批准的代码被未审阅的代码替换。因此 fork 构建默认关闭自更新，只有显式
// DSH_CHATGPT_SELF_UPDATE=on 才打开。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isForkBuild } from '../src/version.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const host = readFileSync(join(root, 'src', 'host.js'), 'utf8')
const client = readFileSync(join(root, 'src', 'client-bundle.js'), 'utf8')

assert.equal(pkg.dshFork, true, 'this repository must declare dshFork in package.json')
assert.equal(isForkBuild(), true, 'isForkBuild() reads the marker from package.json')

// 门控必须按 fork 分支走：默认关闭，=on 才开。
assert.match(
  host,
  /const SELF_UPDATE_ENABLED = \(isForkBuild\(\)\s*\n\s*\? process\.env\.DSH_CHATGPT_SELF_UPDATE === 'on'/,
  'fork builds must require an explicit DSH_CHATGPT_SELF_UPDATE=on',
)
assert.match(host, /forkBuild: isForkBuild\(\)/, 'the update state must tell the client this is a fork build')
assert.match(client, /ui\.updateDisabledForkWhy/, 'the disabled reason must be fork-specific, not the source-install one')

// 上游的发版/自动合并流水线在 fork 里既无密钥也不该跑。
for (const retired of ['auto-merge-own.yml', 'publish-npm.yml', 'release-please.yml', 'verify-npm-release.yml']) {
  let exists = true
  try { readFileSync(join(root, '.github', 'workflows', retired)) } catch { exists = false }
  assert.equal(exists, false, retired + ' must not run in this fork')
}

console.log('fork build safety (self-update off, upstream automation removed): PASS')
