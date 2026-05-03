import { ref, computed, onMounted } from 'vue'

const STUDY_TOKEN_KEY = 'study_auth_token'
const STUDY_USER_KEY = 'study_auth_user'
const STUDY_USER_ID_KEY = 'study_auth_user_id'
const STUDY_TOKEN_USER_CHANGED_KEY = 'study_auth_token_user_changed'

const token = ref(localStorage.getItem(STUDY_TOKEN_KEY) || '')
const username = ref(localStorage.getItem(STUDY_USER_KEY) || '')
const userId = ref(getTokenUserId(token.value) || localStorage.getItem(STUDY_USER_ID_KEY) || '')
const tokenUserChanged = ref(sessionStorage.getItem(STUDY_TOKEN_USER_CHANGED_KEY) === '1')
const sessionExpired = ref(false)
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

export function getTokenPayload(studyToken) {
     try {
         const payloadB64 = studyToken?.split('.')[1]
         if (!payloadB64) return null
         return decodeBase64UrlJson(payloadB64)
     } catch {
         return null
     }
 }

export function getTokenUserId(studyToken) {
    const payload = getTokenPayload(studyToken)
    return typeof payload?.sub === 'string' ? payload.sub : ''
}

 function syncUsernameFromToken(studyToken) {
     const payload = getTokenPayload(studyToken)
     if (!payload) return

     const nextUserId = getTokenUserId(studyToken)
     if (nextUserId) {
         userId.value = nextUserId
         localStorage.setItem(STUDY_USER_ID_KEY, nextUserId)
     }
     if (payload.username || payload.sub) {
         username.value = payload.username || payload.sub.slice(0, 8)
         localStorage.setItem(STUDY_USER_KEY, username.value)
     }
 }

const MIKUMOD_URL = import.meta.env.VITE_MIKUMOD_URL || 'https://mikumod.com'
const STUDY_URL = import.meta.env.VITE_STUDY_URL || 'https://study.mikumod.com'

export function useStudyAuth() {


    const login = () => {
        sessionExpired.value = false
        const callbackUrl = encodeURIComponent(STUDY_URL)
        window.location.href = `${MIKUMOD_URL}/login?redirect=study&callback=${callbackUrl}`
    }

    const markSessionExpired = () => {
        if (!token.value) return
        sessionExpired.value = true
    }

    const clearSessionExpired = () => {
        sessionExpired.value = false
    }


    const handleCallback = () => {
        const hash = window.location.hash
        if (!hash.includes('study_token=')) return false

        const params = new URLSearchParams(hash.slice(1))
        const callbackToken = params.get('study_token') || ''
        if (callbackToken) {
            const previousUserId = getTokenUserId(token.value) || localStorage.getItem(STUDY_USER_ID_KEY) || ''
            const nextUserId = getTokenUserId(callbackToken)
            const changed = !!previousUserId && !!nextUserId && previousUserId !== nextUserId

            token.value = callbackToken
            tokenUserChanged.value = changed
            localStorage.setItem(STUDY_TOKEN_KEY, callbackToken)
            if (changed) {
                sessionStorage.setItem(STUDY_TOKEN_USER_CHANGED_KEY, '1')
            } else {
                sessionStorage.removeItem(STUDY_TOKEN_USER_CHANGED_KEY)
            }


            syncUsernameFromToken(callbackToken)


            params.delete('study_token')
            const nextHash = params.toString()
            history.replaceState(null, '', window.location.pathname + window.location.search + (nextHash ? `#${nextHash}` : ''))
            return true
        }
        return false
    }


    const logout = () => {
        token.value = ''
        username.value = ''
        userId.value = ''
        tokenUserChanged.value = false
        sessionExpired.value = false
        localStorage.removeItem(STUDY_TOKEN_KEY)
        localStorage.removeItem(STUDY_USER_KEY)
        localStorage.removeItem(STUDY_USER_ID_KEY)
        sessionStorage.removeItem(STUDY_TOKEN_USER_CHANGED_KEY)
    }

    const clearTokenUserChanged = () => {
        tokenUserChanged.value = false
        sessionStorage.removeItem(STUDY_TOKEN_USER_CHANGED_KEY)
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
        const callbackHandled = handleCallback()
        if (callbackHandled) {
            sessionExpired.value = false
        }

        if (token.value && isTokenExpired()) {
            sessionExpired.value = true
            return
        }
        if (token.value) {
            syncUsernameFromToken(token.value)
        }
    })

    return {
        token,
        username,
        userId,
        tokenUserChanged,
        sessionExpired,
        isLoggedIn,
        login,
        logout,
        clearTokenUserChanged,
        markSessionExpired,
        clearSessionExpired,
        getAuthHeaders,
        isTokenExpired,
        MIKUMOD_URL,
    }
}
