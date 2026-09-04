import type { Metadata } from 'next'
import { BrokerDashboard } from './BrokerDashboard'

export const metadata: Metadata = {
  title: 'Dashboard | Broker',
  description: 'Broker portal dashboard',
}

export default function BrokerDashboardPage() {
  return <BrokerDashboard />
}
