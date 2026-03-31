import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency, fetchNui } from "@/lib/utils";
import {
  Car,
  Palette,
  Target,
  SlidersHorizontal,
  Shield,
  TrendingDown,
  Sparkles,
  Clock,
  Gift,
  Crosshair,
  Flame,
  Lock,
  Check,
  ArrowRight,
  DollarSign,
  Award,
  TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants & Config
// ---------------------------------------------------------------------------

const EMOTION_MAP: Record<string, { emoji: string; color: string; glow: string; border: string }> = {
  happy:      { emoji: "\u{1F60A}", color: "bg-emerald-500", glow: "shadow-emerald-500/40", border: "border-l-emerald-500/60" },
  neutral:    { emoji: "\u{1F610}", color: "bg-slate-400",   glow: "shadow-slate-400/40",   border: "border-l-slate-400/60" },
  annoyed:    { emoji: "\u{1F620}", color: "bg-red-500",     glow: "shadow-red-500/40",     border: "border-l-red-500/60" },
  interested: { emoji: "\u{1F914}", color: "bg-blue-500",    glow: "shadow-blue-500/40",    border: "border-l-blue-500/60" },
  ready:      { emoji: "\u{1F911}", color: "bg-amber-500",   glow: "shadow-amber-500/40",   border: "border-l-amber-500/60" },
};

const BUDGET_STYLE: Record<string, string> = {
  low:          "bg-slate-500/20 text-slate-300 border-slate-500/30",
  budget:       "bg-slate-500/20 text-slate-300 border-slate-500/30",
  mid:          "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "mid-range":  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  high:         "bg-violet-500/20 text-violet-300 border-violet-500/30",
  premium:      "bg-violet-500/20 text-violet-300 border-violet-500/30",
  luxury:       "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/30",
};

const MATCH_STYLE: Record<string, { card: string; badge: string; label: string }> = {
  great:    { card: "glow-green border-emerald-500/30",  badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "Great Match" },
  good:     { card: "glow-blue border-blue-500/30",      badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",         label: "Good Match" },
  poor:     { card: "glow-amber border-amber-500/30",    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",      label: "Poor Match" },
  terrible: { card: "glow-red border-red-500/30",        badge: "bg-red-500/20 text-red-300 border-red-500/30",            label: "Terrible Match" },
};

interface TacticDef {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  bgHover: string;
}

const TACTIC_DEFS: TacticDef[] = [
  { id: "stand_firm",    name: "Stand Firm",       description: "Hold your price \u2014 show confidence",           icon: Shield,       accent: "border-l-slate-400/50",   bgHover: "hover:bg-slate-500/10" },
  { id: "small_concession", name: "Concession",    description: "Lower your price slightly to build trust",        icon: TrendingDown, accent: "border-l-blue-400/50",    bgHover: "hover:bg-blue-500/10" },
  { id: "highlight_features", name: "Highlight Value", description: "Emphasize premium features & quality",        icon: Sparkles,     accent: "border-l-violet-400/50",  bgHover: "hover:bg-violet-500/10" },
  { id: "create_urgency", name: "Create Urgency",  description: "Limited stock \u2014 act now or miss out",        icon: Clock,        accent: "border-l-amber-400/50",   bgHover: "hover:bg-amber-500/10" },
  { id: "sweeten_deal",  name: "Sweeten Deal",     description: "Add extras \u2014 warranty, mods, service",       icon: Gift,         accent: "border-l-emerald-400/50", bgHover: "hover:bg-emerald-500/10" },
  { id: "match_need",    name: "Match Their Need", description: "Tie the vehicle to their stated preference",      icon: Crosshair,    accent: "border-l-indigo-400/50",  bgHover: "hover:bg-indigo-500/10" },
  { id: "final_offer",   name: "Final Offer",      description: "Last chance \u2014 take it or leave it",          icon: Flame,        accent: "border-l-red-400/50",     bgHover: "hover:bg-red-500/10" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NegotiationPage({ data }: { data: any }) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Safely extract all data with sensible fallback values
  const npc = data?.npc ?? null;
  const currentVehicle = data?.currentVehicle ?? data?.vehicle ?? null;
  const round = data?.round ?? 1;
  const maxRounds = data?.maxRounds ?? 5;
  const askingPrice = data?.askingPrice ?? 0;
  const theirOffer = data?.currentOffer ?? data?.theirOffer ?? 0;
  const dialogue = data?.dialogue ?? "Hello! I'm looking for a vehicle today.";
  const emotion: string = data?.emotion ?? "neutral";
  const matchQuality: string = data?.matchQuality ?? "good";
  const stock = data?.availableStock ?? data?.stock ?? [];
  const saleComplete = data?.saleComplete ?? false;
  const saleResult = data?.saleResult ?? data?.saleData ?? null;
  const preferences = npc?.preferences ?? data?.preferences ?? {};
  const flexibility = data?.flexibility ?? preferences?.flexibility ?? 50;

  // Which tactics are available vs locked (support both old and new data shape)
  const tacticData = data?.tactics ?? [];
  const lockedTactics = data?.lockedTactics ?? [];

  const isLocked = (id: string) => {
    if (lockedTactics.includes(id)) return true;
    // If tactics is an array of objects with a locked field
    if (tacticData.length > 0 && typeof tacticData[0] === "object") {
      const t = tacticData.find((t: any) => t.id === id);
      return t?.locked === true;
    }
    return false;
  };

  const matchStyle = MATCH_STYLE[matchQuality] ?? MATCH_STYLE.good;
  const emotionCfg = EMOTION_MAP[emotion] ?? EMOTION_MAP.neutral;
  const gapPercent = askingPrice > 0 ? Math.min(100, (theirOffer / askingPrice) * 100) : 0;

  // Typing animation for dialogue
  useEffect(() => {
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    setDisplayedText("");
    setIsTyping(true);

    let i = 0;
    const typeChar = () => {
      if (i < dialogue.length) {
        setDisplayedText(dialogue.slice(0, i + 1));
        i++;
        typeTimerRef.current = setTimeout(typeChar, 18 + Math.random() * 25);
      } else {
        setIsTyping(false);
      }
    };
    typeTimerRef.current = setTimeout(typeChar, 200);

    return () => {
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    };
  }, [dialogue]);

  // Actions
  const handlePresentVehicle = (vehicleId: number | string) => {
    fetchNui("presentVehicle", { dealershipId: data?.dealershipId, vehicleId });
  };

  const handleTactic = (tacticId: string) => {
    fetchNui("negotiate", { dealershipId: data?.dealershipId, tactic: tacticId });
  };

  const handleContinue = () => {
    fetchNui("closeNegotiation", { dealershipId: data?.dealershipId });
  };

  // -----------------------------------------------------------------------
  // LEFT PANEL -- NPC Customer Card
  // -----------------------------------------------------------------------
  const renderLeftPanel = () => {
    if (!npc) {
      return (
        <div className="w-64 shrink-0 glass-subtle border border-white/[0.06] rounded-2xl p-6 flex items-center justify-center animate-fadeIn">
          <p className="text-white/30 text-sm">Waiting for customer...</p>
        </div>
      );
    }

    const initials = (npc.initials ?? (npc.name ?? "??")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
    ).toUpperCase();

    const budgetKey = (npc.budgetTier ?? "mid").toLowerCase().replace(/[\s]+/g, "-");
    const budgetStyle = BUDGET_STYLE[budgetKey] ?? BUDGET_STYLE.mid;
    const budgetLabel =
      budgetKey === "low" || budgetKey === "budget" ? "Budget" :
      budgetKey === "mid" || budgetKey === "mid-range" ? "Mid-Range" :
      budgetKey === "high" || budgetKey === "premium" ? "Premium" :
      budgetKey === "luxury" ? "Luxury" : npc.budgetTier;

    return (
      <div className="w-64 shrink-0 flex flex-col gap-4 animate-slideUp">
        {/* Avatar Card */}
        <Card className="glass-subtle border-white/[0.06] p-5 flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <span className="text-2xl font-bold text-white tracking-wide">{initials}</span>
            </div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 animate-pulse-glow" />
          </div>

          <h3 className="text-lg font-bold text-white text-center">{npc.name ?? "Unknown"}</h3>
          {npc.personalityHint && (
            <p className="text-xs text-white/35 italic text-center">"{npc.personalityHint}"</p>
          )}

          <Badge variant="secondary" className={cn("text-xs capitalize", budgetStyle)}>
            {budgetLabel}
          </Badge>
        </Card>

        {/* Revealed Preferences */}
        <Card className="glass-subtle border-white/[0.06] p-4 flex flex-col gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Revealed Preferences
          </h4>
          <Separator className="bg-white/[0.06]" />

          {/* Type */}
          <div className="flex items-center gap-2.5">
            <Car className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-xs text-white/50">Type</span>
            <span className="ml-auto text-sm text-white">
              {preferences.type ?? <em className="text-white/25 not-italic">???</em>}
            </span>
          </div>

          {/* Color */}
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs text-white/50">Color</span>
            <span className="ml-auto text-sm text-white flex items-center gap-1.5">
              {preferences.color ? (
                <>
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: preferences.colorHex ?? "#888" }}
                  />
                  {preferences.color}
                </>
              ) : (
                <em className="text-white/25 not-italic">???</em>
              )}
            </span>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2.5">
            <Target className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-white/50">Priority</span>
            <span className="ml-auto text-sm text-white">
              {preferences.priority ?? <em className="text-white/25 not-italic">???</em>}
            </span>
          </div>

          {/* Flexibility */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-white/50">Flexibility</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-700"
                style={{ width: `${flexibility}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Emotion Indicator */}
        <Card className="glass-subtle border-white/[0.06] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Customer Mood
          </h4>
          <div className="flex items-center justify-between gap-1">
            {Object.entries(EMOTION_MAP).map(([key, cfg]) => {
              const active = emotion === key;
              return (
                <div
                  key={key}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-base transition-all duration-300",
                    cfg.color,
                    active
                      ? `ring-2 ring-white/30 scale-110 shadow-lg ${cfg.glow}`
                      : "opacity-30 scale-90"
                  )}
                >
                  {cfg.emoji}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // CENTER PANEL -- Vehicle & Dialogue
  // -----------------------------------------------------------------------
  const renderCenterPanel = () => (
    <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 animate-fadeIn">
      {currentVehicle ? (
        <>
          {/* Vehicle Card */}
          <Card
            className={cn(
              "glass-subtle border p-5 transition-all duration-500",
              matchStyle.card
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Presenting</p>
                <h2 className="text-xl font-bold text-white">{currentVehicle.name}</h2>
                <p className="text-sm text-white/40 mt-0.5">{currentVehicle.class}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <span className="text-2xl font-bold gradient-text">
                  {formatCurrency(currentVehicle.price ?? askingPrice)}
                </span>
                <Badge variant="secondary" className={cn("text-xs", matchStyle.badge)}>
                  {matchStyle.label}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Dialogue Bubble */}
          <Card
            className={cn(
              "glass-subtle border-white/[0.06] rounded-2xl p-5 border-l-4 transition-colors duration-300 flex-1 min-h-0",
              emotionCfg.border
            )}
          >
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">Customer says:</p>
            <p className="text-white/90 text-[15px] leading-relaxed">
              {displayedText}
              {isTyping && (
                <span className="inline-block w-0.5 h-5 bg-violet-400 ml-1 animate-pulse" />
              )}
            </p>
          </Card>
        </>
      ) : (
        <>
          {/* No vehicle -- stock selection grid */}
          <div className="mb-1">
            <h2 className="text-lg font-semibold text-white">Select a Vehicle to Present</h2>
            <p className="text-xs text-white/40 mt-1">Choose from available stock to begin negotiation</p>
          </div>

          {/* Show dialogue while no vehicle selected */}
          <Card className={cn("glass-subtle border-white/[0.06] rounded-2xl p-4 border-l-4 shrink-0", emotionCfg.border)}>
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1.5">{npc?.name ?? "Customer"} says:</p>
            <p className="text-white/80 text-sm leading-relaxed">
              {displayedText}
              {isTyping && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-1 animate-pulse" />}
            </p>
          </Card>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 gap-3 pr-2">
              {stock.length > 0 ? stock.map((v: any, i: number) => (
                <Card
                  key={v.id ?? i}
                  className="glass-subtle glass-hover border-white/[0.06] p-4 cursor-pointer transition-all hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/10 animate-slideUp"
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => handlePresentVehicle(v.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <Car className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{v.name}</p>
                      <p className="text-xs text-white/40">{v.class}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold gradient-text">{formatCurrency(v.price)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-white/20" />
                  </div>
                </Card>
              )) : (
                <div className="col-span-2 flex flex-col items-center justify-center py-16">
                  <Car className="w-10 h-10 text-white/15 mb-3" />
                  <p className="text-white/30 text-sm">No vehicles in stock</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );

  // -----------------------------------------------------------------------
  // RIGHT PANEL -- Negotiation Controls
  // -----------------------------------------------------------------------
  const renderRightPanel = () => (
    <div className="w-72 shrink-0 flex flex-col gap-4 min-h-0 animate-slideUp">
      {/* Round Counter */}
      <Card className="glass-subtle border-white/[0.06] p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Round</h4>
          <span className="text-sm font-bold text-white">
            {round} <span className="text-white/30">/ {maxRounds}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: maxRounds }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                i < round
                  ? "bg-gradient-to-r from-violet-500 to-indigo-400"
                  : "bg-white/[0.06]"
              )}
            />
          ))}
        </div>
      </Card>

      {/* Price Display */}
      {currentVehicle && (
        <Card className="glass-subtle border-white/[0.06] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Asking Price</span>
            <span className="text-base font-bold text-white">{formatCurrency(askingPrice)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Their Offer</span>
            <span className="text-base font-bold text-violet-300">
              {theirOffer > 0 ? formatCurrency(theirOffer) : "---"}
            </span>
          </div>
          <Separator className="bg-white/[0.06]" />
          {/* Gap Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/30">Price Gap</span>
              <span className="text-[10px] text-white/30">{Math.round(gapPercent)}%</span>
            </div>
            <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${gapPercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-white shadow-lg shadow-white/30 transition-all duration-500"
                style={{ left: `clamp(2%, ${gapPercent}%, 98%)` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tactic Cards */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 pr-2">
          {TACTIC_DEFS.map((tactic) => {
            const locked = isLocked(tactic.id);
            const disabled = locked || !currentVehicle;
            const isFinal = tactic.id === "final_offer";

            return (
              <div key={tactic.id}>
                {isFinal && <Separator className="bg-white/[0.06] my-2" />}
                <Card
                  className={cn(
                    "glass-subtle border-white/[0.06] border-l-4 p-3 cursor-pointer transition-all duration-200",
                    tactic.accent,
                    tactic.bgHover,
                    disabled && "opacity-40 pointer-events-none",
                    isFinal && "border-l-red-400/60 bg-red-500/[0.04]",
                    !disabled && "glass-hover"
                  )}
                  onClick={() => !disabled && handleTactic(tactic.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isFinal ? "bg-red-500/10" : "bg-white/[0.04]"
                    )}>
                      {locked ? (
                        <Lock className="w-4 h-4 text-white/20" />
                      ) : (
                        <tactic.icon className={cn(
                          "w-4 h-4",
                          isFinal ? "text-red-400" : "text-white/60"
                        )} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-sm font-semibold",
                        isFinal ? "text-red-300" : "text-white"
                      )}>
                        {tactic.name}
                      </p>
                      <p className="text-xs text-white/35 truncate">{tactic.description}</p>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  // -----------------------------------------------------------------------
  // SALE COMPLETE OVERLAY
  // -----------------------------------------------------------------------
  const renderSaleOverlay = () => {
    if (!saleComplete || !saleResult) return null;

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center animate-fadeIn">
        {/* Backdrop */}
        <div className="absolute inset-0 glass bg-black/60 backdrop-blur-xl" />

        {/* Content */}
        <div className="relative flex flex-col items-center gap-6 animate-slideUp">
          {/* Checkmark */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center glow-green shadow-2xl shadow-emerald-500/30">
              <Check className="w-12 h-12 text-white" strokeWidth={3} />
            </div>
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse-glow" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold gradient-text tracking-wide">SALE COMPLETE</h2>

          {/* Stats */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1 glass-subtle border border-white/[0.06] rounded-xl px-6 py-4">
              <DollarSign className="w-5 h-5 text-emerald-400 mb-1" />
              <span className="text-xl font-bold text-white">{formatCurrency(saleResult.salePrice ?? 0)}</span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Sale Price</span>
            </div>
            <div className="flex flex-col items-center gap-1 glass-subtle border border-white/[0.06] rounded-xl px-6 py-4">
              <Award className="w-5 h-5 text-violet-400 mb-1" />
              <span className="text-xl font-bold text-violet-300">{formatCurrency(saleResult.commission ?? 0)}</span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Commission</span>
            </div>
            <div className="flex flex-col items-center gap-1 glass-subtle border border-white/[0.06] rounded-xl px-6 py-4">
              <TrendingUp className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-xl font-bold text-amber-300">+{saleResult.reputation ?? 0}</span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Reputation</span>
            </div>
          </div>

          {/* Continue */}
          <Button variant="default" className="mt-2 px-8 gap-2" onClick={handleContinue}>
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <div className="relative flex gap-4 h-full overflow-hidden">
      {renderLeftPanel()}
      {renderCenterPanel()}
      {renderRightPanel()}
      {renderSaleOverlay()}
    </div>
  );
}
