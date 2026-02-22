import { useQuery } from "@tanstack/react-query";
import { fetchStories, fetchStory, fetchStoryContent } from "@/api/client";

export function useStories(params: {
  meeting_id?: string;
  profile_id?: string;
  theme?: string;
  sentiment?: string;
  min_confidence?: number;
  persona?: string;
  funnel_stage?: string;
  campaign_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["stories", params],
    queryFn: () => fetchStories(params),
  });
}

export function useStory(id: string) {
  return useQuery({
    queryKey: ["story", id],
    queryFn: () => fetchStory(id),
    enabled: !!id,
  });
}

export function useStoryContent(storyId: string) {
  return useQuery({
    queryKey: ["storyContent", storyId],
    queryFn: () => fetchStoryContent(storyId),
    enabled: !!storyId,
  });
}
