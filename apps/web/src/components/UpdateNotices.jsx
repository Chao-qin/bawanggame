import { NoticeBar } from 'antd-mobile'
import { useCallback, useEffect, useState } from 'react'
import { isEmbeddedHost } from '../online.js'
import { APK_DOWNLOAD_URL, CHECK_INTERVAL_MS, compareVersions, fetchRemoteMeta, parseAnnouncements } from '../updates.js'

const APP_VERSION = import.meta.env.VITE_APP_VERSION || ''
const META_KEY = 'xiaochao-remote-meta'
const DISMISSED_KEY = 'xiaochao-dismissed-notices'

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

/** Announcements for everyone; in the installed app, also a prompt to download a newer APK. */
export function UpdateNotices() {
  const [meta, setMeta] = useState(() => readJson(META_KEY, null))
  const [dismissed, setDismissed] = useState(() => {
    const stored = readJson(DISMISSED_KEY, [])
    return Array.isArray(stored) ? stored : []
  })

  useEffect(() => {
    let alive = true
    // The last result is kept so that reopening the app does not request GitHub again within the interval. The check
    // time is taken before the request, so the interval timer finds the cache due instead of a few seconds early.
    const check = () => {
      const cached = readJson(META_KEY, null)
      const startedAt = Date.now()
      if (cached && startedAt - cached.checkedAt < CHECK_INTERVAL_MS) return
      fetchRemoteMeta().then((value) => {
        // Nothing reached: keep what is shown and try again at the next interval.
        if (value.version === null && value.announcements === null) return
        const next = {
          version: value.version ?? cached?.version ?? '',
          announcements: value.announcements ?? cached?.announcements ?? [],
          checkedAt: startedAt,
        }
        writeJson(META_KEY, next)
        if (alive) setMeta(next)
      }, () => {})
    }
    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const dismiss = useCallback((id) => {
    setDismissed((current) => {
      const next = [...current.filter((item) => item !== id), id].slice(-50)
      writeJson(DISMISSED_KEY, next)
      return next
    })
  }, [])

  if (!meta) return null
  const updateId = `update:${meta.version}`
  const showUpdate = isEmbeddedHost() && APP_VERSION && meta.version && compareVersions(meta.version, APP_VERSION) > 0 && !dismissed.includes(updateId)
  const announcements = parseAnnouncements(meta.announcements, { dismissed })

  if (!showUpdate && !announcements.length) return null
  return (
    <div className="updateNotices">
      {showUpdate && (
        <NoticeBar
          color="info"
          wrap
          closeable
          onClose={() => dismiss(updateId)}
          content={`发现新版本 v${meta.version.replace(/^v/i, '')}（当前 v${APP_VERSION}）`}
          extra={<a href={APK_DOWNLOAD_URL} target="_blank" rel="noreferrer">下载安装包</a>}
        />
      )}
      {announcements.map((item) => (
        <NoticeBar
          key={item.id}
          color="alert"
          wrap
          closeable
          onClose={() => dismiss(item.id)}
          content={item.body ? `${item.title}：${item.body}` : item.title}
          extra={item.url ? <a href={item.url} target="_blank" rel="noreferrer">查看</a> : null}
        />
      ))}
    </div>
  )
}
