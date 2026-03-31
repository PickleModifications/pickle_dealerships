import { useState } from "react";
import { Car, Search, ShoppingCart, Clock, Tag, CreditCard, Banknote, Landmark, FileText, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";

const mockStock = [
  { id: 1, label: "Pegassi Zentorno", class: "Super", condition: "New", price: 725000 },
  { id: 2, label: "Benefactor Schafter V12", class: "Sports", condition: "Used", price: 185000 },
  { id: 3, label: "Enus Paragon R", class: "Sports", condition: "New", price: 905000 },
  { id: 4, label: "Dewbauchee Rapid GT", class: "Sports", condition: "Used", price: 132000 },
  { id: 5, label: "Grotti Turismo R", class: "Super", condition: "New", price: 500000 },
  { id: 6, label: "Obey 9F Cabrio", class: "Sports", condition: "Used", price: 95000 },
];

const mockHistory = [
  { id: 1, vehicle: "Pegassi Zentorno", buyer: "James Wilson", price: 710000, commission: 35500, date: "2026-03-31" },
  { id: 2, vehicle: "Benefactor Schafter V12", buyer: "Sarah Chen", price: 180000, commission: 9000, date: "2026-03-30" },
  { id: 3, vehicle: "Enus Paragon R", buyer: "Mike Torres", price: 890000, commission: 44500, date: "2026-03-29" },
];

const isBrowser = !(window as any).invokeNative;

export default function SalesPage({ data }: { data: any }) {
  const stock = data?.stock ?? (isBrowser ? mockStock : []);
  const history = data?.history ?? (isBrowser ? mockHistory : []);

  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [offerPrice, setOfferPrice] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "financing">("cash");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStock = stock.filter((v: any) =>
    v.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openOffer = (vehicle: any) => {
    setSelectedVehicle(vehicle);
    setOfferPrice(String(vehicle.price));
    setCouponCode("");
    setPaymentMethod("cash");
  };

  const handleTestDrive = () => {
    if (!selectedVehicle) return;
    fetchNui("sales:testDrive", { vehicleId: selectedVehicle.id });
    setSelectedVehicle(null);
  };

  const handleCompleteSale = () => {
    if (!selectedVehicle) return;
    fetchNui("sales:completeSale", {
      vehicleId: selectedVehicle.id,
      price: Number(offerPrice),
      coupon: couponCode,
      paymentMethod,
    });
    setSelectedVehicle(null);
  };

  return (
    <div className="animate-fadeIn space-y-4">
      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="glass w-full mb-4">
          <TabsTrigger value="stock" className="flex-1 gap-2">
            <Car className="w-4 h-4" />
            Available Stock
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-2">
            <Clock className="w-4 h-4" />
            Sales History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4 animate-slideUp">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search vehicles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {filteredStock.map((vehicle: any) => (
              <Card
                key={vehicle.id}
                className="glass-subtle glass-hover p-4 flex flex-col gap-3 animate-slideUp"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{vehicle.label}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline">{vehicle.class}</Badge>
                      <Badge variant={vehicle.condition === "New" ? "info" : "secondary"}>
                        {vehicle.condition}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Car className="w-5 h-5 text-violet-400" />
                  </div>
                </div>

                <p className="gradient-text text-xl font-bold">
                  {formatCurrency(vehicle.price)}
                </p>

                <Button
                  className="w-full mt-auto"
                  onClick={() => openOffer(vehicle)}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Offer to Customer
                </Button>
              </Card>
            ))}
          </div>

          {filteredStock.length === 0 && (
            <div className="glass-subtle rounded-xl p-8 text-center">
              <Car className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No vehicles found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="animate-slideUp">
          <Card className="glass-subtle p-4">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" />
              Sales History
            </h3>
            {history.length > 0 ? (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-1">
                  {history.map((sale: any, i: number) => (
                    <div key={sale.id}>
                      <div className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{sale.vehicle}</p>
                          <p className="text-slate-400 text-xs mt-0.5">Sold to {sale.buyer}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-green-400 font-medium text-sm">
                            {formatCurrency(sale.price)}
                          </p>
                          <p className="text-violet-400 text-xs mt-0.5">
                            +{formatCurrency(sale.commission)} commission
                          </p>
                          <p className="text-slate-500 text-xs mt-0.5">{sale.date}</p>
                        </div>
                      </div>
                      {i < history.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-8 text-center">
                <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No sales recorded yet</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Offer Dialog */}
      <Dialog open={!!selectedVehicle} onOpenChange={() => setSelectedVehicle(null)}>
        <DialogContent className="glass border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-violet-400" />
              </div>
              {selectedVehicle?.label}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure the sale offer for this vehicle
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Offer Price
              </label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="number"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  className="pl-10"
                  placeholder="Enter price..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Coupon Code
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="pl-10"
                  placeholder="Optional coupon..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Payment Method
              </label>
              <div className="flex gap-2">
                {[
                  { key: "cash", label: "Cash", icon: Banknote },
                  { key: "bank", label: "Bank", icon: Landmark },
                  { key: "financing", label: "Financing", icon: CreditCard },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setPaymentMethod(key as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5",
                      paymentMethod === key
                        ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                        : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleTestDrive} className="flex-1">
              <Gauge className="w-4 h-4 mr-2" />
              Test Drive
            </Button>
            <Button onClick={handleCompleteSale} className="flex-1">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Complete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
