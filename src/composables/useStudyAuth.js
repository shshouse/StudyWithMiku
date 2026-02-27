import { ref, computed, onMounted } from 'vue'

const STUDY_TOKEN_KEY = 'study_auth_token'
const STUDY_USER_KEY = 'study_auth_user'

const token = ref(localStorage.getItem(STUDY_TOKEN_KEY) || '')
const username = ref(localStorage.getItem(STUDY_USER_KEY) || '')
const isLoggedIn = computed(() => !!token.value)

const MIKUMOD_URL = import.meta.env.VITE_MIKUMOD_URL || 'https://mikumod.com'
const STUDY_URL = import.meta.env.VITE_STUDY_URL || 'https://study.mikumod.com'

export function useStudyAuth() {


    const login = () => {
        const callbackUrl = encodeURIComponent(STUDY_URL)
        window.location.href = `${MIKUMOD_URL}/login?redirect=study&callback=${callbackUrl}`
    }


    const handleCallback = () => {
        const hash = window.location.hash
        if (!hash.includes('study_token=')) return false

        const match = hash.match(/study_token=([^&]+)/)
        if (match && match[1]) {
            token.value = match[1]
            localStorage.setItem(STUDY_TOKEN_KEY, match[1])


            try {
                const payloadB64 = match[1].split('.')[1]
                const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
                if (payload.sub) {
                    username.value = payload.sub.slice(0, 8)
                    localStorage.setItem(STUDY_USER_KEY, username.value)
                }
            } catch { }


            history.replaceState(null, '', window.location.pathname + window.location.search)
            return true
        }
        return false
    }


    const logout = () => {
        token.value = ''
        username.value = ''
        localStorage.removeItem(STUDY_TOKEN_KEY)
        localStorage.removeItem(STUDY_USER_KEY)
    }


    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`,
    })


    const isTokenExpired = () => {
        if (!token.value) return true
        try {
            const payloadB64 = token.value.split('.')[1]
            const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
            return payload.exp < Math.floor(Date.now() / 1000)
        } catch {
            return true
        }
    }

    onMounted(() => {
        handleCallback()

        if (token.value && isTokenExpired()) {
            logout()
        }
    })

    return {
        token,
        username,
        isLoggedIn,
        login,
        logout,
        getAuthHeaders,
        isTokenExpired,
        MIKUMOD_URL,
    }
}
