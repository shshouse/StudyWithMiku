import { ref } from 'vue'

const CACHE_KEY = 'study_geo'
const CACHE_TTL = 30 * 60 * 1000
const location = ref('')
const CN_REGIONS = {
  'Beijing': '北京', 'Tianjin': '天津', 'Hebei': '河北', 'Shanxi': '山西',
  'Inner Mongolia': '内蒙古', 'Liaoning': '辽宁', 'Jilin': '吉林',
  'Heilongjiang': '黑龙江', 'Shanghai': '上海', 'Jiangsu': '江苏',
  'Zhejiang': '浙江', 'Anhui': '安徽', 'Fujian': '福建', 'Jiangxi': '江西',
  'Shandong': '山东', 'Henan': '河南', 'Hubei': '湖北', 'Hunan': '湖南',
  'Guangdong': '广东', 'Guangxi': '广西', 'Hainan': '海南', 'Chongqing': '重庆',
  'Sichuan': '四川', 'Guizhou': '贵州', 'Yunnan': '云南', 'Shaanxi': '陕西',
  'Gansu': '甘肃', 'Qinghai': '青海', 'Ningxia': '宁夏', 'Xinjiang': '新疆',
  'Tibet': '西藏', 'Taiwan': '中国台湾', 'Hong Kong': '中国香港', 'Macau': '中国澳门',
}

const CN_REGION_CODES = {
  BJ: '北京', TJ: '天津', HE: '河北', SX: '山西',
  NM: '内蒙古', LN: '辽宁', JL: '吉林', HL: '黑龙江',
  SH: '上海', JS: '江苏', ZJ: '浙江', AH: '安徽',
  FJ: '福建', JX: '江西', SD: '山东', HA: '河南',
  HB: '湖北', HN: '湖南', GD: '广东', GX: '广西',
  HI: '海南', CQ: '重庆', SC: '四川', GZ: '贵州',
  YN: '云南', SN: '陕西', GS: '甘肃', QH: '青海',
  NX: '宁夏', XJ: '新疆', XZ: '西藏', TW: '中国台湾',
  HK: '中国香港', MO: '中国澳门',
}

const COUNTRIES = {
  US: '美国', JP: '日本', KR: '韩国', GB: '英国', DE: '德国', FR: '法国',
  AU: '澳大利亚', CA: '加拿大', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', PH: '菲律宾', ID: '印尼', IN: '印度', RU: '俄罗斯',
  BR: '巴西', MX: '墨西哥', IT: '意大利', ES: '西班牙', NL: '荷兰',
  SE: '瑞典', CH: '瑞士', NZ: '新西兰', AE: '阿联酋', SA: '沙特',
  ZA: '南非', EG: '埃及', TR: '土耳其', PL: '波兰', UA: '乌克兰',
  IL: '以色列', AR: '阿根廷', CO: '哥伦比亚', PE: '秘鲁', CL: '智利',
  CZ: '捷克', RO: '罗马尼亚', HU: '匈牙利', GR: '希腊', PT: '葡萄牙',
  NO: '挪威', FI: '芬兰', DK: '丹麦', IE: '爱尔兰', AT: '奥地利',
  BE: '比利时', KZ: '哈萨克斯坦', PK: '巴基斯坦', BD: '孟加拉',
  MM: '缅甸', KH: '柬埔寨', LA: '老挝', NP: '尼泊尔', MN: '蒙古',
  IR: '伊朗', IQ: '伊拉克', GE: '格鲁吉亚', AZ: '阿塞拜疆',
  CN: '中国',
  HK: '中国香港', MO: '中国澳门',
}

const normalizeCnRegion = (rn) => {
  const r = rn.trim()
  if (CN_REGIONS[r]) return CN_REGIONS[r]
  if (CN_REGION_CODES[r.toUpperCase()]) return CN_REGION_CODES[r.toUpperCase()]
  if (/[\u4e00-\u9fa5]/.test(r)) {
    const stripped = r
      .replace(/(壮族|回族|维吾尔)?自治区$/, '')
      .replace(/特别行政区$/, '')
      .replace(/省$|市$|自治区$|地区$/g, '')
    if (CN_REGIONS[stripped]) return CN_REGIONS[stripped]
    if (stripped && stripped !== r) return stripped
    return r
  }
  const upper = r.toUpperCase()
  if (CN_REGION_CODES[upper]) return CN_REGION_CODES[upper]
  return null
}

const resolveLocation = (countryCode, regionName, countryName) => {
  if (!countryCode) return null
  const cc = String(countryCode).toUpperCase()
  if (cc === 'HK' || cc === 'MO') {
    if (regionName) {
      const normalized = normalizeCnRegion(String(regionName))
      if (normalized) return normalized
    }
    return COUNTRIES[cc] || countryName || cc
  }
  if (cc === 'TW') {
    if (regionName) {
      const normalized = normalizeCnRegion(String(regionName))
      if (normalized) return normalized
    }
    return '中国台湾'
  }

  if (cc === 'CN') {
    if (regionName) {
      const normalized = normalizeCnRegion(String(regionName))
      if (normalized) return normalized
    }
    return '中国'
  }
  return COUNTRIES[cc] || countryName || countryCode || null
}

const API_LIST = [
  async () => {
    const res = await fetch('https://ip-api.com/json/?lang=zh-CN&fields=status,country,countryCode,regionName')
    if (!res.ok) return null
    const d = await res.json()
    if (d.status !== 'success') return null
    return resolveLocation(d.countryCode, d.regionName, d.country)
  },
  async () => {
    const res = await fetch('https://ipwhois.app/json/')
    if (!res.ok) return null
    const d = await res.json()
    if (d.success === false) return null
    return resolveLocation(d.country_code, d.region, d.country)
  },
  async () => {
    const res = await fetch('https://api.ip.sb/geoip')
    if (!res.ok) return null
    const d = await res.json()
    return resolveLocation(d.country_code, d.region, d.country)
  },
  async () => {
    const res = await fetch('https://ipwho.is/')
    if (!res.ok) return null
    const d = await res.json()
    if (!d.success) return null
    return resolveLocation(d.country_code, d.region, d.country)
  },
  async () => {
    const res = await fetch('https://ipinfo.io/json')
    if (!res.ok) return null
    const d = await res.json()
    if (d.bogon) return null
    return resolveLocation(d.country, d.region, d.country)
  },
  async () => {
    const res = await fetch('https://ipapi.co/json/')
    if (!res.ok) return null
    const d = await res.json()
    if (d.error) return null
    return resolveLocation(d.country_code, d.region, d.country_name)
  },
  async () => {
    const res = await fetch('https://api.ip2location.io/')
    if (!res.ok) return null
    const d = await res.json()
    if (d.message) return null
    return resolveLocation(d.country_code, d.region_name, d.country_name)
  },
  async () => {
    const res = await fetch('https://api.ipgeolocation.io/ipgeo')
    if (!res.ok) return null
    const d = await res.json()
    if (d.message) return null
    return resolveLocation(d.country_code2, d.state_prov, d.country_name)
  },
  async () => {
    const res = await fetch('https://freeipapi.com/api/json')
    if (!res.ok) return null
    const d = await res.json()
    return resolveLocation(d.countryCode, d.regionName, d.countryName)
  },
  async () => {
    const res = await fetch('https://ipapi.com/json/')
    if (!res.ok) return null
    const d = await res.json()
    if (d.error) return null
    return resolveLocation(d.country_code, d.region, d.country_name)
  },
]

export function useGeoLocation() {
  const detect = async () => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const c = JSON.parse(raw)
        if (Date.now() - c.ts < CACHE_TTL) {
          location.value = c.v
          return c.v
        }
        sessionStorage.removeItem(CACHE_KEY)
      }
    } catch {}

    let fallback = ''
    for (const api of API_LIST) {
      try {
        const result = await api()
        if (result && result !== '中国') {
          location.value = result
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: result, ts: Date.now() })) } catch {}
          return result
        }
        if (result === '中国' && !fallback) fallback = '中国'
      } catch {}
    }

    if (fallback) {
      location.value = fallback
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ v: fallback, ts: Date.now() })) } catch {}
      return fallback
    }
    return ''
  }

  return { location, detect }
}
