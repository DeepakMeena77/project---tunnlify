import { useState } from 'react'
import { useInspector } from '../hooks/useInspector'
import { CopyButton } from './CopyButton'

/**
 * RequestInspector
 * ─────────────────
 * Full inspector panel: request table + side panel detail + replay.
 * Embedded inside DashboardPage on the "Inspector" tab.
 */
export default function RequestInspector() {
  const { rows, selected, selectRow, clearSelected,
          loading, error, lastRefresh, replay, replayState } = useInspector()

  return (
    <div className="flex h-[620px] max-h-[80svh] flex-col overflow-hidden rounded-lg border border-gray-200 lg:h-[520px] lg:flex-row">

      {/* ── Left: Request table ────────────────────────────────────────────── */}
      <div className={`flex min-h-0 flex-col ${selected ? 'h-1/2 lg:h-auto lg:w-[52%]' : 'h-full lg:w-full'} border-b border-gray-100 transition-all duration-200 lg:border-b-0 lg:border-r`}>

        {/* Table header */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-gray-100 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Requests</span>
          <div className="flex flex-wrap items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-gray-400">
                {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Auto-refresh 5s
            </span>
          </div>
        </div>

        {/* Column headings */}
        <div className="grid shrink-0 grid-cols-[64px_minmax(0,1fr)_48px] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 sm:grid-cols-[64px_minmax(0,1fr)_48px_60px_72px] sm:px-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Method</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Path</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:block">Time</span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:block">When</span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Spinner className="w-5 h-5 border-gray-300 border-t-gray-600" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <span className="text-sm text-red-500">{error}</span>
              <span className="text-xs text-gray-400">Will retry automatically</span>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <span className="text-sm text-gray-400">No requests recorded yet</span>
              <span className="text-xs text-gray-400">Send traffic through your tunnel to see it here</span>
            </div>
          )}

          {rows.map(row => (
            <RequestRow
              key={row.id}
              row={row}
              isSelected={selected?.id === row.id}
              onClick={() => selected?.id === row.id ? clearSelected() : selectRow(row)}
              replayState={replayState[row.id]}
              onReplay={(e) => { e.stopPropagation(); replay(row) }}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Detail side panel ───────────────────────────────────────── */}
      {selected && (
        <DetailPanel
          row={selected}
          onClose={clearSelected}
          replayState={replayState[selected.id]}
          onReplay={() => replay(selected)}
        />
      )}

    </div>
  )
}

// ── RequestRow ─────────────────────────────────────────────────────────────────

function RequestRow({ row, isSelected, onClick, replayState, onReplay }) {
  return (
    <div
      onClick={onClick}
      className={`grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-2 px-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_48px_60px_72px] sm:px-4
        cursor-pointer border-b border-gray-50 text-xs font-mono
        hover:bg-gray-50 transition-colors group
        ${isSelected ? 'bg-gray-50 border-l-2 border-l-gray-900' : ''}`}
    >
      <MethodBadge method={row.method} />
      <span className="min-w-0 truncate text-gray-700" title={row.path}>{row.path}</span>
      <StatusCode code={row.status_code} />
      <span className="hidden text-gray-400 sm:block">{row.response_time_ms != null ? `${row.response_time_ms}ms` : '—'}</span>
      <span className="hidden truncate text-gray-400 sm:block">{timeAgo(row.created_at)}</span>
    </div>
  )
}

// ── DetailPanel ────────────────────────────────────────────────────────────────

function DetailPanel({ row, onClose, replayState, onReplay }) {
  const [tab, setTab] = useState('request')

  const reqHeaders = safeJson(row.request_headers)
  const resHeaders = safeJson(row.response_headers)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {/* Panel header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-gray-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <MethodBadge method={row.method} />
          <span className="text-xs font-mono text-gray-700 truncate">{row.path}</span>
          <StatusCode code={row.status_code} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <ReplayButton state={replayState} onClick={onReplay} />
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close panel"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-gray-100 px-3 sm:px-4">
        {[['request', 'Request'], ['response', 'Response']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-xs font-medium py-2 px-3 border-b-2 transition-colors mr-1
              ${tab === key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 sm:p-4">
        {tab === 'request' ? (
          <>
            <MetaRow label="Method"   value={row.method} />
            <MetaRow label="Path"     value={row.path} />
            <MetaRow label="Time"     value={new Date(row.created_at).toLocaleString()} />
            <MetaRow label="Response" value={row.response_time_ms != null ? `${row.response_time_ms}ms` : '—'} />

            <Section title="Request Headers" copiable={JSON.stringify(reqHeaders, null, 2)}>
              <HeadersTable headers={reqHeaders} />
            </Section>

            {row.request_body && (
              <Section title="Request Body" copiable={row.request_body}>
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-3">
                  {tryPrettyJson(row.request_body)}
                </pre>
              </Section>
            )}
          </>
        ) : (
          <>
            <MetaRow label="Status" value={<StatusCode code={row.status_code} />} />

            <Section title="Response Headers" copiable={JSON.stringify(resHeaders, null, 2)}>
              <HeadersTable headers={resHeaders} />
            </Section>

            {row.response_body && (
              <Section title="Response Body" copiable={row.response_body}>
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 rounded p-3">
                  {tryPrettyJson(row.response_body)}
                </pre>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function ReplayButton({ state, onClick }) {
  if (state === 'pending') {
    return (
      <button disabled className="btn-secondary btn-sm opacity-60 gap-1.5">
        <Spinner className="w-3 h-3 border-gray-400 border-t-gray-700" />
        Replaying…
      </button>
    )
  }
  if (state === 'done') {
    return (
      <button disabled className="btn-secondary btn-sm text-green-700 border-green-300 opacity-80">
        ✓ Replayed
      </button>
    )
  }
  if (state === 'error') {
    return (
      <button disabled className="btn-secondary btn-sm text-red-600 border-red-300 opacity-80">
        ✗ Failed
      </button>
    )
  }
  return (
    <button onClick={onClick} className="btn-secondary btn-sm gap-1.5">
      <ReplayIcon className="w-3.5 h-3.5" />
      Replay
    </button>
  )
}

function Section({ title, copiable, children }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{title}</span>
        {copiable && <CopyButton text={copiable} label="Copy" className="!py-0.5 !px-2 !text-[10px]" />}
      </div>
      {children}
    </div>
  )
}

function HeadersTable({ headers }) {
  if (!headers || Object.keys(headers).length === 0) {
    return <p className="text-xs text-gray-400 italic">None</p>
  }
  return (
    <div className="overflow-hidden rounded border border-gray-100 divide-y divide-gray-50">
      {Object.entries(headers).map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 text-xs font-mono sm:grid-cols-[140px_1fr]">
          <span className="truncate border-gray-100 bg-gray-50 px-2 py-1.5 text-gray-500 sm:border-r" title={k}>{k}</span>
          <span className="px-2 py-1.5 text-gray-800 break-all">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function MetaRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-3">
      <span className="text-gray-400 w-20 shrink-0">{label}</span>
      <span className="break-all text-gray-700 font-mono">{value}</span>
    </div>
  )
}

export function MethodBadge({ method }) {
  const colors = {
    GET:    'text-blue-700 bg-blue-50 border-blue-100',
    POST:   'text-green-700 bg-green-50 border-green-100',
    PUT:    'text-yellow-700 bg-yellow-50 border-yellow-100',
    PATCH:  'text-orange-700 bg-orange-50 border-orange-100',
    DELETE: 'text-red-700 bg-red-50 border-red-100',
    HEAD:   'text-purple-700 bg-purple-50 border-purple-100',
  }
  return (
    <span className={`inline-block text-center px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide
      ${colors[method?.toUpperCase()] ?? 'text-gray-700 bg-gray-50 border-gray-100'}`}>
      {method}
    </span>
  )
}

export function StatusCode({ code }) {
  if (code == null) return <span className="text-gray-400 text-xs">—</span>
  const color = code < 300 ? 'text-green-700' : code < 400 ? 'text-blue-600' : code < 500 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-semibold text-xs ${color}`}>{code}</span>
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="1" y1="1" x2="11" y2="11"/>
      <line x1="11" y1="1" x2="1" y2="11"/>
    </svg>
  )
}

function ReplayIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8a5.5 5.5 0 1 1 1.1 3.3"/>
      <path d="M2.5 4v4h4"/>
    </svg>
  )
}

function Spinner({ className }) {
  return (
    <span className={`inline-block rounded-full border-2 animate-spin ${className}`}
      style={{ width: undefined, height: undefined }} />
  )
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return '—'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 5)   return 'just now'
  if (secs < 60)  return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

function safeJson(v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return {} }
}

function tryPrettyJson(s) {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}
