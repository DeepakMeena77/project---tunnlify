/**
 * src/lib/api.js
 * ──────────────
 * Thin fetch wrapper for all calls to the Tunnlify backend.
 * Base URL is read from the Vite env var VITE_API_URL (defaults to same origin).
 */

const BASE = import.meta.env.VITE_API_URL || ''

function getToken() {
  return localStorage.getItem('tun_token')
}

async function request(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    ...opts,
  })

  let data
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    data = await res.json()
  } else {
    data = { message: await res.text() }
  }

  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export const api = {
  signup:          (body) => request('POST', '/auth/signup', body),
  login:           (body) => request('POST', '/auth/login', body),
  me:              ()     => request('GET',  '/auth/me'),
  changePassword:  (body) => request('POST', '/auth/change-password', body),
  status:          ()     => request('GET',  '/status'),

  // Billing
  billingUsage:    ()     => request('GET',  '/billing/usage'),
  billingPlans:    ()     => request('GET',  '/billing/plans'),
  createCheckout:  (plan) => request('POST', '/billing/create-checkout', { plan }),

  // Inspector
  listRequests:    (limit = 100) => request('GET', `/auth/requests?limit=${limit}`),
  getRequest:      (id)          => request('GET', `/auth/requests/${id}`),
}
