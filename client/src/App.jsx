import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute  from './components/ProtectedRoute'

import LandingPage   from './pages/LandingPage'
import SignupPage    from './pages/SignupPage'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage  from './pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/"       element={<LandingPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login"  element={<LoginPage />} />

        {/* Protected — requires valid JWT */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
