import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBriefs, createBrief, generateFromBrief } from "@/api/client";

export function useBriefs(params: {
  profile_id?: string;
  campaign_id?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["briefs", params],
    queryFn: () => fetchBriefs(params),
    enabled: !!params.campaign_id,
  });
}

export function useCreateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      profile_id: string;
      campaign_id?: string;
      title: string;
      objective?: string;
      key_messages?: string[];
      target_personas?: string[];
      tone_guidance?: string;
      linked_story_ids?: string[];
      status?: string;
    }) => createBrief(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefs"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
    },
  });
}

export function useGenerateFromBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      brief_id: string;
      content_types: string[];
      profile_name?: string;
    }) => generateFromBrief(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: ["briefs"] });
    },
  });
}
