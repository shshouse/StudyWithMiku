import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeStudyData } from './studyDataMerge.js'

const stats = (totalStudyTime, totalPomodoros, extra = {}) => ({
    totalStudyTime,
    totalPomodoros,
    todayStudyTime: totalStudyTime,
    todayPomodoros: totalPomodoros,
    lastDate: '2026-11-08',
    ...extra,
})

test('只改一侧的字段直接采用改动侧', () => {
    const base = { stats: stats(100, 2), todos: [{ id: 1, text: 'a', completed: false }], settings: { theme: 'dark' } }
    const local = { ...base, settings: { theme: 'light' } }
    const remote = { ...base, todos: [{ id: 1, text: 'b', completed: false }] }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.settings, { theme: 'light' })
    assert.deepEqual(merged.todos, [{ id: 1, text: 'b', completed: false }])
})

test('双端累计统计都增长时合并增量而不是覆盖', () => {
    const base = { stats: stats(100, 2) }
    const local = { stats: stats(160, 4) }
    const remote = { stats: stats(130, 5) }

    const merged = mergeStudyData(base, local, remote)

    assert.equal(merged.stats.totalStudyTime, 190)
    assert.equal(merged.stats.totalPomodoros, 7)
})

test('没有基线时不会把两端总量重复相加', () => {
    const merged = mergeStudyData(undefined, { stats: stats(100, 2) }, { stats: stats(80, 3) })

    assert.equal(merged.stats.totalStudyTime, 100)
    assert.equal(merged.stats.totalPomodoros, 3)
})

test('待办按 ID 三方合并，不同字段的并发修改都保留', () => {
    const base = { todos: [{ id: 1, text: 'a', completed: false, pinned: false }] }
    const local = { todos: [{ id: 1, text: 'a', completed: true, pinned: false }] }
    const remote = { todos: [{ id: 1, text: 'b', completed: false, pinned: false }] }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.todos, [{ id: 1, text: 'b', completed: true, pinned: false }])
})

test('本地删除未被远端修改的待办时保留删除', () => {
    const base = { todos: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }] }
    const local = { todos: [{ id: 2, text: 'b' }] }
    const remote = { todos: [{ id: 1, text: 'a' }, { id: 2, text: 'b' }] }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.todos, [{ id: 2, text: 'b' }])
})

test('本地删除但远端修改同一条待办时保留远端数据', () => {
    const base = { todos: [{ id: 1, text: 'a' }] }
    const local = { todos: [] }
    const remote = { todos: [{ id: 1, text: 'remote edit' }] }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.todos, [{ id: 1, text: 'remote edit' }])
})

test('两级设置对象按字段合并', () => {
    const base = { settings: { timer: { focus: 25, break: 5 }, volume: 10 } }
    const local = { settings: { timer: { focus: 30, break: 5 }, volume: 10 } }
    const remote = { settings: { timer: { focus: 25, break: 10 }, volume: 20 } }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.settings, { timer: { focus: 30, break: 10 }, volume: 20 })
})

test('远端新增待办排在本地列表之后', () => {
    const base = { todos: [] }
    const local = { todos: [{ id: 'local', text: 'a' }] }
    const remote = { todos: [{ id: 'remote', text: 'b' }] }

    const merged = mergeStudyData(base, local, remote)

    assert.deepEqual(merged.todos.map(item => item.id), ['local', 'remote'])
})

test('传入响应式对象（Proxy）不会抛错', () => {
    const reactive = value => new Proxy(value, {
        get: (target, key) => target[key],
        ownKeys: target => Reflect.ownKeys(target),
        getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key),
    })

    const local = reactive({ stats: stats(100, 2), todos: [{ id: 1, text: 'a' }], settings: { theme: 'dark' } })
    const remote = reactive({ stats: stats(50, 1), todos: [], settings: {} })

    const merged = mergeStudyData(undefined, local, remote)

    assert.equal(merged.stats.totalStudyTime, 100)
    assert.deepEqual(merged.todos.map(item => item.id), [1])
})

test('旧版 toDateString 日期与新版 YYYY-MM-DD 能视为同一天合并今日增量', () => {
    const base = { stats: stats(100, 2) }
    const local = { stats: stats(160, 4, { lastDate: 'Sat Nov 08 2026' }) }
    const remote = { stats: stats(130, 5, { lastDate: '2026-11-08' }) }

    const merged = mergeStudyData(base, local, remote)

    assert.equal(merged.stats.lastDate, '2026-11-08')
    assert.equal(merged.stats.todayStudyTime, 190)
    assert.equal(merged.stats.todayPomodoros, 7)
})

test('较新的本地日期决定今日数值，不受格式影响', () => {
    const local = { stats: stats(100, 2, { lastDate: '2026-11-09' }) }
    const remote = { stats: stats(80, 3, { lastDate: 'Sun Nov 08 2026' }) }

    const merged = mergeStudyData(undefined, local, remote)

    assert.equal(merged.stats.lastDate, '2026-11-09')
    assert.equal(merged.stats.todayStudyTime, 100)
})

test('无法解析的日期不会让合并抛错', () => {
    const merged = mergeStudyData(undefined, { stats: stats(10, 1, { lastDate: 'garbage' }) }, { stats: stats(20, 2) })

    assert.equal(merged.stats.totalStudyTime, 20)
})
