import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type NoticeTone = 'info' | 'ok' | 'error'

export type Notice = { id: number; message: string; tone: NoticeTone }

type NoticesValue = {
  notify: (message: string, tone?: NoticeTone) => void
}

const NoticesContext = createContext<NoticesValue | null>(null)

export function useNotices(): NoticesValue {
  const value = useContext(NoticesContext)
  if (!value) throw new Error('useNotices must be used inside <NoticesProvider>')
  return value
}

let nextNotice = 1

export function NoticesProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const notify = useCallback((message: string, tone: NoticeTone = 'info') => {
    const id = nextNotice
    nextNotice += 1
    setNotices((list) => [...list.slice(-3), { id, message, tone }])
    window.setTimeout(
      () => {
        setNotices((list) => list.filter((notice) => notice.id !== id))
      },
      tone === 'error' ? 8000 : 4000,
    )
  }, [])
  const value = useMemo(() => ({ notify }), [notify])
  return (
    <NoticesContext.Provider value={value}>
      {children}
      <div className="st-notices" aria-live="polite">
        {notices.map((notice) => (
          <output key={notice.id} className="st-notice" data-tone={notice.tone}>
            {notice.message}
            <button
              type="button"
              className="st-notice-close"
              aria-label="Dismiss"
              onClick={() => setNotices((list) => list.filter((entry) => entry.id !== notice.id))}
            >
              ×
            </button>
          </output>
        ))}
      </div>
    </NoticesContext.Provider>
  )
}
