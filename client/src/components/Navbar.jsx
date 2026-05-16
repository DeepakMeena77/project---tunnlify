import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  const linkClass = ({ isActive }) =>
    `whitespace-nowrap text-sm font-medium transition-colors duration-150 ${
      isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'
    }`

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 min-h-14 py-3 flex flex-col items-start gap-3 md:h-14 md:flex-row md:items-center md:justify-between md:py-0">

        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2 text-gray-900 font-semibold text-sm">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-900">
            <rect x="1" y="5" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9 9h4M13 9l2.5 1-2.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="14" y="7" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Tunnlify
        </Link>

        {/* Nav links */}
        <nav className="flex w-full min-w-0 max-w-full flex-none items-center justify-start gap-3 overflow-x-auto md:w-auto md:flex-1 md:justify-end md:gap-6">
          {user ? (
            <>
              <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              <NavLink to="/settings"  className={linkClass}>Settings</NavLink>
              <button
                onClick={handleLogout}
                className="whitespace-nowrap text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors duration-150"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login"  className={linkClass}>Log in</NavLink>
              <Link to="/signup" className="btn-primary btn-sm">
                Start free
              </Link>
            </>
          )}
        </nav>

      </div>
    </header>
  )
}
