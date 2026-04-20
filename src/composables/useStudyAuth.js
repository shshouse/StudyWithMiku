import { ref, computed, onMounted } from 'vue'

const STUDY_TOKEN_KEY = 'study_auth_token'
const STUDY_USER_KEY = 'study_auth_user'

const token = ref(localStorage.getItem(STUDY_TOKEN_KEY) || '')
const username = ref(localStorage.getItem(STUDY_USER_KEY) || '')
const isLoggedIn = computed(() => !!token.value)

 function decodeBase64UrlJson(base64Url) {
     const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/')
     const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
     const binary = atob(padded)
     const bytes = new Uint8Array(binary.length)

     for (let i = 0; i < binary.length; i++) {
         bytes[i] = binary.charCodeAt(i)
     }

     return JSON.parse(new TextDecoder().decode(bytes))
 }

 function getTokenPayload(studyToken) {
     try {
         const payloadB64 = studyToken.split('.')[1]
         if (!payloadB64) return null
         return decodeBase64UrlJson(payloadB64)
     } catch {
         return null
     }
 }

 function syncUsernameFromToken(studyToken) {
     const payload = getTokenPayload(studyToken)
     if (!payload) return

     if (payload.username || payload.sub) {
         username.value = payload.username || payload.sub.slice(0, 8)
         localStorage.setItem(STUDY_USER_KEY, username.value)
     }
 }

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


            syncUsernameFromToken(match[1])


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
        const payload = getTokenPayload(token.value)
        if (!payload) return true
        return payload.exp < Math.floor(Date.now() / 1000)
    }

    onMounted(() => {
        handleCallback()

        if (token.value && isTokenExpired()) {
            logout()
            return
        }
        if (token.value) {
            syncUsernameFromToken(token.value)
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
