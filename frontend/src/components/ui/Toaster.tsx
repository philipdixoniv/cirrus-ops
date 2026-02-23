import { useToastStore, toast as toastActions } from "@/hooks/useToast";
import { Toast } from "./Toast";

export function Toaster() {
  const toasts = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          variant={t.variant}
          onDismiss={() => toastActions.dismiss(t.id)}
        />
      ))}
    </div>
  );
}
