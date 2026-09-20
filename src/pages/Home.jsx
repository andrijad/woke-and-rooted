import { useAuth } from '../context/AuthContext'
import MemberHome from './MemberHome'
import AdminHome from './AdminHome'

export default function Home() {
  const { profile } = useAuth()
  return profile?.is_admin ? <AdminHome /> : <MemberHome />
}