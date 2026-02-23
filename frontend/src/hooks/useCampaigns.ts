import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  addStoryToCampaign,
  removeStoryFromCampaign,
} from "@/api/client";

export function useCampaigns(params: {
  profile_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["campaigns", params],
    queryFn: () => fetchCampaigns(params),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign(id),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      profile_id: string;
      name: string;
      description?: string;
      target_audience?: string;
      status?: string;
    }) => createCampaign(data),
    meta: { successMessage: "Campaign created" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string; target_audience?: string; status?: string };
    }) => updateCampaign(id, data),
    meta: { successMessage: "Campaign updated" },
    onMutate: async ({ id, data }) => {
      if (!data.status) return;
      await qc.cancelQueries({ queryKey: ["campaign", id] });
      const prev = qc.getQueryData(["campaign", id]);
      qc.setQueryData(["campaign", id], (old: any) =>
        old ? { ...old, ...data } : old
      );
      return { prev, id };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) {
        qc.setQueryData(["campaign", context.id], context.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    meta: { successMessage: "Campaign deleted" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useAddStoryToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, storyId }: { campaignId: string; storyId: string }) =>
      addStoryToCampaign(campaignId, storyId),
    meta: { successMessage: "Story added to campaign" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useRemoveStoryFromCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, storyId }: { campaignId: string; storyId: string }) =>
      removeStoryFromCampaign(campaignId, storyId),
    meta: { successMessage: "Story removed from campaign" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
