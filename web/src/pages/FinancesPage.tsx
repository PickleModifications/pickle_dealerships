import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { fetchNui, formatCurrency } from '../lib/utils'
import { Skeleton, SkeletonList } from '../components/ui/skeleton'
import { t } from '../lib/locale'
import { X, ArrowUpRight, ArrowDownLeft, DollarSign, Receipt } from 'lucide-react'
import type { DealershipData, LedgerEntry } from '../types'

interface Props {
  data: DealershipData
  onClose: () => void
}

interface FinancesData {
  balance: number
  ledger: LedgerEntry[]
}

export default function FinancesPage({ data, onClose }: Props) {
  const [finances, setFinances] = useState<FinancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [amount, setAmount] = useState('')

  const loadFinances = () => {
    setLoading(true)
    fetchNui<{ success: boolean; data: FinancesData }>('getDealershipFinances', {
      dealershipId: data.dealershipId,
    }).then((res) => {
      if (res.success && res.data) setFinances(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { loadFinances() }, [data.dealershipId])

  const handleWithdraw = () => {
    const val = parseInt(amount)
    if (!val || val <= 0) return
    fetchNui<{ success: boolean; newBalance: number }>('withdrawFunds', {
      dealershipId: data.dealershipId,
      amount: val,
    }).then((res) => {
      if (res.success) {
        setFinances((prev) => prev ? { ...prev, balance: res.newBalance } : prev)
      }
      setWithdrawOpen(false)
      setAmount('')
      loadFinances()
    })
  }

  const handleDeposit = () => {
    const val = parseInt(amount)
    if (!val || val <= 0) return
    fetchNui<{ success: boolean; newBalance: number }>('depositFunds', {
      dealershipId: data.dealershipId,
      amount: val,
    }).then((res) => {
      if (res.success) {
        setFinances((prev) => prev ? { ...prev, balance: res.newBalance } : prev)
      }
      setDepositOpen(false)
      setAmount('')
      loadFinances()
    })
  }

  const ledgerTypeColors: Record<string, string> = {
    sale: 'text-emerald-400',
    purchase: 'text-red-400',
    withdrawal: 'text-orange-400',
    deposit: 'text-blue-400',
    commission: 'text-yellow-400',
    tax: 'text-red-400',
    upgrade: 'text-purple-400',
  }

  const canWithdraw = data.role === 'owner' || data.role === 'admin'

  return (
    <>
      {!data.embedded && (
        <>
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h1 className="text-xl font-bold">{t('tab_finances')}</h1>
              <p className="text-sm text-muted-foreground">{data.dealershipName}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Separator className="mt-4" />
        </>
      )}

      <div className="relative flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 p-5">
        {loading ? (
          <div className="space-y-5"><div className="rounded-lg border border-border bg-card p-5"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-8 w-48" /></div><SkeletonList count={5} /></div>
        ) : !finances ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">{t('finances_failed_to_load')}</div>
        ) : (
          <div className="space-y-5">
            <Card className="border-accent/30">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-4 w-4" /> {t('finances_dealership_balance')}
                    </p>
                    <p className="text-3xl font-bold mt-1">{formatCurrency(finances.balance)}</p>
                  </div>
                  <div className="flex gap-2">
                    {canWithdraw && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => { setWithdrawOpen(true); setAmount('') }}>
                        <ArrowUpRight className="h-4 w-4" /> {t('finances_withdraw')}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => { setDepositOpen(true); setAmount('') }}>
                      <ArrowDownLeft className="h-4 w-4" /> {t('finances_deposit')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> {t('finances_transaction_history')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {finances.ledger.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('finances_no_transactions')}</p>
                ) : (
                  <div className="space-y-2">
                    {finances.ledger.slice(0, 50).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleDateString()} &mdash;
                            <Badge variant="outline" className="ml-1 text-[10px]">{t('ledger_type_' + entry.type) !== 'ledger_type_' + entry.type ? t('ledger_type_' + entry.type) : entry.type.replace(/_/g, ' ')}</Badge>
                          </p>
                        </div>
                        <p className={`font-medium text-sm ml-3 ${entry.amount >= 0 ? 'text-emerald-400' : (ledgerTypeColors[entry.type] || 'text-red-400')}`}>
                          {entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </ScrollArea>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent onClose={() => setWithdrawOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t('finances_withdraw_funds')}</DialogTitle>
            <DialogDescription>{t('finances_withdraw_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('finances_available_balance')}</p>
              <p className="text-lg font-bold">{formatCurrency(finances?.balance || 0)}</p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('finances_amount')}</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('finances_enter_amount')} className="mt-1" />
            </div>
            <Button className="w-full" onClick={handleWithdraw}>{t('finances_withdraw')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent onClose={() => setDepositOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t('finances_deposit_funds')}</DialogTitle>
            <DialogDescription>{t('finances_deposit_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">{t('finances_amount')}</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('finances_enter_amount')} className="mt-1" />
            </div>
            <Button className="w-full" onClick={handleDeposit}>{t('finances_deposit')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
