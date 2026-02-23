import { useSyncExternalStore } from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

let toasts: ToastItem[] = [];
let nextId = 1;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

function addToast(message: string, variant: ToastVariant) {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  if (toasts.length > MAX_VISIBLE) {
    toasts = toasts.slice(-MAX_VISIBLE);
  }
  notify();
  setTimeout(() => {
    dismiss(id);
  }, AUTO_DISMISS_MS);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useToastStore(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export const toast = {
  success: (message: string) => addToast(message, "success"),
  error: (message: string) => addToast(message, "error"),
  info: (message: string) => addToast(message, "info"),
  warning: (message: string) => addToast(message, "warning"),
  dismiss,
};
