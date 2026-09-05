import {
  Children,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

export type CodeTabKind = 'js' | 'react'

export type CodeTabProps = {
  /** Which brand icon to show and the value stored in the tab id. */
  kind: CodeTabKind
  label: string
  children?: ReactNode
}

/** One panel of `CodeTabs`. Rendering is handled by the parent. */
export function CodeTab(_props: CodeTabProps) {
  return null
}

function JsIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#F7DF1E" />
      <path
        fill="#1B1B1B"
        d="M12.3 18.1c.4.7 1 1.2 2 1.2.9 0 1.4-.4 1.4-1 0-.7-.6-1-1.5-1.4l-.5-.2c-1.5-.6-2.5-1.4-2.5-3.1 0-1.6 1.2-2.8 3.1-2.8 1.3 0 2.3.5 3 1.7l-1.6 1c-.4-.6-.7-.9-1.4-.9-.6 0-1 .4-1 .9 0 .6.4.9 1.3 1.3l.5.2c1.8.8 2.8 1.5 2.8 3.3 0 1.9-1.5 2.9-3.5 2.9-1.9 0-3.2-.9-3.8-2.1zM5 18.3c.3.6.6 1.1 1.4 1.1.7 0 1.2-.3 1.2-1.4V11h2.1v7c0 2.2-1.3 3.2-3.1 3.2-1.7 0-2.7-.9-3.2-1.9z"
      />
    </svg>
  )
}

function ReactIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.1" fill="#61DAFB" />
      <g fill="none" stroke="#61DAFB" strokeWidth="1.2">
        <ellipse cx="12" cy="12" rx="10" ry="3.9" />
        <ellipse cx="12" cy="12" rx="10" ry="3.9" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="3.9" transform="rotate(120 12 12)" />
      </g>
    </svg>
  )
}

const ICONS: Record<CodeTabKind, () => ReactElement> = { js: JsIcon, react: ReactIcon }

/**
 * Accessible tab strip for the home code samples. Tabs are buttons in a
 * `tablist`; arrow keys, Home, and End move between them. Panels stay mounted
 * (hidden) so the highlighted code is in the document for search.
 */
export function CodeTabs({ children }: { children?: ReactNode }) {
  const tabs = Children.toArray(children).filter(
    (child): child is ReactElement<CodeTabProps> =>
      isValidElement(child) && typeof (child.props as CodeTabProps).kind === 'string',
  )
  const [active, setActive] = useState(0)
  const baseId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const count = tabs.length
      let next: number | null = null
      if (event.key === 'ArrowRight') next = (active + 1) % count
      else if (event.key === 'ArrowLeft') next = (active - 1 + count) % count
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = count - 1
      if (next === null) return
      event.preventDefault()
      setActive(next)
      buttons.current[next]?.focus()
    },
    [active, tabs.length],
  )

  return (
    <div className="g-tabs">
      <div
        className="g-tabs-bar"
        role="tablist"
        aria-label="Code sample flavor"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, index) => {
          const Icon = ICONS[tab.props.kind]
          const selected = index === active
          return (
            <button
              key={tab.props.kind}
              ref={(node) => {
                buttons.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              data-kind={tab.props.kind}
              onClick={() => setActive(index)}
            >
              <Icon />
              <span>{tab.props.label}</span>
            </button>
          )
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.props.kind}
          className="g-tabs-panel"
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={index !== active}
          tabIndex={0}
        >
          {tab.props.children}
        </div>
      ))}
    </div>
  )
}
