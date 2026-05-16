import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar'
import StatCard from '../components/StatCard'
import { CopyButton } from '../components/CopyButton'
import RequestInspector from '../components/RequestInspector'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { DEFAULT_PLANS, formatPlanPrice } from '../lib/billing'

const API_BASE          = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TUNNEL_DOMAIN     = import.meta.env.VITE_TUNNEL_DOMAIN || 'tunnels.com'
const TUNNEL_PROTOCOL   = import.meta.env.VITE_TUNNEL_PROTOCOL || 'http'
const TUNNEL_URL_MODE   = import.meta.env.VITE_TUNNEL_URL_MODE || 'subdomain'
const TUNNEL_BASE_URL   = (import.meta.env.VITE_TUNNEL_BASE_URL || API_BASE).replace(/\/$/, '')
const TUNNEL_SERVER_URL = import.meta.env.VITE_TUNNEL_SERVER_URL || apiUrlToWsUrl(API_BASE)
const POLL_MS           = 3000

function apiUrlToWsUrl(url) {
  return url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
}

function buildPublicUrl(subdomain) {
  if (TUNNEL_URL_MODE === 'path' && TUNNEL_BASE_URL) {
    return `${TUNNEL_BASE_URL}/t/${encodeURIComponent(subdomain)}`
  }
  return `${TUNNEL_PROTOCOL}://${subdomain}.${TUNNEL_DOMAIN}`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const subdomain = user?.subdomain ?? ''
  const publicUrl = buildPublicUrl(subdomain)

  const [tab,        setTab]      = useState('overview')   // 'overview' | 'inspector'
  const [online,     setOnline]   = useState(false)
  const [reqMin,     setReqMin]   = useState(0)
  const [uptime,     setUptime]   = useState(null)
  const [usage,      setUsage]    = useState({
    plan: user?.plan ?? 'free',
    plan_label: user?.plan ?? 'Free',
    active_tunnels: 0,
    tunnel_limit: user?.plan_limit ?? 1,
    at_limit: false,
    plans: DEFAULT_PLANS,
  })
  const [checkoutPlan, setCheckoutPlan] = useState(null)
  const [checkoutError, setCheckoutError] = useState('')

  const requestTimes = useRef([])

  // ── Status poll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const data = await api.status()
        if (!cancelled) setUptime(data.uptime)
      } catch {}

      try {
        const data = await api.billingUsage()
        if (!cancelled) {
          setUsage({ ...data, plans: data.plans?.length ? data.plans : DEFAULT_PLANS })
          setOnline(data.active_tunnels > 0)
        }
      } catch {
        if (!cancelled) setOnline(false)
      }
    }
    poll()
    const t = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // ── Simulated req/min (replaced by real data in Inspector tab) ──────────────
  useEffect(() => {
    if (!online) { setReqMin(0); return }
    const t = setInterval(() => {
      const now   = Date.now()
      const count = Math.floor(Math.random() * 6)
      for (let i = 0; i < count; i++) requestTimes.current.push(now - Math.random() * 5000)
      requestTimes.current = requestTimes.current.filter(ts => now - ts < 60_000)
      setReqMin(requestTimes.current.length)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [online])

  const uptimeStr = uptime != null
    ? uptime < 60   ? `${uptime}s`
    : uptime < 3600 ? `${Math.floor(uptime / 60)}m`
    : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : '—'

  const tunnelCmd = `tunnel start${TUNNEL_SERVER_URL ? ` --server ${TUNNEL_SERVER_URL}` : ''} --port 3000 --subdomain ${subdomain} --token ${user?.api_token ?? '...'}`
  const activeTunnels = usage.active_tunnels ?? 0
  const tunnelLimit = usage.tunnel_limit ?? 1
  const planLabel = usage.plan_label || usage.plan || 'Free'

  async function handleUpgrade(plan) {
    setCheckoutError('')
    setCheckoutPlan(plan)
    try {
      const session = await api.createCheckout(plan)
      if (session.url) {
        window.location.href = session.url
        return
      }
      setCheckoutError('Stripe Checkout did not return a redirect URL.')
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout')
    } finally {
      setCheckoutPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-6 sm:px-6 md:py-10 md:space-y-8">

        {/* Page header */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">Monitor your tunnel and inspect live traffic.</p>
        </div>

        {usage.at_limit && (
          <UpgradePrompt
            usage={usage}
            loadingPlan={checkoutPlan}
            error={checkoutError}
            onUpgrade={handleUpgrade}
          />
        )}

        {/* Tunnel URL card */}
        <div className="card-md space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span className="text-sm font-medium text-gray-700">Your tunnel URL</span>
            <StatusBadge online={online} />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <GlobeIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm font-mono text-gray-800 truncate">{publicUrl}</span>
            </div>
            <CopyButton text={publicUrl} label="Copy URL" className="w-full md:w-auto" />
            <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm w-full shrink-0 md:w-auto">
              Open ↗
            </a>
          </div>

          {!online && (
            <div className="rounded-md bg-gray-950 p-3 md:p-4">
              <p className="text-xs text-gray-500 mb-2 font-mono">Run this command to activate your tunnel:</p>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <code className="block min-w-0 overflow-x-auto whitespace-nowrap text-sm text-gray-100 font-mono">{tunnelCmd}</code>
                <CopyButton text={tunnelCmd}
                  className="w-full shrink-0 !border-gray-700 !text-gray-400 hover:!bg-gray-800 hover:!text-gray-200 md:w-auto" />
              </div>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Status">
            <StatusBadge online={online} large />
          </StatCard>
          <StatCard
            label="Active tunnels"
            value={`${activeTunnels}/${tunnelLimit}`}
            sub={`${planLabel} plan`}
          />
          <StatCard label="Requests / min" value={reqMin}
            sub={online ? 'Live traffic' : 'Tunnel offline'} />
          <StatCard label="Server uptime" value={uptimeStr} sub="Since last restart" />
        </div>

        {/* ── Tabbed panel ───────────────────────────────────────────────────── */}
        <div>
          {/* Tab bar */}
          <div className="mb-0 flex overflow-x-auto border-b border-gray-200">
            <TabBtn active={tab === 'overview'}  onClick={() => setTab('overview')}>
              Overview
            </TabBtn>
            <TabBtn active={tab === 'inspector'} onClick={() => setTab('inspector')}>
              <span className="flex items-center gap-1.5">
                Inspector
                {online && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
              </span>
            </TabBtn>
          </div>

          {/* Overview tab */}
          {tab === 'overview' && (
            <div className="card overflow-hidden rounded-t-none border-t-0">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Recent requests</span>
                {online && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              {online ? <SimulatedFeed /> : <EmptyRequests publicUrl={publicUrl} onInspect={() => setTab('inspector')} />}
            </div>
          )}

          {/* Inspector tab */}
          {tab === 'inspector' && (
            <div className="rounded-b-lg overflow-hidden border border-gray-200 border-t-0">
              <RequestInspector />
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function UpgradePrompt({ usage, loadingPlan, error, onUpgrade }) {
  const plans = usage.plans?.length ? usage.plans : DEFAULT_PLANS
  const nextPlans = plans.filter(p => p.tunnel_limit > usage.tunnel_limit)
  const tunnelNoun = usage.tunnel_limit === 1 ? 'active tunnel' : 'active tunnels'
  const hasCheckout = nextPlans.some(plan => plan.checkout_enabled)

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">Tunnel limit reached</p>
          <p className="mt-1 text-sm text-amber-800">
            You are using {usage.active_tunnels} of {usage.tunnel_limit} {tunnelNoun} on the {usage.plan_label || usage.plan} plan.
          </p>
          {!hasCheckout && nextPlans.length > 0 && (
            <p className="mt-1 text-sm text-amber-800">Higher limits are coming soon.</p>
          )}
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>

        {nextPlans.length > 0 ? (
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
            {nextPlans.map(plan => plan.checkout_enabled ? (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => onUpgrade(plan.key)}
                  disabled={!!loadingPlan}
                  className="btn-primary btn-sm w-full whitespace-nowrap md:w-auto"
                >
                  {loadingPlan === plan.key ? 'Opening...' : `${plan.label} ${formatPlanPrice(plan)}`}
                </button>
              ) : (
                <span key={plan.key} className="badge-gray justify-center whitespace-nowrap">
                  {plan.label} coming soon
                </span>
              )
            )}
          </div>
        ) : (
          <span className="badge-gray">Team limit</span>
        )}
      </div>
    </section>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
        ${active
          ? 'border-gray-900 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'}`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ online, large }) {
  return (
    <span className={online ? 'badge-green' : 'badge-gray'}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

// Simulated feed shown on Overview tab when tunnel is live
const METHODS  = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const PATHS    = ['/api/users', '/api/data', '/health', '/api/items/1', '/webhook', '/api/v2/orders']
const STATUSES = [200, 200, 200, 201, 204, 301, 400, 404, 500]

function randomEntry() {
  return {
    id:      Math.random().toString(36).slice(2),
    method:  METHODS[Math.floor(Math.random() * METHODS.length)],
    path:    PATHS[Math.floor(Math.random() * PATHS.length)],
    status:  STATUSES[Math.floor(Math.random() * STATUSES.length)],
    ms:      Math.floor(Math.random() * 150) + 5,
    time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

function SimulatedFeed() {
  const [entries, setEntries] = useState(() => Array.from({ length: 5 }, randomEntry))
  useEffect(() => {
    const t = setInterval(() => {
      if (Math.random() > 0.5) setEntries(p => [randomEntry(), ...p].slice(0, 20))
    }, 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="max-h-72 overflow-x-auto overflow-y-auto divide-y divide-gray-100">
      {entries.map(e => (
        <div key={e.id} className="flex min-w-[34rem] items-center gap-4 px-5 py-2.5 text-xs font-mono transition-colors hover:bg-gray-50">
          <span className="text-gray-400 w-20 shrink-0">{e.time}</span>
          <MethodBadge method={e.method} />
          <span className="text-gray-700 flex-1 truncate">{e.path}</span>
          <StatusCode code={e.status} />
          <span className="text-gray-400 w-14 text-right shrink-0">{e.ms}ms</span>
        </div>
      ))}
    </div>
  )
}

function EmptyRequests({ publicUrl, onInspect }) {
  return (
    <div className="px-5 py-14 text-center space-y-2">
      <p className="text-sm text-gray-400">No requests yet.</p>
      <p className="text-xs text-gray-400">
        Start your tunnel and visit{' '}
        <span className="break-all font-mono text-gray-600">{publicUrl}</span>
      </p>
      <button type="button" onClick={onInspect} className="btn-secondary btn-sm mt-2">
        Open Inspector
      </button>
    </div>
  )
}

function MethodBadge({ method }) {
  const colors = {
    GET:    'text-blue-700 bg-blue-50',
    POST:   'text-green-700 bg-green-50',
    PUT:    'text-yellow-700 bg-yellow-50',
    PATCH:  'text-orange-700 bg-orange-50',
    DELETE: 'text-red-700 bg-red-50',
  }
  return (
    <span className={`inline-block w-14 text-center px-1.5 py-0.5 rounded text-xs font-semibold ${colors[method] ?? 'text-gray-700 bg-gray-100'}`}>
      {method}
    </span>
  )
}

function StatusCode({ code }) {
  const color = code < 300 ? 'text-green-700' : code < 400 ? 'text-blue-600' : code < 500 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`w-10 shrink-0 text-right font-semibold ${color}`}>{code}</span>
}

function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M5.5 8c0-2 1-3.5 2.5-3.5S10.5 6 10.5 8s-1 3.5-2.5 3.5S5.5 10 5.5 8Z"/>
      <line x1="1.5" y1="8" x2="14.5" y2="8"/>
    </svg>
  )
}
