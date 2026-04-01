import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Progress } from '../components/ui/progress'
import { fetchNui, formatCurrency } from '../lib/utils'
import { X, CreditCard, AlertTriangle } from 'lucide-react'
import type { DealershipData, FinancingAgreement } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

export default function FinancingPage({ data, onClose }: Props) {
  const [agreements, setAgreements] = useState<FinancingAgreement[]>([])
  const [loading, setLoading] = useState(true)

  const loadFinancing = () => {
    setLoading(true)
    fetchNui<FinancingAgreement[]>('getMyFinancing', {}).then((res) => {
      if (Array.isArray(res)) setAgreements(res)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadFinancing() }, [])

  const handlePayment = (financingId: number) => {
    fetchNui('makePayment', { financingId }).then(() => loadFinancing())
  }

  const statusColors: Record<string, string> = {
    active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    defaulted: 'bg-red-500/20 text-red-300 border-red-500/30',
    repossessed: 'bg-red-500/20 text-red-300 border-red-500/30',
  }

  return (
    <>
      <div className="flex items-center justify-between p-5 pb-0">
        <div>
          <h1 className="text-xl font-bold">Financing</h1>
          <p className="text-sm text-muted-foreground">Your vehicle financing agreements</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <Separator className="mt-4" />

      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
        ) : agreements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <CreditCard className="h-10 w-10 mb-2 opacity-50" />
            <p>No financing agreements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agreements.map((agreement) => {
              const paidPercent = agreement.total_amount > 0
                ? Math.round((agreement.amount_paid / agreement.total_amount) * 100)
                : 0
              const remaining = agreement.total_amount - agreement.amount_paid

              return (
                <Card key={agreement.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{agreement.vehicle_label || agreement.vehicle_plate}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{agreement.vehicle_plate}</p>
                      </div>
                      <Badge className={`${statusColors[agreement.status] || ''} capitalize`}>
                        {agreement.status}
                      </Badge>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Paid: {formatCurrency(agreement.amount_paid)}</span>
                        <span>{formatCurrency(agreement.total_amount)}</span>
                      </div>
                      <Progress value={paidPercent} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Payment</p>
                        <p className="font-medium">{formatCurrency(agreement.installment_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Remaining</p>
                        <p className="font-medium">{formatCurrency(remaining)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Interest</p>
                        <p className="font-medium">{Math.round(agreement.interest_rate * 100)}%</p>
                      </div>
                    </div>

                    {agreement.missed_payments > 0 && (
                      <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{agreement.missed_payments} missed payment{agreement.missed_payments > 1 ? 's' : ''}</span>
                      </div>
                    )}

                    {agreement.status === 'active' && (
                      <Button className="w-full mt-3" size="sm" onClick={() => handlePayment(agreement.id)}>
                        Make Payment ({formatCurrency(agreement.installment_amount)})
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </>
  )
}
