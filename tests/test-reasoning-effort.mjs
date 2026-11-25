// 推理档位（reasoning effort）：能力表、路由映射与默认档位选择的单元级回归。
// 这些函数决定 DSH 模型菜单里出现哪些档位，以及默认档位能不能安全地写进路由。
import assert from 'node:assert/strict'
import {
  EFFORT_LEVELS, applicableDefaultEffort, effortLevelsForModel, offeredEffortLevels, reasoningEffortsForModel,
  validEffortMap,
} from '../src/host.js'

assert.deepEqual(EFFORT_LEVELS, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], 'the documented effort vocabulary')

// 官方模型页明确写出的家族（2026-11）。
assert.deepEqual(effortLevelsForModel('gpt-6.1-sol'), ['low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-6.1-terra'), ['none', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-6-astra'), ['low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-6-luna'), ['none', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-6-sol'), ['none', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-6.2-sol'), ['low', 'medium', 'high'], 'undocumented levels stay out of 6.2')
assert.deepEqual(effortLevelsForModel('gpt-5.6-sol'), ['none', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-5.6-terra'), ['none', 'low', 'medium', 'high', 'xhigh', 'max'])
assert.deepEqual(effortLevelsForModel('gpt-5.5'), ['none', 'low', 'medium', 'high', 'xhigh'])
assert.deepEqual(effortLevelsForModel('gpt-5.3-codex'), ['low', 'medium', 'high', 'xhigh'])
assert.deepEqual(effortLevelsForModel('gpt-5-codex'), ['minimal', 'low', 'medium', 'high'])
assert.deepEqual(effortLevelsForModel('o3'), ['low', 'medium', 'high'])

// 非推理模型不给档位；陌生推理模型退回三档通用值。
assert.equal(effortLevelsForModel('gpt-4o'), null)
assert.equal(effortLevelsForModel('gpt-3.5-turbo'), null)
assert.equal(effortLevelsForModel('text-embedding-3-large'), null)
assert.deepEqual(effortLevelsForModel('gpt-9-nova'), ['low', 'medium', 'high'])

// 路由配置里的映射：off 允许省略 reasoning，其余档位名原样作为线上取值。
assert.deepEqual(reasoningEffortsForModel('gpt-6.1-sol'), {
  off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
})
assert.equal(reasoningEffortsForModel('gpt-4o'), null)

const catalog = [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6.2-sol' }]
assert.deepEqual(offeredEffortLevels(catalog), ['low', 'medium', 'high'], 'only the intersection is offered')
assert.deepEqual(offeredEffortLevels([{ id: 'gpt-4o' }]), [], 'non-reasoning routes offer nothing')
assert.equal(applicableDefaultEffort('high', catalog), 'high')
assert.equal(applicableDefaultEffort('max', catalog), null, 'max is not applicable to gpt-6.2-sol')
assert.equal(applicableDefaultEffort('none', catalog), null, 'none is not applicable to gpt-6.1-sol')
assert.equal(applicableDefaultEffort('auto', catalog), null, 'auto writes no route default')
assert.equal(applicableDefaultEffort('high', []), null, 'no models means nothing to apply')
assert.equal(applicableDefaultEffort('off', catalog), null, 'off is a chat-level choice, not a route default')

// 设置页手工编辑过的档位：合法才沿用，非法一律退回能力表。
assert.deepEqual(validEffortMap({ off: null, low: 'low', high: 'high' }), { off: null, low: 'low', high: 'high' })
assert.equal(validEffortMap({ off: null }), null, 'off alone offers no thinking level')
assert.equal(validEffortMap({ off: null, low: '' }), null, 'empty wire value is invalid')
assert.equal(validEffortMap({ off: null, ultra: 'ultra' }), null, 'unknown level name is rejected')
assert.deepEqual(validEffortMap({ low: 'low' }), { low: 'low' }, 'off is optional')
assert.equal(validEffortMap(false), null)
assert.equal(validEffortMap([]), null)

console.log('reasoning effort capability + defaults: PASS')
