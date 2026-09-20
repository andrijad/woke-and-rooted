import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <p style={{ padding: 20 }}>Učitavanje...</p>
  if (!session) return <Navigate to="/login" replace />
  if (adminOnly && !profile?.is_admin) return <Navigate to="/" replace />

  return children
}