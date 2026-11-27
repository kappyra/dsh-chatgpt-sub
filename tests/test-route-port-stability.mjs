// dsh-chatgpt-sub — 路由端口稳定 + 旧记录 scopes 补齐
//
// 背景（2026-11-27）：账号显示已连接，但每个请求都失败。两处独立缺陷：
//
//   1) 同步在 `hasPlanUsage(active.scopes)` 处提前返回。旧绑定记录里 scopes 是
//      空数组，于是「这次登录不允许使用套餐额度」——可 access token 自己的 scope
//      声明里明明有 chatgpt.tokens.use.direct。同步从此不再调用 ensureRoute，
//      路由永远停在旧端口。
//   2) 代理每次启动都拿随机端口。路由写不进去时，DSH 还连着上一个进程的端口，
//      请求全部 ECONNREFUSED，而代理其实在另一个端口上好好活着。
//
// 这个用例锁住三件事：
//   A. 令牌能提供 scopes 时，空记录不再被误判成「没有套餐权限」；
//   B. 记录里存了 scopes 时以记录为准（不被令牌覆盖）；
//   C. 代理优先绑定指定端口，端口被占才退回随机端口，并如实回调关闭端口。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { startResponsesProxy } from '../src/proxy.js'
import { hasPlanUsage, scopesFromAccessToken, PLAN_USAGE_SCOPE } from '../src/siwc.js'
import { parseSession } from '../src/host.js'

// 本机地址一律直连：环境里的代理变量不能影响 127.0.0.1 的往返。
process.env.NO_PROXY = '127.0.0.1,localhost'
process.env.no_proxy = '127.0.0.1,localhost'

// 造一个只有 scope 声明有意义的 JWT：本插件只解 payload，不验签。
function fakeJwt(claims) {
  const enc = function (value) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
  return enc({ alg: 'none', typ: 'JWT' }) + '.' + enc(claims) + '.' + 'sig'
}

const token = fakeJwt({ scope: 'openid profile email ' + PLAN_USAGE_SCOPE, exp: 9999999999 })

// ---------- A/B: scopes 来源 ----------
assert.deepEqual(scopesFromAccessToken(token).includes(PLAN_USAGE_SCOPE), true, 'token scope claim must be readable')
assert.deepEqual(scopesFromAccessToken('not-a-jwt'), [], 'malformed token yields no scopes')
assert.deepEqual(scopesFromAccessToken(''), [], 'empty token yields no scopes')

const baseRecord = { kind: 'grant', payload: { version: 1, clientId: 'client', accessToken: token, expiresAt: Date.now() + 60000 } }

const emptyScopes = parseSession({ kind: 'grant', payload: { ...baseRecord.payload, scopes: [] } })
assert.deepEqual(emptyScopes.scopes.includes(PLAN_USAGE_SCOPE), true, 'empty stored scopes fall back to the token claim')
assert.deepEqual(hasPlanUsage(emptyScopes.scopes), true, 'a usable login must not be reported as plan-less')

const missingScopes = parseSession(baseRecord)
assert.deepEqual(hasPlanUsage(missingScopes.scopes), true, 'absent scopes field also falls back to the token claim')

const storedScopes = parseSession({ kind: 'grant', payload: { ...baseRecord.payload, scopes: ['keep.me'] } })
assert.deepEqual(storedScopes.scopes, ['keep.me'], 'stored scopes win when present')

const bogusScopes = parseSession({ kind: 'grant', payload: { ...baseRecord.payload, scopes: 'nope' } })
assert.deepEqual(hasPlanUsage(bogusScopes.scopes), true, 'non-array scopes are treated as absent')

console.log('A/B scopes fallback: PASS')

// ---------- C: 端口优先 + 占用回退 ----------
const prefix = []
const proxyLogger = function (line) { prefix.push(line) }

// 先占一个端口，模拟「路由里的端口被别的程序占了」。
const squatter = createServer(function (_req, res) { res.end('occupied') })
await new Promise(function (resolve, reject) {
  squatter.once('error', reject)
  squatter.listen(0, '127.0.0.1', resolve)
})
const busyPort = squatter.address().port

const grabbed = []
let closedWith = null
const freed = await startResponsesProxy({
  getAccessToken: function () { return ['token'] },
  port: 0,
  log: proxyLogger,
  onClose: function (port) { closedWith = port },
})
grabbed.push(freed)
assert.equal(freed.port > 0, true, 'a free port must be bound')
assert.equal(freed.baseUrl, 'http://127.0.0.1:' + freed.port + '/v1', 'baseUrl must name the bound port')

// 关掉它，拿回同一个端口，验证「首选端口优先」。
const freePort = freed.port
freed.close()
await new Promise(function (resolve) { setTimeout(resolve, 100) })
assert.equal(closedWith, freePort, 'onClose must report the bound port')

const onPreferred = await startResponsesProxy({ getAccessToken: function () { return ['token'] }, port: freePort, log: proxyLogger })
grabbed.push(onPreferred)
assert.equal(onPreferred.port, freePort, 'the requested port must be honoured when free')

// 端口被占时退回随机端口，而不是启动失败。
const fallback = await startResponsesProxy({ getAccessToken: function () { return ['token'] }, port: busyPort, log: proxyLogger })
grabbed.push(fallback)
assert.notEqual(fallback.port, busyPort, 'a busy preferred port must fall back to a free one')
assert.equal(fallback.port > 0, true, 'fallback must still bind a port')
assert.equal(prefix.some(function (line) { return line.includes('busy') }), true, 'the fallback must be reported to the log')

for (const handle of grabbed) handle.close()
await new Promise(function (resolve) { squatter.close(resolve) })

console.log('C proxy port stability: PASS')
console.log('\nroute port stability + scopes fallback: PASS')
