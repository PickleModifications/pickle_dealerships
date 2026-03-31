import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  setValue: (value: string) => void;
  displayValue: string;
  setDisplayValue: (label: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error(
      "Select components must be used within a <Select> provider"
    );
  }
  return context;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  children,
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState("");

  const value =
    controlledValue !== undefined ? controlledValue : internalValue;

  const setValue = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
      setOpen(false);
    },
    [controlledValue, onValueChange]
  );

  return (
    <SelectContext.Provider
      value={{ open, setOpen, value, setValue, displayValue, setDisplayValue }}
    >
      <div className="relative inline-block w-full">{children}</div>
    </SelectContext.Provider>
  );
};
Select.displayName = "Select";

export interface SelectTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  placeholder?: string;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, placeholder = "Select...", ...props }, ref) => {
    const { open, setOpen, displayValue } = useSelectContext();

    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={open}
        className={cn(
          "glass-subtle rounded-lg px-3 py-2 text-sm flex justify-between items-center cursor-pointer w-full",
          "border border-white/[0.08] hover:border-violet-500/30 transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30",
          "min-w-[8rem]",
          open && "ring-2 ring-violet-500/30 border-violet-500/40",
          className
        )}
        onClick={() => setOpen(!open)}
        {...props}
      >
        <span
          className={cn(
            "truncate",
            displayValue ? "text-slate-200" : "text-slate-500"
          )}
        >
          {displayValue || placeholder}
        </span>
        <svg
          className={cn(
            "h-4 w-4 text-slate-400 shrink-0 ml-2 transition-transform duration-200",
            open && "rotate-180"
          )}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen } = useSelectContext();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const container = contentRef.current?.closest(".relative");
      if (container && !container.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={(node) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        "glass rounded-lg mt-1 py-1 absolute z-50 min-w-[8rem] w-full animate-slideUp max-h-60 overflow-y-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
SelectContent.displayName = "SelectContent";

export interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const {
      value: selectedValue,
      setValue,
      setDisplayValue,
    } = useSelectContext();
    const isSelected = selectedValue === value;
    const textRef = React.useRef<string>("");

    React.useEffect(() => {
      if (isSelected && textRef.current) {
        setDisplayValue(textRef.current);
      }
    }, [isSelected, setDisplayValue]);

    return (
      <div
        ref={(node) => {
          if (node) textRef.current = node.textContent || "";
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
        }}
        role="option"
        aria-selected={isSelected}
        className={cn(
          "px-3 py-2 text-sm text-slate-300 hover:bg-violet-500/15 hover:text-violet-200 cursor-pointer transition-colors rounded-md mx-1",
          isSelected && "bg-violet-500/10 text-violet-300",
          className
        )}
        onClick={() => {
          setValue(value);
          if (textRef.current) setDisplayValue(textRef.current);
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = "SelectItem";

const SelectValue: React.FC<{ placeholder?: string }> = ({ placeholder }) => {
  const { displayValue } = useSelectContext();
  return (
    <span className={cn(!displayValue && "text-slate-500")}>
      {displayValue || placeholder || "Select..."}
    </span>
  );
};
SelectValue.displayName = "SelectValue";

export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
