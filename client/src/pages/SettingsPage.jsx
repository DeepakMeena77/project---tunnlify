import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { CopyButton } from '../components/CopyButton'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { DEFAULT_PLANS, formatPlanPrice } from '../lib/billing'

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()

  useEffect(() => {
    refreshUser?.().catch(() => {})
  }, [refreshUser])

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 space-y-8">

        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage your account and API credentials.</p>
        </div>

        {/* Account info */}
        <section className="card-md space-y-5">
          <h2 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Account</h2>

          <Row label="Email">{user?.email}</Row>
          <Row label="Plan">
            <span className="badge-gray capitalize">{user?.plan ?? 'free'}</span>
          </Row>
          <Row label="Subdomain">
            <code className="code-inline">{user?.subdomain}</code>
          </Row>
          <Row label="Member since">
            {user?.created_at
              ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
              : '—'}
          </Row>
        </section>

        {/* Billing */}
        <BillingPlans currentPlan={user?.plan ?? 'free'} />

        {/* API token */}
        <section className="card-md space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">API Token</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Pass this as <code className="code-inline">--token</code> when starting the tunnel CLI.
              Keep it secret.
            </p>
          </div>

          <TokenDisplay token={user?.api_token ?? ''} />
        </section>

        {/* Change password */}
        <section className="card-md space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Your new password must be at least 8 characters.
            </p>
          </div>

          <ChangePasswordForm />
        </section>

      </main>
    </div>
  )
}

// ── Billing plans ──────────────────────────────────────────────────────────────

function BillingPlans({ currentPlan }) {
  const [plans, setPlans] = useState(DEFAULT_PLANS)
  const [loadingPlan, setLoadingPlan] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.billingUsage()
      .then(data => setPlans(data.plans?.length ? data.plans : DEFAULT_PLANS))
      .catch(() => setPlans(DEFAULT_PLANS))
  }, [])

  async function handleCheckout(plan) {
    setMessage('')
    setLoadingPlan(plan)
    try {
      const session = await api.createCheckout(plan)
      if (session.url) {
        window.location.href = session.url
        return
      }
      setMessage('Stripe Checkout did not return a redirect URL.')
    } catch (err) {
      setMessage(err.message || 'Could not start checkout')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Billing</h2>
        <p className="mt-0.5 text-xs text-gray-500">Choose a monthly plan for active tunnel capacity.</p>
      </div>

      {message && (
        <div className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map(plan => {
          const isCurrent = plan.key === currentPlan
          const isPaid = plan.key !== 'free'
          const canCheckout = Boolean(plan.checkout_enabled)
          const price = formatPlanPrice(plan)
          return (
            <div key={plan.key} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{plan.label}</h3>
                  {isCurrent && <span className="badge-gray">Current</span>}
                </div>

                {price === 'Free' ? (
                  <p className="mt-2 text-2xl font-semibold text-gray-900">Free</p>
                ) : (
                  <div className="mt-2">
                    {/* Original price — struck through */}
                    <p className="text-lg font-medium text-gray-400 line-through leading-none">
                      {price.replace('/mo', '')}
                      <span className="text-sm font-normal">/mo</span>
                    </p>
                    {/* Testing-phase label */}
                    <p className="mt-1 flex items-center gap-1.5">
                      <span className="text-2xl font-semibold text-emerald-600">Free</span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          padding: '2px 6px',
                          borderRadius: '999px',
                          background: '#d1fae5',
                          color: '#065f46',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Testing phase
                      </span>
                    </p>
                  </div>
                )}

                <p className="mt-1 text-sm text-gray-500">
                  {plan.tunnel_limit} active {plan.tunnel_limit === 1 ? 'tunnel' : 'tunnels'}
                </p>
              </div>

              <button
                type="button"
                disabled={isCurrent || !isPaid || !!loadingPlan}
                onClick={() => isPaid && canCheckout && handleCheckout(plan.key)}
                className={isCurrent || !isPaid ? 'btn-secondary btn-sm w-full' : 'btn-secondary btn-sm w-full'}
                style={isPaid && !isCurrent ? { borderColor: '#6ee7b7', color: '#065f46', background: '#ecfdf5' } : {}}
              >
                {isCurrent ? 'Current plan' : !isPaid ? 'Included' : 'Free for now'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Token display ──────────────────────────────────────────────────────────────

function TokenDisplay({ token }) {
  const [revealed, setRevealed] = useState(false)

  const display = revealed
    ? token
    : token.slice(0, 7) + '•'.repeat(Math.max(0, token.length - 7))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-md overflow-hidden">
          <code className="text-sm font-mono text-gray-800 flex-1 truncate select-all">
            {display}
          </code>
        </div>

        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          className="btn-secondary btn-sm shrink-0"
          aria-label={revealed ? 'Hide token' : 'Reveal token'}
        >
          {revealed ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
          {revealed ? 'Hide' : 'Reveal'}
        </button>

        <CopyButton text={token} label="Copy" className="shrink-0" />
      </div>

      <p className="text-xs text-gray-400">
        Use this in your tunnel CLI:{' '}
        <code className="code-inline">tunnel start --token {token.slice(0, 10)}…</code>
      </p>
    </div>
  )
}

// ── Change password form ───────────────────────────────────────────────────────

function ChangePasswordForm() {
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors]   = useState({})
  const [status, setStatus]   = useState(null)  // 'success' | 'error'
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setErrors(er => ({ ...er, [e.target.name]: '' }))
    setStatus(null)
  }

  function validate() {
    const errs = {}
    if (!form.current)             errs.current  = 'Current password is required'
    if (!form.next)                errs.next     = 'New password is required'
    else if (form.next.length < 8) errs.next     = 'Must be at least 8 characters'
    if (form.next !== form.confirm) errs.confirm  = 'Passwords do not match'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      await api.changePassword({ currentPassword: form.current, newPassword: form.next })
      setStatus('success')
      setMessage('Password changed successfully.')
      setForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 max-w-sm">
      {status && (
        <div className={`px-4 py-3 rounded-md border text-sm ${
          status === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <div>
        <label htmlFor="pw-current" className="label">Current password</label>
        <input
          id="pw-current"
          name="current"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={handleChange}
          className={`input ${errors.current ? 'input-error' : ''}`}
          disabled={loading}
        />
        {errors.current && <p className="field-error">{errors.current}</p>}
      </div>

      <div>
        <label htmlFor="pw-next" className="label">New password</label>
        <input
          id="pw-next"
          name="next"
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={handleChange}
          className={`input ${errors.next ? 'input-error' : ''}`}
          disabled={loading}
        />
        {errors.next && <p className="field-error">{errors.next}</p>}
      </div>

      <div>
        <label htmlFor="pw-confirm" className="label">Confirm new password</label>
        <input
          id="pw-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={handleChange}
          className={`input ${errors.confirm ? 'input-error' : ''}`}
          disabled={loading}
        />
        {errors.confirm && <p className="field-error">{errors.confirm}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary"
      >
        {loading ? <Spinner /> : 'Change password'}
      </button>
    </form>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{children}</span>
    </div>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

function EyeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  )
}

function EyeOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5"/>
      <path d="M4.1 4.2C2.3 5.3 1 8 1 8s2.5 5 7 5c1.4 0 2.6-.4 3.6-1M7 3.1C7.3 3 7.7 3 8 3c4.5 0 7 5 7 5s-.6 1.2-1.6 2.4"/>
    </svg>
  )
}
