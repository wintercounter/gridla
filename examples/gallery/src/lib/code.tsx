import { useEffect, useState } from 'react'

/** A collapsible, copyable code example. */
export function CodeExample({ code, title = 'Code' }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <details className="gl-code">
      <summary>{title}</summary>
      <div className="gl-code-body">
        <button
          type="button"
          className="gd-button gl-code-copy"
          data-variant="ghost"
          onClick={() => {
            navigator.clipboard
              .writeText(code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </details>
  )
}
