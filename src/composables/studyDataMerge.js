const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const clone = (value) => {
    if (value === undefined) return undefined
    return JSON.parse(JSON.stringify(value))
}

export function deepEqual(left, right) {
    if (Object.is(left, right)) return true
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
    }
    if (isObject(left) && isObject(right)) {
        const leftKeys = Object.keys(left)
        const rightKeys = Object.keys(right)
        return leftKeys.length === rightKeys.length &&
            leftKeys.every(key => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))
    }
    return false
}

const mergeValue = (base, local, remote) => {
    if (deepEqual(local, base)) return clone(remote)
    if (deepEqual(remote, base)) return clone(local)
    if (isObject(local) && isObject(remote)) return mergeObject(base, local, remote)
    return clone(local)
}

const mergeObject = (base, local, remote) => {
    const baseObject = isObject(base) ? base : {}
    const localObject = isObject(local) ? local : {}
    const remoteObject = isObject(remote) ? remote : {}
    const keys = new Set([...Object.keys(localObject), ...Object.keys(remoteObject)])
    const result = {}

    for (const key of keys) {
        const inLocal = Object.hasOwn(localObject, key)
        const inRemote = Object.hasOwn(remoteObject, key)
        const baseValue = baseObject[key]
        const localValue = localObject[key]
        const remoteValue = remoteObject[key]

        if (!inLocal) {
            if (inRemote && !(Object.hasOwn(baseObject, key) && deepEqual(remoteValue, baseValue))) {
                result[key] = clone(remoteValue)
            }
            continue
        }

        if (!inRemote) {
            if (!(Object.hasOwn(baseObject, key) && deepEqual(localValue, baseValue))) {
                result[key] = clone(localValue)
            }
            continue
        }

        result[key] = mergeValue(baseValue, localValue, remoteValue)
    }

    return result
}

const numberOrNull = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null

const mergeStats = (base, local, remote) => {
    if (!isObject(remote)) return clone(local)
    if (!isObject(local)) return clone(remote)

    const result = mergeObject(base, local, remote)
    const baseStats = isObject(base) ? base : {}

    for (const key of ['totalStudyTime', 'totalPomodoros']) {
        const baseValue = numberOrNull(baseStats[key])
        const localValue = numberOrNull(local[key])
        const remoteValue = numberOrNull(remote[key])
        if (baseValue === null) {
            if (localValue !== null && remoteValue !== null) result[key] = Math.max(localValue, remoteValue)
        } else if (localValue !== null && remoteValue !== null) {
            result[key] = remoteValue + Math.max(0, localValue - baseValue)
        }
    }

    const localDate = typeof local.lastDate === 'string' ? local.lastDate : ''
    const remoteDate = typeof remote.lastDate === 'string' ? remote.lastDate : ''
    const baseDate = typeof baseStats.lastDate === 'string' ? baseStats.lastDate : ''
    const latestDate = localDate > remoteDate ? localDate : remoteDate
    if (latestDate) result.lastDate = latestDate

    for (const key of ['todayStudyTime', 'todayPomodoros']) {
        const localValue = numberOrNull(local[key])
        const remoteValue = numberOrNull(remote[key])
        if (localValue === null || remoteValue === null) continue

        if (localDate === remoteDate) {
            const baseValue = numberOrNull(baseStats[key])
            result[key] = baseDate === localDate && baseValue !== null
                ? remoteValue + Math.max(0, localValue - baseValue)
                : Math.max(localValue, remoteValue)
        } else if (localDate > remoteDate) {
            result[key] = localValue
        } else {
            result[key] = remoteValue
        }
    }

    return result
}

const byId = (items) => {
    const result = new Map()
    if (Array.isArray(items)) {
        for (const item of items) {
            if (isObject(item) && (typeof item.id === 'string' || typeof item.id === 'number')) {
                result.set(item.id, item)
            }
        }
    }
    return result
}

const mergeTodos = (base, local, remote) => {
    if (!Array.isArray(remote)) return clone(local)
    if (!Array.isArray(local)) return clone(remote)

    const baseItems = byId(base)
    const localItems = byId(local)
    const remoteItems = byId(remote)
    const ids = [...localItems.keys(), ...remoteItems.keys()].filter((id, index, all) => all.indexOf(id) === index)
    const result = []

    for (const id of ids) {
        const baseItem = baseItems.get(id)
        const localItem = localItems.get(id)
        const remoteItem = remoteItems.get(id)

        if (localItem === undefined) {
            if (remoteItem !== undefined && !(baseItem !== undefined && deepEqual(remoteItem, baseItem))) {
                result.push(clone(remoteItem))
            }
            continue
        }

        if (remoteItem === undefined) {
            if (!(baseItem !== undefined && deepEqual(localItem, baseItem))) {
                result.push(clone(localItem))
            }
            continue
        }

        result.push(mergeValue(baseItem, localItem, remoteItem))
    }

    return result
}

export function mergeStudyData(base, local, remote) {
    return {
        stats: mergeStats(base?.stats, local?.stats, remote?.stats),
        todos: mergeTodos(base?.todos, local?.todos, remote?.todos),
        settings: mergeValue(base?.settings, local?.settings, remote?.settings),
    }
}
