import { useMutation, useQueryClient } from "@tanstack/react-query";
import { initApproval, approveContent, rejectContent } from "@/api/client";

export function useInitApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, stages }: { contentId: string; stages?: string[] }) =>
      initApproval(contentId, stages),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["storyContent"] });
    },
  });
}

export function useApproveContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      contentId,
      data,
    }: {
      contentId: string;
      data: { stage: string; person: string; notes?: string };
    }) => approveContent(contentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["storyContent"] });
    },
  });
}

export function useRejectContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      contentId,
      data,
    }: {
      contentId: string;
      data: { stage: string; person: string; notes?: string };
    }) => rejectContent(contentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["storyContent"] });
    },
  });
}
