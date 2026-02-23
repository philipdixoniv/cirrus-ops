import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMeetings, fetchMeeting, extractStories } from "@/api/client";

export function useMeetings(params: {
  platform?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["meetings", params],
    queryFn: () => fetchMeetings(params),
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: ["meeting", id],
    queryFn: () => fetchMeeting(id),
    enabled: !!id,
  });
}

export function useExtractStories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      meetingId,
      profileName,
    }: {
      meetingId: string;
      profileName?: string;
    }) => extractStories(meetingId, profileName),
    meta: { successMessage: "Stories extracted" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
