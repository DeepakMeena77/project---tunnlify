import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [errors, setErrors]   = useState({})
  const [serverErr, setServerErr] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setErrors(er => ({ ...er, [e.target.name]: '' }))
    setServerErr('')
  }

  function validate() {
    const errs = {}
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email'
    if (!form.password)         errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      await signup(form.email.trim(), form.password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerErr(err.message || 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header */}
      <header className="border-b border-gray-200 h-14 flex items-center px-4 sm:px-6">
        <Link to="/" className="text-sm font-semibold text-gray-900">Tunnlify</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-sm">

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              Already have one?{' '}
              <Link to="/login" className="font-medium text-gray-900 underline underline-offset-2 hover:no-underline">
                Log in
              </Link>
            </p>
          </div>

          {serverErr && (
            <div className="mb-5 px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
              {serverErr}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="signup-email" className="label">Email address</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className={`input ${errors.email ? 'input-error' : ''}`}
                disabled={loading}
              />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="signup-password" className="label">Password</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                placeholder="At least 8 characters"
                className={`input ${errors.password ? 'input-error' : ''}`}
                disabled={loading}
              />
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 mt-1"
            >
              {loading ? <Spinner /> : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-xs text-gray-400 text-center">
            By signing up you agree to our{' '}
            <span className="underline cursor-pointer hover:text-gray-600">Terms</span>
            {' '}and{' '}
            <span className="underline cursor-pointer hover:text-gray-600">Privacy Policy</span>.
          </p>

        </div>
      </main>
    </div>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}
