import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const [form, setForm]         = useState({ email: '', password: '' })
  const [errors, setErrors]     = useState({})
  const [serverErr, setServerErr] = useState('')
  const [loading, setLoading]   = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setErrors(er => ({ ...er, [e.target.name]: '' }))
    setServerErr('')
  }

  function validate() {
    const errs = {}
    if (!form.email.trim())  errs.email    = 'Email is required'
    if (!form.password)      errs.password = 'Password is required'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      await login(form.email.trim(), form.password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // 401 → wrong credentials; show same message to avoid user enumeration
      setServerErr('Incorrect email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200 h-14 flex items-center px-6">
        <Link to="/" className="text-sm font-semibold text-gray-900">Tunnlify</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-gray-900 underline underline-offset-2 hover:no-underline">
                Sign up free
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
              <label htmlFor="login-email" className="label">Email address</label>
              <input
                id="login-email"
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
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-password" className="label !mb-0">Password</label>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                placeholder="Your password"
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
              {loading ? <Spinner /> : 'Log in'}
            </button>
          </form>

        </div>
      </main>
    </div>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}
