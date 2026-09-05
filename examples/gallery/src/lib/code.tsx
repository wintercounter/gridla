import { useEffect, useState } from 'react'

import { CodeBlock } from '@gridla/demo-kit/react'

/** A collapsible, copyable, syntax-highlighted code example. */
export function CodeExample({
  code,
  title = 'Code',
  lang = 'tsx',
}: {
  code: string
  title?: string
  lang?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <details className="gl-code gd-disclosure">
      <summary>{title}</summary>
      <div className="gl-code-body gd-disclosure-body">
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
        <CodeBlock code={code} lang={lang} />
      </div>
    </details>
  )
}
