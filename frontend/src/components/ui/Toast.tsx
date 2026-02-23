import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cva } from "class-variance-authority";
import type { ToastVariant } from "@/hooks/useToast";

const toastVariants = cva(
  "flex items-start gap-3 w-80 rounded-lg border p-4 shadow-lg transition-all animate-in slide-in-from-right-full duration-300",
  {
    variants: {
      variant: {
        success: "bg-green-50 border-green-200 text-green-900",
        error: "bg-red-50 border-red-200 text-red-900",
        info: "bg-blue-50 border-blue-200 text-blue-900",
        warning: "bg-amber-50 border-amber-200 text-amber-900",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />,
  error: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
};

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}

export function Toast({ message, variant, onDismiss }: ToastProps) {
  return (
    <div className={toastVariants({ variant })} role="alert">
      {ICONS[variant]}
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
