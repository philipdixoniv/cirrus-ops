import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchContent,
  fetchContentVersions,
  updateContent,
  regenerateContent,
  searchAll,
  fetchPresets,
  createPreset,
  deletePreset,
} from "@/api/client";

export function useContent(params: {
  profile_id?: string;
  content_type?: string;
  status?: string;
  persona?: string;
  funnel_stage?: string;
  campaign_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["content", params],
    queryFn: () => fetchContent(params),
  });
}

export function useContentVersions(contentId: string) {
  return useQuery({
    queryKey: ["contentVersions", contentId],
    queryFn: () => fetchContentVersions(contentId),
    enabled: !!contentId,
  });
}

export function useUpdateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { content?: string; status?: string; tone?: string; status_note?: string };
    }) => updateContent(id, data),
    meta: { successMessage: "Content saved" },
    onMutate: async ({ id, data }) => {
      // Only optimistic for status changes
      if (!data.status) return;
      await qc.cancelQueries({ queryKey: ["content"] });
      const prev = qc.getQueriesData({ queryKey: ["content"] });
      qc.setQueriesData({ queryKey: ["content"] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((c: any) =>
            c.id === id ? { ...c, ...data } : c
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.prev) {
        context.prev.forEach(([key, data]: [any, any]) => {
          qc.setQueryData(key, data);
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["storyContent"] });
    },
  });
}

export function useRegenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      content_id: string;
      tone?: string;
      custom_instructions?: string;
      content_type?: string;
    }) => regenerateContent(data),
    meta: { successMessage: "Content regenerated" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["storyContent"] });
      qc.invalidateQueries({ queryKey: ["contentVersions"] });
    },
  });
}

export function useSearch(q: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["search", q, limit, offset],
    queryFn: () => searchAll(q, limit, offset),
    enabled: q.length > 0,
  });
}

// -- Preset hooks --

export function usePresets(profileId: string | undefined) {
  return useQuery({
    queryKey: ["presets", profileId],
    queryFn: () => fetchPresets(profileId!),
    enabled: !!profileId,
  });
}

export function useCreatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      profile_id: string;
      name: string;
      tone?: string;
      custom_instructions?: string;
    }) => createPreset(data),
    meta: { successMessage: "Preset created" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presets"] });
    },
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePreset(id),
    meta: { successMessage: "Preset deleted" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presets"] });
    },
  });
}
