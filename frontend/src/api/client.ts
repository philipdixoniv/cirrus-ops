const BASE_URL = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// -- Types --

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Meeting {
  id: string;
  platform: string;
  external_id: string;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  host_name: string | null;
  host_email: string | null;
  created_at: string | null;
}

export interface MeetingDetail extends Meeting {
  participants: Array<{
    name: string;
    email: string;
    company: string | null;
    role: string | null;
    is_customer: boolean;
  }>;
  has_transcript: boolean;
  word_count: number | null;
  story_count: number;
}

export interface Story {
  id: string;
  meeting_id: string;
  profile_id: string | null;
  title: string;
  summary: string | null;
  story_text: string | null;
  themes: string[];
  customer_name: string | null;
  customer_company: string | null;
  sentiment: string | null;
  confidence_score: number | null;
  personas: string[];
  funnel_stage: string | null;
  created_at: string | null;
}

export interface ApprovalStep {
  stage: string;
  status: string;
  approved_by: string | null;
  notes: string | null;
  timestamp: string | null;
}

export interface Content {
  id: string;
  story_id: string;
  profile_id: string | null;
  content_type: string;
  content: string;
  status: string;
  platform_target: string | null;
  tone: string | null;
  custom_instructions: string | null;
  version: number | null;
  parent_id: string | null;
  status_note: string | null;
  campaign_id: string | null;
  brief_id: string | null;
  personas: string[];
  funnel_stage: string | null;
  approval_chain: ApprovalStep[];
  created_at: string | null;
}

export interface ThemeCount {
  theme: string;
  count: number;
}

export interface TimeSeriesPoint {
  month: string;
  theme: string;
  count: number;
}

export interface SentimentBreakdown {
  sentiment: string;
  count: number;
  percentage: number;
}

export interface CompanyCount {
  company: string;
  story_count: number;
}

export interface PipelineStatus {
  status: string;
  count: number;
}

export interface SearchResponse {
  stories: Story[];
  content: Content[];
  total: number;
}

export interface OverviewMetrics {
  total_stories: number;
  total_content: number;
  total_meetings: number;
  pipeline: PipelineStatus[];
}

// -- Phase 2 Types --

export interface Preset {
  id: string;
  profile_id: string;
  name: string;
  tone: string | null;
  custom_instructions: string | null;
  created_at: string | null;
}

export interface QuoteItem {
  quote: string;
  customer_name: string | null;
  customer_company: string | null;
  story_id: string;
  story_title: string;
  themes: string[];
  sentiment: string | null;
}

export interface CompetitorMention {
  competitor: string;
  count: number;
  story_ids: string[];
}

export interface ActivityItem {
  type: string;
  title: string;
  detail: string;
  entity_id: string;
  created_at: string;
}

// -- Phase 3 Types --

export interface Campaign {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  story_count: number;
  content_count: number;
}

export interface CampaignDetail extends Campaign {
  stories: Story[];
  content: Content[];
  briefs: Brief[];
}

export interface Brief {
  id: string;
  profile_id: string;
  campaign_id: string | null;
  title: string;
  objective: string | null;
  key_messages: string[];
  target_personas: string[];
  tone_guidance: string | null;
  linked_story_ids: string[];
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

// -- Browse API --

export function fetchMeetings(params: {
  platform?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.platform) qs.set("platform", params.platform);
  if (params.since) qs.set("since", params.since);
  if (params.until) qs.set("until", params.until);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<PaginatedResponse<Meeting>>(`/browse/meetings?${qs}`);
}

export function fetchMeeting(id: string) {
  return request<MeetingDetail>(`/browse/meetings/${id}`);
}

export function fetchStories(params: {
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
  const qs = new URLSearchParams();
  if (params.meeting_id) qs.set("meeting_id", params.meeting_id);
  if (params.profile_id) qs.set("profile_id", params.profile_id);
  if (params.theme) qs.set("theme", params.theme);
  if (params.sentiment) qs.set("sentiment", params.sentiment);
  if (params.min_confidence != null)
    qs.set("min_confidence", String(params.min_confidence));
  if (params.persona) qs.set("persona", params.persona);
  if (params.funnel_stage) qs.set("funnel_stage", params.funnel_stage);
  if (params.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<PaginatedResponse<Story>>(`/browse/stories?${qs}`);
}

export function fetchStory(id: string) {
  return request<Story>(`/browse/stories/${id}`);
}

export function fetchStoryContent(storyId: string) {
  return request<Content[]>(`/browse/stories/${storyId}/content`);
}

export function fetchContent(params: {
  profile_id?: string;
  content_type?: string;
  status?: string;
  persona?: string;
  funnel_stage?: string;
  campaign_id?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.profile_id) qs.set("profile_id", params.profile_id);
  if (params.content_type) qs.set("content_type", params.content_type);
  if (params.status) qs.set("status", params.status);
  if (params.persona) qs.set("persona", params.persona);
  if (params.funnel_stage) qs.set("funnel_stage", params.funnel_stage);
  if (params.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<PaginatedResponse<Content>>(`/browse/content?${qs}`);
}

export function updateContent(
  id: string,
  data: { content?: string; status?: string; tone?: string; status_note?: string }
) {
  return request<Content>(`/browse/content/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function fetchContentVersions(id: string) {
  return request<Content[]>(`/browse/content/${id}/versions`);
}

export function searchAll(q: string, limit = 20, offset = 0) {
  const qs = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  return request<SearchResponse>(`/browse/search?${qs}`);
}

export function fetchThemes() {
  return request<ThemeCount[]>(`/browse/themes`);
}

// -- Analytics API --

export function fetchThemesOverTime(months = 12) {
  return request<TimeSeriesPoint[]>(
    `/browse/analytics/themes-over-time?months=${months}`
  );
}

export function fetchSentimentBreakdown(profileId?: string) {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return request<SentimentBreakdown[]>(`/browse/analytics/sentiment-breakdown${qs}`);
}

export function fetchTopCompanies(limit = 10) {
  return request<CompanyCount[]>(`/browse/analytics/top-companies?limit=${limit}`);
}

export function fetchContentPipeline(profileId?: string) {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return request<PipelineStatus[]>(`/browse/analytics/content-pipeline${qs}`);
}

export function fetchOverview() {
  return request<OverviewMetrics>(`/browse/analytics/overview`);
}

export function fetchCompetitorMentions(limit = 20) {
  return request<CompetitorMention[]>(
    `/browse/analytics/competitor-mentions?limit=${limit}`
  );
}

// -- Quotes API --

export function fetchQuotes(params: {
  theme?: string;
  company?: string;
  sentiment?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.theme) qs.set("theme", params.theme);
  if (params.company) qs.set("company", params.company);
  if (params.sentiment) qs.set("sentiment", params.sentiment);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<PaginatedResponse<QuoteItem>>(`/browse/quotes?${qs}`);
}

// -- Activity API --

export function fetchActivity(limit = 15) {
  return request<ActivityItem[]>(`/browse/activity?limit=${limit}`);
}

// -- Presets API --

export function fetchPresets(profileId: string) {
  return request<Preset[]>(`/browse/presets?profile_id=${profileId}`);
}

export function createPreset(data: {
  profile_id: string;
  name: string;
  tone?: string;
  custom_instructions?: string;
}) {
  return request<Preset>(`/browse/presets`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deletePreset(id: string) {
  return request<void>(`/browse/presets/${id}`, { method: "DELETE" });
}

// -- Mining API --

export function extractStories(meetingId: string, profileName = "default") {
  return request<Story[]>(`/mining/extract`, {
    method: "POST",
    body: JSON.stringify({ meeting_id: meetingId, profile_name: profileName }),
  });
}

export function generateContent(
  storyId: string,
  contentType: string,
  profileName = "default"
) {
  return request<Content>(`/mining/generate`, {
    method: "POST",
    body: JSON.stringify({
      story_id: storyId,
      content_type: contentType,
      profile_name: profileName,
    }),
  });
}

export function batchGenerate(
  storyId: string,
  contentTypes: string[],
  profileName = "default"
) {
  return request<Content[]>(`/mining/batch-generate`, {
    method: "POST",
    body: JSON.stringify({
      story_id: storyId,
      content_types: contentTypes,
      profile_name: profileName,
    }),
  });
}

export function regenerateContent(data: {
  content_id: string;
  tone?: string;
  custom_instructions?: string;
  content_type?: string;
}) {
  return request<Content>(`/mining/regenerate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// -- Campaigns API --

export function fetchCampaigns(params: {
  profile_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.profile_id) qs.set("profile_id", params.profile_id);
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<PaginatedResponse<Campaign>>(`/campaigns?${qs}`);
}

export function fetchCampaign(id: string) {
  return request<CampaignDetail>(`/campaigns/${id}`);
}

export function createCampaign(data: {
  profile_id: string;
  name: string;
  description?: string;
  target_audience?: string;
  status?: string;
}) {
  return request<Campaign>(`/campaigns`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCampaign(
  id: string,
  data: { name?: string; description?: string; target_audience?: string; status?: string }
) {
  return request<Campaign>(`/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCampaign(id: string) {
  return request<void>(`/campaigns/${id}`, { method: "DELETE" });
}

export function addStoryToCampaign(campaignId: string, storyId: string) {
  return request<{ status: string }>(`/campaigns/${campaignId}/stories`, {
    method: "POST",
    body: JSON.stringify({ story_id: storyId }),
  });
}

export function removeStoryFromCampaign(campaignId: string, storyId: string) {
  return request<void>(`/campaigns/${campaignId}/stories/${storyId}`, {
    method: "DELETE",
  });
}

// -- Briefs API --

export function fetchBriefs(params: {
  profile_id?: string;
  campaign_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.profile_id) qs.set("profile_id", params.profile_id);
  if (params.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  // Briefs are accessed via campaigns router for campaign-specific, or a general list
  return request<Brief[]>(`/campaigns/${params.campaign_id}/briefs`);
}

export function createBrief(data: {
  profile_id: string;
  campaign_id?: string;
  title: string;
  objective?: string;
  key_messages?: string[];
  target_personas?: string[];
  tone_guidance?: string;
  linked_story_ids?: string[];
  status?: string;
}) {
  if (data.campaign_id) {
    return request<Brief>(`/campaigns/${data.campaign_id}/briefs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  // For briefs not tied to a campaign, create via campaign endpoint with null campaign
  return request<Brief>(`/campaigns/${data.campaign_id}/briefs`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function generateFromBrief(data: {
  brief_id: string;
  content_types: string[];
  profile_name?: string;
}) {
  return request<Content[]>(`/mining/generate-from-brief`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// -- Approval API --

export function initApproval(contentId: string, stages?: string[]) {
  return request<Content>(`/browse/content/${contentId}/init-approval`, {
    method: "POST",
    body: JSON.stringify({ stages: stages || [] }),
  });
}

export function approveContent(
  contentId: string,
  data: { stage: string; person: string; notes?: string }
) {
  return request<Content>(`/browse/content/${contentId}/approve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function rejectContent(
  contentId: string,
  data: { stage: string; person: string; notes?: string }
) {
  return request<Content>(`/browse/content/${contentId}/reject`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
