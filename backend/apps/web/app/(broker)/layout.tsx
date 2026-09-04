'use client'

import React from 'react'
import { BrokerNav } from '@/components/layout/BrokerNav/BrokerNav'

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrokerNav userLabel="Broker" userRole="BROKER">
      {children}
    </BrokerNav>
  )
}
