import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useNuiEvent } from '@/hooks/useNuiEvent'
import { fetchNui, isEnvBrowser } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CatalogPage } from '@/pages/CatalogPage'
import { StockPage } from '@/pages/StockPage'
import SalesPage from '@/pages/SalesPage'
import EmployeesPage from '@/pages/EmployeesPage'
import FinancesPage from '@/pages/FinancesPage'
import DashboardPage from '@/pages/DashboardPage'
import CouponsPage from '@/pages/CouponsPage'
import NegotiationPage from '@/pages/NegotiationPage'
import AdminPage from '@/pages/AdminPage'
import FinancingPage from '@/pages/FinancingPage'
import type { PageType } from '@/types'

interface OpenData {
  page: PageType
  data?: Record<string, unknown>
  [key: string]: unknown
}

const PAGE_TITLES: Record<string, string> = {
  catalog: 'Vehicle Catalog',
  stock: 'Stock Management',
  sales: 'Sales Tablet',
  employees: 'Employees',
  finances: 'Finances',
  dashboard: 'Dashboard',
  coupons: 'Promotions',
  negotiation: 'Customer Negotiation',
  admin: 'Admin Panel',
  financing: 'My Financing',
}

function App() {
  const [visible, setVisible] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageType>(null)
  const [pageData, setPageData] = useState<Record<string, unknown>>({})

  useNuiEvent<OpenData>('open', (incoming) => {
    setVisible(true)
    setCurrentPage(incoming.page)
    setPageData(incoming.data ?? incoming)
  })

  useNuiEvent('close', () => {
    setVisible(false)
    setCurrentPage(null)
  })

  const handleClose = useCallback(() => {
    setVisible(false)
    setCurrentPage(null)
    fetchNui('close')
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, handleClose])

  useEffect(() => {
    if (isEnvBrowser()) {
      setVisible(true)
      setCurrentPage('admin')
      setPageData({
        dealershipId: 1,
        dealershipName: 'Dev Dealership',
        tier: 3,
        role: 'owner',
      })
    }
  }, [])

  if (!visible) return null

  const renderPage = () => {
    const d = pageData as any
    switch (currentPage) {
      case 'catalog':    return <CatalogPage data={d} />
      case 'stock':      return <StockPage data={d} />
      case 'sales':      return <SalesPage data={d} />
      case 'employees':  return <EmployeesPage data={d} />
      case 'finances':   return <FinancesPage data={d} />
      case 'dashboard':  return <DashboardPage data={d} />
      case 'coupons':    return <CouponsPage data={d} />
      case 'negotiation': return <NegotiationPage data={d} />
      case 'admin':      return <AdminPage data={d} />
      case 'financing':  return <FinancingPage data={d} />
      default:           return null
    }
  }

  const title = currentPage ? PAGE_TITLES[currentPage] ?? '' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Main Container */}
      <div className="glass rounded-2xl max-w-5xl w-full max-h-[80vh] mx-4 flex flex-col overflow-hidden animate-fadeIn relative z-10">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
          <h1 className="text-lg font-semibold gradient-text tracking-tight">
            {title}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

export default App
