import { ref } from 'vue'
import { useStudyAuth } from './useStudyAuth.js'
import { deepEqual, mergeStudyData } from './studyDataMerge.js'

const MIKUMOD_API = import.meta.env.VITE_MIKUMOD_API_URL

const syncStatus = ref('idle')
const lastSyncTime = ref(null)

const clone = (value) => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))

const isRevision = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function useStudySync({ onDataMerged } = {}) {
    const { userId, isLoggedIn, getAuthHeaders, markSessionExpired } = useStudyAuth()

    let syncUserId = ''
    let baseline = null
    let dataQueue = Promise.resolve()
    let calendarQueue = Promise.resolve()

    const getNoStoreHeaders = () => ({
        ...getAuthHeaders(),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
    })

    const ensureUserState = () => {
        const currentUserId = userId.value
        if (syncUserId === currentUserId) return currentUserId
        syncUserId = currentUserId
        baseline = null
        dataQueue = Promise.resolve()
        calendarQueue = Promise.resolve()
        return currentUserId
    }

    const requireSnapshot = (data) => {
        if (!data) return null
        if (!isRevision(data.revision)) throw new Error('远端数据缺少版本号')
        return {
            stats: data.stats ?? {},
            todos: Array.isArray(data.todos) ? data.todos : [],
            settings: data.settings ?? {},
            revision: data.revision,
            updated_at: data.updated_at,
        }
    }

    const fetchRemoteData = async () => {
        if (!isLoggedIn.value) return null
        const currentUserId = ensureUserState()

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/data`, {
                headers: getNoStoreHeaders(),
                cache: 'no-store',
            })

            if (res.status === 401) {
                markSessionExpired()
                throw new Error('登录状态已失效')
            }
            if (!res.ok) throw new Error(`远端数据读取失败: ${res.status}`)

            const result = await res.json()
            const data = requireSnapshot(result.data)
            if (syncUserId === currentUserId) {
                baseline = { data: data ? clone(data) : null, revision: data?.revision ?? 0 }
            }
            return data
        } catch (error) {
            console.error('Fetch remote data error:', error)
            throw error
        }
    }

    const saveWithRevision = async (initialSnapshot, headers, currentUserId, initialBase) => {
        let snapshot = clone(initialSnapshot)
        let base = initialBase
        let revision = base?.revision ?? 0

        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch(`${MIKUMOD_API}/api/study/data`, {
                method: 'PUT',
                headers,
                cache: 'no-store',
                body: JSON.stringify({ ...snapshot, expectedRevision: revision }),
            })

            if (res.status === 401) {
                markSessionExpired()
                throw new Error('登录状态已失效')
            }

            if (res.status === 409) {
                const conflict = await res.json().catch(() => null)
                const remote = requireSnapshot(conflict?.data)
                if (!remote) throw new Error('同步冲突缺少远端数据')

                snapshot = mergeStudyData(base?.data, snapshot, remote)
                if (onDataMerged) onDataMerged(clone(snapshot))
                base = remote
                revision = remote.revision
                if (syncUserId === currentUserId) {
                    baseline = { data: clone(remote), revision: remote.revision }
                }
                continue
            }

            if (!res.ok) throw new Error(`远端数据保存失败: ${res.status}`)

            const result = await res.json()
            const saved = requireSnapshot(result.data)
            if (!saved || saved.revision <= revision) throw new Error('远端数据保存结果异常')
            if (syncUserId === currentUserId) {
                baseline = { data: clone(saved), revision: saved.revision }
            }
            return true
        }

        throw new Error('同步冲突重试次数过多')
    }

    const pushData = (stats, todos, settings) => {
        if (!isLoggedIn.value) return Promise.resolve(false)
        const currentUserId = ensureUserState()
        if (!baseline || baseline.revision === null) {
            syncStatus.value = 'error'
            return Promise.resolve(false)
        }

        const snapshot = {
            stats: clone(stats),
            todos: clone(todos),
            settings: clone(settings),
        }
        const headers = getNoStoreHeaders()

        const run = async () => {
            if (syncUserId !== currentUserId || !isLoggedIn.value || !baseline) {
                return false
            }
            try {
                syncStatus.value = 'syncing'
                const saved = await saveWithRevision(snapshot, headers, currentUserId, clone(baseline))
                syncStatus.value = saved ? 'done' : 'error'
                if (saved) lastSyncTime.value = new Date()
                return saved
            } catch (error) {
                console.error('Push data error:', error)
                syncStatus.value = 'error'
                return false
            }
        }

        dataQueue = dataQueue.then(run, run)
        return dataQueue
    }

    const fetchCalendar = async () => {
        if (!isLoggedIn.value) return null
        ensureUserState()

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/calendar`, {
                headers: getNoStoreHeaders(),
                cache: 'no-store',
            })

            if (res.status === 401) {
                markSessionExpired()
                throw new Error('登录状态已失效')
            }
            if (!res.ok) throw new Error(`日历读取失败: ${res.status}`)

            const result = await res.json()
            return result.data ?? { dailyLog: {}, plans: {} }
        } catch (error) {
            console.error('Fetch calendar error:', error)
            throw error
        }
    }

    const pushCalendar = (dailyLog, plans) => {
        if (!isLoggedIn.value) return Promise.resolve(false)
        ensureUserState()
        const body = JSON.stringify({ dailyLog, plans })
        const headers = getNoStoreHeaders()

        const run = async () => {
            try {
                const res = await fetch(`${MIKUMOD_API}/api/study/calendar`, {
                    method: 'PUT',
                    headers,
                    cache: 'no-store',
                    body,
                })

                if (res.status === 401) {
                    markSessionExpired()
                    return false
                }
                if (!res.ok) throw new Error(`日历保存失败: ${res.status}`)
                return true
            } catch (error) {
                console.error('Push calendar error:', error)
                return false
            }
        }

        calendarQueue = calendarQueue.then(run, run)
        return calendarQueue
    }

    const pushAll = async (stats, todos, settings, calendarData) => {
        if (!isLoggedIn.value) return false

        syncStatus.value = 'syncing'
        const [dataOk, calOk] = await Promise.all([
            pushData(stats, todos, settings),
            calendarData ? pushCalendar(calendarData.dailyLog, calendarData.plans) : Promise.resolve(true),
        ])

        syncStatus.value = (dataOk && calOk) ? 'done' : 'error'
        if (dataOk && calOk) lastSyncTime.value = new Date()
        return dataOk && calOk
    }

    const syncOnLogin = async (localStats, localTodos, localSettings) => {
        const remoteData = await fetchRemoteData()

        if (!remoteData) {
            await pushData(localStats, localTodos, localSettings)
            return { autoMerged: false }
        }

        const remoteStats = remoteData.stats || {}
        const remoteTodos = Array.isArray(remoteData.todos) ? remoteData.todos : []
        const localHasData = localStats.totalStudyTime > 0 || localStats.totalPomodoros > 0 || (Array.isArray(localTodos) && localTodos.length > 0)
        const remoteHasData = remoteStats.totalStudyTime > 0 || remoteStats.totalPomodoros > 0 || remoteTodos.length > 0

        if (!localHasData && !remoteHasData) {
            return { autoMerged: false }
        }

        if (localHasData && !remoteHasData) {
            await pushData(localStats, localTodos, localSettings)
            return { autoMerged: false }
        }

        if (!localHasData && remoteHasData) {
            return { autoMerged: true, applyRemote: remoteData }
        }

        const localSnapshot = {
            stats: localStats,
            todos: localTodos,
            settings: localSettings,
        }
        const merged = mergeStudyData(undefined, localSnapshot, remoteData)
        const changed = !deepEqual(
            { stats: merged.stats, todos: merged.todos, settings: merged.settings },
            { stats: remoteData.stats, todos: remoteData.todos, settings: remoteData.settings },
        )
        if (changed) {
            await pushData(merged.stats, merged.todos, merged.settings)
        }
        return { autoMerged: true, applyRemote: merged }
    }

    return {
        syncStatus,
        lastSyncTime,
        fetchRemoteData,
        pushData,
        pushCalendar,
        fetchCalendar,
        pushAll,
        syncOnLogin,
    }
}
