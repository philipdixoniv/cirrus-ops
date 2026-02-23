import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSalesQuotes,
  fetchSalesQuote,
  createSalesQuote,
  updateSalesQuote,
  deleteSalesQuote,
  sendSalesQuote,
  acceptSalesQuote,
  rejectSalesQuote,
  convertQuoteToOrder,
  fetchOrders,
  fetchOrder,
  updateOrder,
} from "@/api/client";

export function useSalesQuotes(params: {
  status?: string;
  customer_company?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["salesQuotes", params],
    queryFn: () => fetchSalesQuotes(params),
  });
}

export function useSalesQuote(id: string) {
  return useQuery({
    queryKey: ["salesQuote", id],
    queryFn: () => fetchSalesQuote(id),
    enabled: !!id,
  });
}

export function useCreateSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSalesQuote,
    meta: { successMessage: "Quote created" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
    },
  });
}

export function useUpdateSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSalesQuote>[1] }) =>
      updateSalesQuote(id, data),
    meta: { successMessage: "Quote updated" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
      qc.invalidateQueries({ queryKey: ["salesQuote"] });
    },
  });
}

export function useDeleteSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSalesQuote,
    meta: { successMessage: "Quote deleted" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
    },
  });
}

export function useSendSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendSalesQuote,
    meta: { successMessage: "Quote sent" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
      qc.invalidateQueries({ queryKey: ["salesQuote"] });
    },
  });
}

export function useAcceptSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acceptSalesQuote,
    meta: { successMessage: "Quote accepted" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
      qc.invalidateQueries({ queryKey: ["salesQuote"] });
    },
  });
}

export function useRejectSalesQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rejectSalesQuote,
    meta: { successMessage: "Quote rejected" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
      qc.invalidateQueries({ queryKey: ["salesQuote"] });
    },
  });
}

export function useConvertQuoteToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: convertQuoteToOrder,
    meta: { successMessage: "Order created from quote" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["salesQuotes"] });
      qc.invalidateQueries({ queryKey: ["salesQuote"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useOrders(params: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => fetchOrders(params),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; notes?: string } }) =>
      updateOrder(id, data),
    meta: { successMessage: "Order updated" },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
    },
  });
}
