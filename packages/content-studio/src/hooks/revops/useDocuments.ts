import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useDocuments() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["documentTemplates", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const templates = templatesQuery.data || [];

  const invalidateTemplates = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["documentTemplates", activeOrgId],
      }),
    [queryClient, activeOrgId],
  );

  const generatePdf = useCallback(
    async (opts: {
      quoteId: string;
      templateId?: string;
      options?: any;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke(
        "generate-document",
        {
          body: {
            org_id: activeOrgId,
            quote_id: opts.quoteId,
            template_id: opts.templateId || null,
            format: "pdf",
            options: opts.options || {},
          },
        },
      );
      if (error) throw new Error(error.message || "PDF generation failed");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [activeOrgId],
  );

  const generateDocx = useCallback(
    async (opts: {
      quoteId: string;
      templateId?: string;
      options?: any;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke(
        "generate-document",
        {
          body: {
            org_id: activeOrgId,
            quote_id: opts.quoteId,
            template_id: opts.templateId || null,
            format: "docx",
            options: opts.options || {},
          },
        },
      );
      if (error) throw new Error(error.message || "DOCX generation failed");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [activeOrgId],
  );

  const createShareLink = useCallback(
    async (opts: {
      documentId: string;
      expiresInDays?: number;
      password?: string;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();
      const expiresAt = opts.expiresInDays
        ? new Date(
            Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;

      const { data, error } = await supabase
        .from("share_links")
        .insert({
          org_id: activeOrgId,
          document_id: opts.documentId,
          expires_at: expiresAt,
          password_hash: opts.password || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    [activeOrgId],
  );

  const getShareLinks = useCallback(
    async (documentId: string) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("share_links")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("document_id", documentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    [activeOrgId],
  );

  const deactivateShareLink = useCallback(async (linkId: string) => {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("share_links")
      .update({ is_active: false })
      .eq("id", linkId);
    if (error) throw error;
  }, []);

  const getDocuments = useCallback(
    async (opts?: { quoteId?: string; limit?: number }) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();
      let query = supabase
        .from("documents")
        .select("*")
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false });

      if (opts?.quoteId) {
        query = query.eq("quote_id", opts.quoteId);
      }
      if (opts?.limit) {
        query = query.limit(opts.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    [activeOrgId],
  );

  const loadTemplates = useCallback(async () => {
    // Templates are already loaded via React Query; force refetch
    invalidateTemplates();
    return templates;
  }, [invalidateTemplates, templates]);

  const createTemplate = useCallback(
    async (data: any) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();
      const { data: template, error } = await supabase
        .from("document_templates")
        .insert({
          ...data,
          org_id: activeOrgId,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      invalidateTemplates();
      return template;
    },
    [activeOrgId, invalidateTemplates],
  );

  const uploadTemplateFile = useCallback(
    async (file: File, templateId: string) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();
      const filePath = `${activeOrgId}/templates/${templateId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("document-templates")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("document_templates")
        .update({ file_path: filePath, file_name: file.name })
        .eq("id", templateId);
      if (updateError) throw updateError;

      invalidateTemplates();
      return filePath;
    },
    [activeOrgId, invalidateTemplates],
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("document_templates")
        .update({ is_active: false })
        .eq("id", templateId);
      if (error) throw error;
      invalidateTemplates();
    },
    [invalidateTemplates],
  );

  return {
    templates,
    templatesLoading: templatesQuery.isLoading,
    templatesError: templatesQuery.error?.message || null,
    generatePdf,
    generateDocx,
    createShareLink,
    getShareLinks,
    deactivateShareLink,
    getDocuments,
    loadTemplates,
    createTemplate,
    uploadTemplateFile,
    deleteTemplate,
  };
}
