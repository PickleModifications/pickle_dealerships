import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Ticket,
  Percent,
  DollarSign,
  Calendar,
  ShoppingCart,
  Infinity,
} from "lucide-react";

export default function CouponsPage({ data }: { data: any }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [code, setCode] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const coupons = data?.coupons ?? [];

  const handleCreate = () => {
    fetchNui("createCoupon", {
      dealershipId: data?.dealershipId,
      code: code.toUpperCase(),
      type: discountType,
      value: parseFloat(discountValue),
      maxUses: parseInt(maxUses) || 0,
      minPurchase: parseFloat(minPurchase) || 0,
      expiryDate: expiryDate || null,
    });
    setDialogOpen(false);
    setCode("");
    setDiscountValue("");
    setMaxUses("");
    setMinPurchase("");
    setExpiryDate("");
    setDiscountType("percent");
  };

  const handleDelete = (couponId: number | string) => {
    fetchNui("deleteCoupon", { dealershipId: data?.dealershipId, couponId });
  };

  const isExpired = (coupon: any) => {
    if (!coupon.expiryDate && !coupon.expiry) return false;
    const d = coupon.expiryDate || coupon.expiry;
    return new Date(d) < new Date();
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Promotions & Coupons</h1>
          <p className="text-sm text-white/40 mt-1">Create and manage discount codes for your dealership</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="glass border-white/[0.08] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="gradient-text text-xl">Create New Coupon</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 mt-4">
              {/* Code */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">Coupon Code</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SUMMER2026"
                  className="glass-subtle border-white/[0.08] font-mono uppercase tracking-widest text-lg text-white placeholder:text-white/20"
                />
              </div>

              {/* Discount Type Toggle */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">Discount Type</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "flex-1 gap-2 border border-white/[0.08] transition-all",
                      discountType === "percent"
                        ? "glass bg-violet-500/20 border-violet-500/30 text-violet-300"
                        : "glass-subtle text-white/50 hover:text-white/70"
                    )}
                    onClick={() => setDiscountType("percent")}
                  >
                    <Percent className="w-4 h-4" />
                    Percentage
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "flex-1 gap-2 border border-white/[0.08] transition-all",
                      discountType === "fixed"
                        ? "glass bg-blue-500/20 border-blue-500/30 text-blue-300"
                        : "glass-subtle text-white/50 hover:text-white/70"
                    )}
                    onClick={() => setDiscountType("fixed")}
                  >
                    <DollarSign className="w-4 h-4" />
                    Fixed Amount
                  </Button>
                </div>
              </div>

              {/* Discount Value */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">
                  {discountType === "percent" ? "Percentage Off" : "Amount Off"}
                </label>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percent" ? "15" : "500"}
                  className="glass-subtle border-white/[0.08] text-white placeholder:text-white/20"
                />
              </div>

              {/* Max Uses */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">Max Uses (0 = unlimited)</label>
                <Input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="0"
                  className="glass-subtle border-white/[0.08] text-white placeholder:text-white/20"
                />
              </div>

              {/* Min Purchase */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">Minimum Purchase</label>
                <Input
                  type="number"
                  value={minPurchase}
                  onChange={(e) => setMinPurchase(e.target.value)}
                  placeholder="0"
                  className="glass-subtle border-white/[0.08] text-white placeholder:text-white/20"
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-2">
                <label className="text-xs text-white/50 uppercase tracking-wider">Expiry Date</label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="glass-subtle border-white/[0.08] text-white [color-scheme:dark]"
                />
              </div>

              <Separator className="bg-white/[0.06]" />

              <Button
                variant="default"
                className="w-full gap-2"
                onClick={handleCreate}
                disabled={!code || !discountValue}
              >
                <Plus className="w-4 h-4" />
                Create Coupon
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Coupon List */}
      <ScrollArea className="flex-1">
        {coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
            <div className="w-16 h-16 rounded-full glass-subtle flex items-center justify-center mb-4">
              <Ticket className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/40 text-lg font-medium">No coupons yet</p>
            <p className="text-white/25 text-sm mt-1">Create your first promotion to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pr-4">
            {coupons.map((coupon: any, idx: number) => {
              const expired = isExpired(coupon);
              const active = (coupon.active !== false) && !expired;
              const uses = coupon.uses ?? 0;
              const max = coupon.maxUses ?? 0;
              const usagePercent = max > 0 ? Math.min(100, (uses / max) * 100) : 0;
              const type = coupon.type ?? coupon.discountType ?? "percent";
              const value = coupon.value ?? coupon.discountValue ?? 0;
              const expiry = coupon.expiryDate || coupon.expiry;

              return (
                <Card
                  key={coupon.id ?? idx}
                  className={cn(
                    "glass-subtle border-white/[0.06] p-4 animate-slideUp transition-all",
                    !active && "opacity-60"
                  )}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    {/* Code */}
                    <div className="shrink-0">
                      <span className="font-mono text-lg text-white bg-white/[0.04] px-3 py-1 rounded-md border border-white/[0.08]">
                        {coupon.code}
                      </span>
                    </div>

                    {/* Discount Info */}
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <span className="text-white font-semibold">
                        {type === "percent"
                          ? `${value}% off`
                          : `${formatCurrency(value)} off`}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          type === "percent"
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                            : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        )}
                      >
                        {type === "percent" ? "%" : "$"}
                      </Badge>
                    </div>

                    {/* Usage */}
                    <div className="flex flex-col gap-1 min-w-[100px]">
                      <span className="text-xs text-white/50">
                        {uses}/{max > 0 ? max : <Infinity className="w-3 h-3 inline" />} uses
                      </span>
                      {max > 0 && (
                        <Progress value={usagePercent} className="h-1 bg-white/[0.06]" />
                      )}
                    </div>

                    {/* Expiry */}
                    <div className="min-w-[100px] text-sm">
                      {expiry ? (
                        <span className="text-white/40 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(expiry).toLocaleDateString()}
                        </span>
                      ) : (
                        <Badge variant="secondary" className="bg-white/[0.04] text-white/40 border-white/[0.08] text-[10px]">
                          Never
                        </Badge>
                      )}
                    </div>

                    {/* Status */}
                    <div className="min-w-[80px]">
                      {active ? (
                        <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-white/[0.04] text-white/30 border-white/[0.06]">
                          Expired
                        </Badge>
                      )}
                    </div>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => handleDelete(coupon.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Min purchase note */}
                  {(coupon.minPurchase ?? 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/[0.04]">
                      <span className="text-[11px] text-white/30 flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" />
                        Min. purchase: {formatCurrency(coupon.minPurchase)}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
