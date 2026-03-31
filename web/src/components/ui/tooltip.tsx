import * as React from "react";
import { cn } from "@/lib/utils";

type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  content: React.ReactNode;
  position?: TooltipPosition;
  delayMs?: number;
}

const positionClasses: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  (
    { className, content, position = "top", delayMs = 200, children, ...props },
    ref
  ) => {
    const [visible, setVisible] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    const show = React.useCallback(() => {
      timeoutRef.current = setTimeout(() => setVisible(true), delayMs);
    }, [delayMs]);

    const hide = React.useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setVisible(false);
    }, []);

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        {...props}
      >
        {children}
        {visible && (
          <div
            role="tooltip"
            className={cn(
              "absolute z-50 pointer-events-none whitespace-nowrap",
              "glass rounded-lg px-3 py-1.5 text-xs text-slate-300 animate-fadeIn",
              positionClasses[position]
            )}
          >
            {content}
          </div>
        )}
      </div>
    );
  }
);
Tooltip.displayName = "Tooltip";

export { Tooltip };
