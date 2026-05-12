import { useState, useCallback } from 'react'

/**
 * Copies text to clipboard and shows a brief "Copied!" indicator.
 * Renders children as a render-prop: children(copy, copied)
 */
export function useCopy() {
  const [copied, setCopied] = useState(false)

  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return { copy, copied }
}

/** Standalone copy button */
export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = '' }) {
  const { copy, copied } = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className={`btn-secondary btn-sm ${className}`}
    >
      {copied ? (
        <>
          <CheckIcon className="w-3.5 h-3.5 text-green-600" />
          <span className="text-green-700">{copiedLabel}</span>
        </>
      ) : (
        <>
          <CopyIcon className="w-3.5 h-3.5" />
          {label}
        </>
      )}
    </button>
  )
}

function CopyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="8" height="9" rx="1.5"/>
      <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h6A1.5 1.5 0 0 1 14 3.5V12a1.5 1.5 0 0 1-1.5 1.5H11"/>
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8l3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
