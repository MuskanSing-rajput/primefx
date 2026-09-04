import type { Metadata } from 'next'
import { AdminDashboard } from './AdminDashboard'

export const metadata: Metadata = {
  title: 'Dashboard | Admin',
  description: 'PrimeFX administration dashboard',
}

export default function AdminDashboardPage() {
  return <AdminDashboard />
}
