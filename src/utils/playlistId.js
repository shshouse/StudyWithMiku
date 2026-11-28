/**
 * 从「同学粘贴的东西」里把歌单 ID 抠出来（2026-11-27）
 *
 * 为什么需要：同学多半会把**整条分享链接**粘进「歌单ID」输入框，
 * 而接口只认纯数字，于是返回空 → 播放器一首首往下跳。
 * 这里在提交前统一清洗一遍，顺便根据域名把「平台」也自动选对。
 *
 * 支持的格式（实测过的）：
 *   网易云   https://music.163.com/playlist?id=6957642654
 *            https://music.163.com/#/playlist?id=6957642654
 *            https://y.music.163.com/m/playlist?id=6957642654&userid=xxx
 *            分享文本：「分享歌单... https://163cn.tv/xxxx 」
 *   QQ音乐   https://y.qq.com/n/ryqq/playlist/7455666076
 *            https://y.qq.com/n/yqq/playlist/7455666076.html
 *            https://i.y.qq.com/n2/m/share/details/taoge.html?id=7455666076
 *            分享文本：「分享歌单... https://c6.y.qq.com/base/fcgi-bin/u?__=xxx 」
 *   纯数字   6957642654
 */

const PLATFORM_HOSTS = [
  { platform: 'netease', test: /(^|\.)(music\.163\.com|163cn\.tv|163\.com)$/i },
  { platform: 'tencent', test: /(^|\.)(y\.qq\.com|qq\.com|qqmusic\.qq\.com)$/i },
]

/** 从域名判断平台；判断不出来就返回 ''（保持用户自己选的） */
const detectPlatform = (text) => {
  const m = String(text || '').match(/https?:\/\/([^/\s?#]+)/i)
  if (!m) return ''
  const host = m[1].toLowerCase()
  const hit = PLATFORM_HOSTS.find((item) => item.test.test(host))
  return hit ? hit.platform : ''
}

/** 纯数字就直接用；太长/太短都不像歌单 ID */
const isPlainId = (value) => /^\d{5,20}$/.test(value)

/**
 * @returns {{ id: string, platform: string, raw: string }}
 *   id 为空字符串表示「没找到」
 */
export const extractPlaylistId = (input) => {
  const raw = String(input || '').trim()
  if (!raw) return { id: '', platform: '', raw }

  // 1) 本来就是纯数字
  if (isPlainId(raw)) return { id: raw, platform: '', raw }

  const platform = detectPlatform(raw)

  // 2) ?id=123 / &id=123 （网易云、QQ 分享链接最常见）
  let m = raw.match(/[?&#]id=(\d{5,20})/i)
  if (m) return { id: m[1], platform, raw }

  // 3) QQ 音乐新版路径 /playlist/123456
  m = raw.match(/\/playlist\/(\d{5,20})/i)
  if (m) return { id: m[1], platform, raw }

  // 4) QQ 音乐老接口 disstid=123456
  m = raw.match(/[?&#]disstid=(\d{5,20})/i)
  if (m) return { id: m[1], platform, raw }

  // 5) 兜底：取最后一个较长的数字串（分享文本里通常只有歌单 ID 这么长）
  const all = raw.match(/\d{6,20}/g)
  if (all && all.length) return { id: all[all.length - 1], platform, raw }

  return { id: '', platform, raw }
}
