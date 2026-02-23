import { useQuery } from "@tanstack/react-query";
import {
  fetchOverview,
  fetchThemes,
  fetchThemesOverTime,
  fetchSentimentBreakdown,
  fetchTopCompanies,
  fetchContentPipeline,
  fetchCompetitorMentions,
  fetchActivity,
  fetchCustomerQuotes,
} from "@/api/client";

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  });
}

export function useThemes() {
  return useQuery({
    queryKey: ["themes"],
    queryFn: fetchThemes,
  });
}

export function useThemesOverTime(months = 12) {
  return useQuery({
    queryKey: ["themesOverTime", months],
    queryFn: () => fetchThemesOverTime(months),
  });
}

export function useSentimentBreakdown(profileId?: string) {
  return useQuery({
    queryKey: ["sentimentBreakdown", profileId],
    queryFn: () => fetchSentimentBreakdown(profileId),
  });
}

export function useTopCompanies(limit = 10) {
  return useQuery({
    queryKey: ["topCompanies", limit],
    queryFn: () => fetchTopCompanies(limit),
  });
}

export function useContentPipeline(profileId?: string) {
  return useQuery({
    queryKey: ["contentPipeline", profileId],
    queryFn: () => fetchContentPipeline(profileId),
  });
}

export function useCompetitorMentions(limit = 20) {
  return useQuery({
    queryKey: ["competitorMentions", limit],
    queryFn: () => fetchCompetitorMentions(limit),
  });
}

export function useActivity(limit = 15) {
  return useQuery({
    queryKey: ["activity", limit],
    queryFn: () => fetchActivity(limit),
  });
}

export function useCustomerQuotes(params: {
  theme?: string;
  company?: string;
  sentiment?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["customerQuotes", params],
    queryFn: () => fetchCustomerQuotes(params),
  });
}
