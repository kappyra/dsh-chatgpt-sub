// 验收脚本（只读）：把你的 bind flag **复制**到临时目录，用桩替换凭据与设置，
// 在独立进程里跑构建好的 host，打印它真正会写进 llm-pi-ai 的 chatgpt-siwc 路由。
// 只输出模型 id 与档位，不打印令牌、邮箱或账号 id；不碰正在运行的 DSH。
// 用法：node scripts/dry-run-effort.mjs
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const realBind = join(process.env.HOME, '.dsh', 'dsh-chatgpt-sub', 'siwc-bind.json')
const temp = mkdtempSync(join(tmpdir(), 'dsh-effort-dryrun-'))
const bindCopy = join(temp, 'bind.json')
copyFileSync(realBind, bindCopy)

process.env.DSH_CHATGPT_DATA_DIR = temp
process.env.DSH_CHATGPT_BIND_FILE = bindCopy
process.env.DSH_CHATGPT_SELF_UPDATE = 'off'
process.env.DSH_CHATGPT_CODEX_QUOTA_KEEP = 'off'
process.env.DSH_CHATGPT_AUTH = join(temp, 'codex-auth.json')

const flag = JSON.parse(readFileSync(bindCopy, 'utf8'))
const session = {
  kind: 'grant',
  payload: {
    version: 1, clientId: 'dry-run', accessToken: 'dry-run-token',
    expiresAt: Date.now() + 3600_000,
    scopes: ['chatgpt.tokens.use.direct', 'openid'],
    savedAt: new Date().toISOString(),
  },
}

const logs = []
const realLog = console.log
console.log = (...args) => { logs.push(args.join(' ')); realLog(...args) }
process.on('unhandledRejection', (error) => { realLog('UNHANDLED', error && (error.stack || error.message || error)) })
process.on('uncaughtException', (error) => { realLog('UNCAUGHT', error && (error.stack || error.message || error)) })
const sections = { 'llm-pi-ai': { providers: {} } }
let route = null
const records = new Map([['chatgpt-sub/session', session]])
const credentials = {
  async readRecord(key) { return records.get(key) },
  async modifyRecord(key, mutate) {
    const next = await mutate(records.get(key))
    if (next !== undefined) records.set(key, next)
    return records.get(key)
  },
  async deleteRecord(key) { records.delete(key) },
  async set() {},
  async unset() {},
  async resolve() { return { value: 'dry-run-token', source: 'dry-run' } },
}
const settings = {
  describe() { return Object.entries(sections).map(([ns, value]) => ({ ns, value })) },
  async mutate(ns, operations) {
    for (const operation of operations) {
      if (operation.op === 'set') sections[ns].providers[operation.path[1]] = JSON.parse(JSON.stringify(operation.value))
      else delete sections[ns].providers[operation.path[1]]
    }
  },
}

const { default: plugin, offeredEffortLevels } = await import(
  new URL('file://' + join(process.env.HOME, '.dsh/profiles/desktop/node_modules/dsh-chatgpt-sub/lib/index.js')).href
)
plugin.apply({
  shell: { run: async () => ({ exitCode: 0 }) },
  credentials,
  settings,
  get() { return undefined },
  interval() {},
  effect(fn) { return typeof fn === 'function' ? fn() : undefined },
  inject(_names, fn) { fn({ connection: { requestRejection() {} }, effect: (inner) => inner(), webServer: { register() {} } }) },
})

await new Promise((resolve) => setTimeout(resolve, 2500))
realLog('captured logs:', logs.length > 0 ? logs.join(' | ') : '(none)')
const routeConfig = sections['llm-pi-ai'].providers['chatgpt-siwc']
if (!routeConfig) {
  console.log('NO ROUTE WRITTEN — sync failed')
  process.exit(1)
}
console.log('models in bind flag:', flag.models.length)
console.log('route reasoning default:', JSON.stringify(routeConfig.reasoning))
for (const model of routeConfig.models) {
  console.log(model.id.padEnd(16), '→', JSON.stringify(model.reasoningEfforts))
}
console.log('common offered levels:', JSON.stringify(offeredEffortLevels(flag.models)))
process.exit(0)
