import { ref } from 'vue'
import { useStudyAuth } from './useStudyAuth.js'

const MIKUMOD_API = import.meta.env.VITE_MIKUMOD_URL || 'https://mikumod.com'

const syncStatus = ref('idle')
const lastSyncTime = ref(null)
const conflictData = ref(null)

export function useStudySync() {
    const { token, isLoggedIn, getAuthHeaders, logout } = useStudyAuth()


    const fetchRemoteData = async () => {
        if (!isLoggedIn.value) return null

        try {
            const res = await fetch(`${MIKUMOD_API}/api/study/data`, {
                headers: getAuthHeaders(),
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
                headers: getAuthHeaders(),
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

    const syncOnLogin = async (localStats, localTodos, localSettings) => {
        const remoteData = await fetchRemoteData()

        if (!remoteData) {
            await pushData(localStats, localTodos, localSettings)
            return { needResolve: false }
        }

        const remoteStats = remoteData.stats || {}
        const localHasData = localStats.totalStudyTime > 0 || localStats.totalPomodoros > 0
        const remoteHasData = remoteStats.totalStudyTime > 0 || remoteStats.totalPomodoros > 0

        if (!localHasData && !remoteHasData) {
            return { needResolve: false }
        }

        if (localHasData && !remoteHasData) {
            await pushData(localStats, localTodos, localSettings)
            return { needResolve: false }
        }

        if (!localHasData && remoteHasData) {
            return { needResolve: false, applyRemote: remoteData }
        }

        const statsMatch =
            localStats.totalStudyTime === remoteStats.totalStudyTime &&
            localStats.totalPomodoros === remoteStats.totalPomodoros

        if (statsMatch) {
            await pushData(localStats, localTodos, localSettings)
            return { needResolve: false }
        }

        conflictData.value = remoteData
        return {
            needResolve: true,
            remoteData,
            localData: { stats: localStats, todos: localTodos, settings: localSettings },
        }
    }

    const resolveConflict = async (choice, localStats, localTodos, localSettings) => {
        if (choice === 'local') {
            await pushData(localStats, localTodos, localSettings)
            conflictData.value = null
            return null
        } else {
            const remote = conflictData.value
            conflictData.value = null
            return remote
        }
    }

    return {
        syncStatus,
        lastSyncTime,
        conflictData,
        fetchRemoteData,
        pushData,
        syncOnLogin,
        resolveConflict,
    }
}
