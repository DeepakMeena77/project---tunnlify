import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const REFRESH_MS = 5000

/**
 * useInspector — polls /auth/requests every 5 s, handles selection + replay.
 */
export function useInspector() {
  const [rows,       setRows]       = useState([])
  const [selected,   setSelected]   = useState(null)   // full detail row
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [replayState, setReplayState] = useState({})   // id → 'pending'|'done'|'error'
  const [lastRefresh, setLastRefresh] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api.listRequests(100)
      setRows(data)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + 5-second auto-refresh
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  // Select a row — fetch full detail (includes full headers + body)
  const selectRow = useCallback(async (row) => {
    // Optimistically show what we have from the list
    setSelected(row)
    try {
      const detail = await api.getRequest(row.id)
      setSelected(detail)
    } catch {
      // List row is good enough if detail fails
    }
  }, [])

  const clearSelected = useCallback(() => setSelected(null), [])

  // Replay: re-issue the exact same request through the tunnel
  const replay = useCallback(async (row) => {
    setReplayState(s => ({ ...s, [row.id]: 'pending' }))
    try {
      const TUNNEL_DOMAIN = import.meta.env.VITE_TUNNEL_DOMAIN || 'tunnels.com'
      const url = `http://${row.subdomain}.${TUNNEL_DOMAIN}${row.path}`

      // Rebuild headers — strip host so the browser/Vite proxy sets it correctly
      const headers = { ...(row.request_headers || {}) }
      delete headers['host']
      delete headers['content-length'] // will be set by fetch

      const opts = {
        method: row.method,
        headers,
        body: ['GET', 'HEAD', 'OPTIONS'].includes(row.method.toUpperCase())
          ? undefined
          : (row.request_body || undefined),
      }

      // In dev, we can't directly hit subdomain.tunnels.com from localhost.
      // We send to the proxy server with the Host header overridden.
      const proxyUrl = `${import.meta.env.VITE_API_URL || ''}/tunnel-replay`
      const res = await fetch(proxyUrl, {
        ...opts,
        headers: { ...opts.headers, 'x-tunnel-replay-host': `${row.subdomain}.${TUNNEL_DOMAIN}` },
      })
      setReplayState(s => ({ ...s, [row.id]: res.ok ? 'done' : 'error' }))
    } catch {
      setReplayState(s => ({ ...s, [row.id]: 'error' }))
    } finally {
      // Reset replay state after 3 s
      setTimeout(() => setReplayState(s => { const n = { ...s }; delete n[row.id]; return n }), 3000)
      // Refresh list to pick up the replayed request
      setTimeout(refresh, 800)
    }
  }, [refresh])

  return { rows, selected, selectRow, clearSelected, loading, error, lastRefresh, replay, replayState }
}
