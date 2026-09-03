import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

export type CodeTabKind =
  | 'js'
  | 'react'
  | 'dom'
  | 'elements'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'angular'
  | 'preact'
  | 'qwik'

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

export function JsIcon() {
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

export function ReactIcon() {
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

/** Generic DOM icon for the framework-free adapter: a document tree. */
export function DomIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#E9EDF5" />
      <g fill="none" stroke="#1D2033" strokeWidth="1.6" strokeLinecap="round">
        <path d="M8 6h8M8 6v12M8 12h5M8 18h8" />
      </g>
      <circle cx="16.5" cy="6" r="1.6" fill="#F0A24B" />
      <circle cx="13.5" cy="12" r="1.6" fill="#F0A24B" />
      <circle cx="16.5" cy="18" r="1.6" fill="#F0A24B" />
    </svg>
  )
}

export function WebComponentsIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#29ABE2" d="M6.5 2 1 12l5.5 10h6.2L7.2 12l5.5-10z" />
      <path fill="#166DA5" d="M17.5 2h-4.8l5.5 10-5.5 10h4.8L23 12z" />
      <path fill="#fff" d="M9.6 12 12.7 6.4h2.6L12.3 12l3 5.6h-2.6z" />
    </svg>
  )
}

export function VueIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#41B883" d="M14.8 3 12 7.8 9.2 3H1.5L12 21.2 22.5 3z" />
      <path fill="#34495E" d="M14.8 3 12 7.8 9.2 3H5.7L12 13.9 18.3 3z" />
    </svg>
  )
}

export function SvelteIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#FF3E00" />
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        d="M15.6 6.3c-1.6-1.2-3.9-.9-5.4.4L7 9.1c-1.3 1-1.6 2.6-.8 3.9.7 1.1 2.1 1.6 3.4 1.1M8.4 17.7c1.6 1.2 3.9.9 5.4-.4l3.2-2.4c1.3-1 1.6-2.6.8-3.9-.7-1.1-2.1-1.6-3.4-1.1"
      />
    </svg>
  )
}

export function SolidIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#2C4F7C" d="M22 7.4c-3.8-3.1-9.9-4.6-14.2-3.1L4.7 5.9 2 9.5l10.4 1.2z" />
      <path
        fill="#335D92"
        d="M6.6 8.3C2.4 9.7 1.3 12.9 4.3 15.4c2.4 1.7 6.5 2.4 10.2 1.2l3.6-2.7C14.7 10.4 10.4 7 6.6 8.3z"
      />
      <path
        fill="#446B9E"
        d="M4.3 15.4c-1.6 1.2-1.6 2.7.1 3.7 2.9 1.8 8 2 12.3.3l3.3-2.4c-4-1.2-9.5-1.2-12.3.3z"
      />
      <path
        fill="#4F88C6"
        d="M8 18.9c-1.5 1-1.5 2 0 2.6 2.3 1 6.1.6 8.4-1l2.6-1.9C15.7 17.5 10.6 17.6 8 18.9z"
      />
    </svg>
  )
}

export function AngularIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#DD0031" d="M12 2 2.5 5.4l1.5 12.6L12 22l8-4L21.5 5.4z" />
      <path fill="#C3002F" d="M12 2v20l8-4 1.5-12.6z" />
      <path fill="#fff" d="M12 5.2 6.4 17.6h2.2l1.1-2.8h4.6l1.1 2.8h2.2zm0 4.3 1.6 3.7h-3.2z" />
    </svg>
  )
}

export function PreactIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#673AB8" d="M12 1.5 21.1 6.8v10.4L12 22.5l-9.1-5.3V6.8z" />
      <g fill="none" stroke="#fff" strokeWidth="0.9">
        <ellipse cx="12" cy="12" rx="7.4" ry="3" transform="rotate(-45 12 12)" />
        <ellipse cx="12" cy="12" rx="7.4" ry="3" transform="rotate(45 12 12)" />
      </g>
      <circle cx="12" cy="12" r="1.3" fill="#fff" />
    </svg>
  )
}

export function QwikIcon() {
  return (
    <svg className="g-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#18B6F6"
        d="M15.3 1.8H8.7L3 5.1v8.7l2.3 4.7L12 22.6l-1.5-4L3.9 12l3.9-6.6h8.4L20 12l-2.9 5.2L22 12.9V5.1z"
      />
      <path fill="#AC7EF4" d="M16.2 5.4H7.8L3.9 12l6.6 6.6L12 22.6l6.8-4.7L17.1 17.2 20 12z" />
      <path fill="#fff" d="m10.5 18.6 4.7-4.9-1.6-1.6L17.1 7.3l-6.6 6.9 1.6 1.6z" />
    </svg>
  )
}

const ICONS: Record<CodeTabKind, () => ReactElement> = {
  js: JsIcon,
  react: ReactIcon,
  dom: DomIcon,
  elements: WebComponentsIcon,
  vue: VueIcon,
  svelte: SvelteIcon,
  solid: SolidIcon,
  angular: AngularIcon,
  preact: PreactIcon,
  qwik: QwikIcon,
}

/** Brand icons per adapter, exported for pages that list frameworks. */
export const ADAPTER_ICONS = ICONS

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
  const strip = useRef<HTMLDivElement | null>(null)

  // The strip scrolls horizontally on narrow viewports. Fade edges show only
  // on the side that has more tabs hidden, so they never mask the last tab.
  useEffect(() => {
    const node = strip.current
    if (!node) return
    const update = () => {
      const max = node.scrollWidth - node.clientWidth
      node.toggleAttribute('data-overflow-start', node.scrollLeft > 1)
      node.toggleAttribute('data-overflow-end', max - node.scrollLeft > 1)
    }
    update()
    node.addEventListener('scroll', update, { passive: true })
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update())
    observer?.observe(node)
    return () => {
      node.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    buttons.current[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

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
      <div className="g-tabs-strip">
        <div className="g-tabs-scroll" ref={strip}>
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
        </div>
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
