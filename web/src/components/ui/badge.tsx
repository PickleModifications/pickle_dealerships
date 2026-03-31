import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-violet-500/15 text-violet-300 border border-violet-500/20",
        secondary: "bg-white/[0.06] text-slate-400 border border-white/[0.08]",
        destructive: "bg-red-500/15 text-red-300 border border-red-500/20",
        success:
          "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
        warning: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
        info: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
        outline: "border border-white/10 text-slate-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, className }))}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
