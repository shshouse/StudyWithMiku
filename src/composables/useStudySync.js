import { ref } from 'vue'
import { useStudyAuth } from './useStudyAuth.js'

const MIKUMOD_API = import.meta.env.VITE_MIKUMOD_URL || 'https://mikumod.com'

const syncStatus = ref('idle')
const lastSyncTime = ref(null)

export function useStudySync() {
    const { isLoggedIn, getAuthHeaders, logout } = useStudyAuth()

    const getNoStoreHeaders = () => ({
        ...getAuthHeaders(),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
    })


    const fetchRemoteData = async () => {
        if (!isLoggedIn.value) return null

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/data`, {
                headers: getNoStoreHeaders(),
                cache: 'no-store',
            })

            if (res.status === 401) {
                logout()
                return null
            }

            if (!res.ok) return null

            const result = await res.json()
            return result.data
        } catch (error) {
            console.error('Fetch remote data error:', error)
            return null
        }
    }


    const pushData = async (stats, todos, settings) => {
        if (!isLoggedIn.value) return false

        try {
            syncStatus.value = 'syncing'
            const res = await fetch(`${MIKUMOD_API}/api/study/data`, {
                method: 'PUT',
                headers: getNoStoreHeaders(),
                cache: 'no-store',
                body: JSON.stringify({ stats, todos, settings }),
            })

            if (res.status === 401) {
                logout()
                syncStatus.value = 'error'
                return false
            }

            if (!res.ok) {
                syncStatus.value = 'error'
                return false
            }

            syncStatus.value = 'done'
            lastSyncTime.value = new Date()
            return true
        } catch (error) {
            console.error('Push data error:', error)
            syncStatus.value = 'error'
            return false
        }
    }

    // === 日历同步 ===

    const fetchCalendar = async () => {
        if (!isLoggedIn.value) return null

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/calendar`, {
                headers: getNoStoreHeaders(),
                cache: 'no-store',
            })

            if (res.status === 401) { logout(); return null }
            if (!res.ok) return null

            const result = await res.json()
            return result.data
        } catch (error) {
            console.error('Fetch calendar error:', error)
            return null
        }
    }

    const pushCalendar = async (dailyLog, plans) => {
        if (!isLoggedIn.value) return false

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/calendar`, {
                method: 'PUT',
                headers: getNoStoreHeaders(),
                cache: 'no-store',
                body: JSON.stringify({ dailyLog, plans }),
            })

            if (res.status === 401) { logout(); return false }
            if (!res.ok) return false
            return true
        } catch (error) {
            console.error('Push calendar error:', error)
            return false
        }
    }

    const pushAll = async (stats, todos, settings, calendarData) => {
        if (!isLoggedIn.value) return false

        syncStatus.value = 'syncing'
        try {
            const [dataOk, calOk] = await Promise.all([
                pushData(stats, todos, settings),
                calendarData ? pushCalendar(calendarData.dailyLog, calendarData.plans) : Promise.resolve(true),
            ])

            syncStatus.value = (dataOk && calOk) ? 'done' : 'error'
            if (dataOk && calOk) lastSyncTime.value = new Date()
            return dataOk && calOk
        } catch {
            syncStatus.value = 'error'
            return false
        }
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

        const statsMatch =
            localStats.totalStudyTime === remoteStats.totalStudyTime &&
            localStats.totalPomodoros === remoteStats.totalPomodoros

        if (statsMatch && (!Array.isArray(localTodos) || localTodos.length === 0) && remoteTodos.length > 0) {
            return { autoMerged: true, applyRemote: remoteData }
        }

        if (statsMatch) {
            await pushData(localStats, localTodos, localSettings)
            return { autoMerged: false }
        }

        const localScore = (localStats.totalStudyTime || 0) * 1000 + (localStats.totalPomodoros || 0)
        const remoteScore = (remoteStats.totalStudyTime || 0) * 1000 + (remoteStats.totalPomodoros || 0)

        if (remoteScore > localScore) {
            return { autoMerged: true, applyRemote: remoteData }
        }
        await pushData(localStats, localTodos, localSettings)
        return { autoMerged: true }
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
