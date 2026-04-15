import { useState, useEffect, useCallback } from 'react'
import { useNuiEvent } from './hooks/useNuiEvent'
import { closeNui, fetchNui, hexToHSL } from './lib/utils'
import type { PageType, DealershipData, NPCProfile } from './types'

import DashboardPage from './pages/DashboardPage'
import StockPage from './pages/StockPage'
import CatalogPage from './pages/CatalogPage'
import SalesPage from './pages/SalesPage'
import EmployeesPage from './pages/EmployeesPage'
import FinancesPage from './pages/FinancesPage'
import FinancingPage from './pages/FinancingPage'
import CouponsPage from './pages/CouponsPage'
import NegotiationPage from './pages/NegotiationPage'
import AdminPage from './pages/AdminPage'
import ManagementPage from './pages/ManagementPage'
import PhotoBoothPage from './pages/PhotoBoothPage'
import ShowroomPage from './pages/ShowroomPage'
import NpcShowroomPage from './pages/NpcShowroomPage'
import AuctionPage from './pages/AuctionPage'
import InteractText from './components/InteractText'
import { PickleFaxDialog } from './components/PickleFax'

function App() {
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState<PageType | null>(null)
  const [data, setData] = useState<DealershipData | null>(null)
  const [npcProfile, setNpcProfile] = useState<NPCProfile | null>(null)
  const [npcGreeting, setNpcGreeting] = useState('')
  const [openKey, setOpenKey] = useState(0)

  useNuiEvent('open', (payload: { page: PageType; data: DealershipData; accentColor?: string }) => {
    setPage(payload.page)
    setData(payload.data)
    setVisible(true)
    setOpenKey((k) => k + 1)

    if (payload.accentColor) {
      const hsl = hexToHSL(payload.accentColor)
      document.documentElement.style.setProperty('--accent', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
      document.documentElement.style.setProperty('--ring', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
    }
  })

  useNuiEvent('close', () => {
    setVisible(false)
    setPage(null)
    setData(null)
    setNpcProfile(null)
  })

  useNuiEvent('openNPCNegotiation', (payload: { profile: NPCProfile; greeting: string; accentColor?: string }) => {
    setNpcProfile(payload.profile)
    setNpcGreeting(payload.greeting)
    setPage('negotiation')
    setVisible(true)
    if (payload.accentColor) {
      const hsl = hexToHSL(payload.accentColor)
      document.documentElement.style.setProperty('--accent', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
      document.documentElement.style.setProperty('--ring', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
    }
  })

  useNuiEvent('closeNPCNegotiation', () => {
    setVisible(false)
    setPage(null)
    setNpcProfile(null)
  })

  useNuiEvent('openNPCShowroom', (payload: { profile: NPCProfile; greeting: string; dealershipId: number; location: string; dealershipName: string; accentColor?: string }) => {
    setNpcProfile(payload.profile)
    setNpcGreeting(payload.greeting)
    setData({
      dealershipId: payload.dealershipId,
      dealershipName: payload.dealershipName,
      location: payload.location,
      role: 'salesperson',
      tier: 1,
    } as DealershipData)
    setPage('npcShowroom')
    setVisible(true)
    setOpenKey((k) => k + 1)
    if (payload.accentColor) {
      const hsl = hexToHSL(payload.accentColor)
      document.documentElement.style.setProperty('--accent', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
      document.documentElement.style.setProperty('--ring', `${hsl.h} ${hsl.s}% ${hsl.l}%`)
    }
  })

  useNuiEvent('closeNPCShowroom', () => {
    setVisible(false)
    setPage(null)
    setNpcProfile(null)
    setData(null)
  })

  const handleClose = useCallback(() => {
    setVisible(false)
    setPage(null)
    setData(null)
    setNpcProfile(null)
    closeNui()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        if (page === 'photoBooth') {
          fetchNui('photoBoothCancel', {})
        } else if (page === 'showroom') {
          fetchNui('showroomClose', {})
        } else if (page === 'auction') {
          fetchNui('auctionClose', {})
        } else if (page === 'negotiation' || page === 'npcShowroom') {
          fetchNui('dismissNPC', {})
        } else {
          handleClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, page, handleClose])

  const renderPage = () => {
    if (!visible || !page) return null
    if (!data && page !== 'negotiation') return null

    const props = { data: data!, onClose: handleClose }

    switch (page) {
      case 'dashboard':
        return <DashboardPage {...props} />
      case 'stock':
        return <StockPage {...props} />
      case 'catalog':
        return <CatalogPage {...props} />
      case 'sales':
      case 'vehicleDetails':
        return <SalesPage {...props} />
      case 'employees':
        return <EmployeesPage {...props} />
      case 'finances':
        return <FinancesPage {...props} />
      case 'financing':
        return <FinancingPage {...props} />
      case 'coupons':
        return <CouponsPage {...props} />
      case 'negotiation':
        return <NegotiationPage profile={npcProfile} greeting={npcGreeting} onClose={handleClose} />
      case 'npcShowroom':
        return <NpcShowroomPage data={data!} profile={npcProfile} greeting={npcGreeting} onClose={handleClose} />
      case 'management':
        return <ManagementPage {...props} />
      case 'admin':
        return <AdminPage {...props} />
      case 'photoBooth':
        return <PhotoBoothPage {...props} />
      case 'showroom':
        return <ShowroomPage {...props} />
      case 'auction':
        return <AuctionPage {...props} />
      case 'pickleFax':
        return data?.stockId ? <PickleFaxDialog stockId={data.stockId} mode="customer" onClose={handleClose} /> : null
      default:
        return null
    }
  }

  return (
    <>
      <InteractText />
      {visible && page && (
        page === 'photoBooth' || page === 'showroom' || page === 'negotiation' || page === 'npcShowroom' || page === 'pickleFax' || page === 'auction' ? (
          <div key={openKey} className="fixed inset-0 z-50">
            {renderPage()}
          </div>
        ) : (
          <div key={openKey} className="fixed inset-0 flex items-center justify-center p-8 z-50">
            <div className="relative w-full max-w-5xl h-[50vh] bg-background border border-border rounded-xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
              {renderPage()}
            </div>
          </div>
        )
      )}
    </>
  )
}

export default App
