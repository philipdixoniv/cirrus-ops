import { useState } from "react";
import { Check, X, Clock, ChevronDown } from "lucide-react";
import { useInitApproval, useApproveContent, useRejectContent } from "@/hooks/useApproval";
import { useProfile } from "@/contexts/ProfileContext";
import type { ApprovalStep } from "@/api/client";

interface ApprovalWorkflowProps {
  contentId: string;
  approvalChain: ApprovalStep[];
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-amber-500" />,
  approved: <Check className="h-4 w-4 text-green-600" />,
  rejected: <X className="h-4 w-4 text-red-600" />,
};

const STATUS_BG: Record<string, string> = {
  pending: "border-amber-300 bg-amber-50",
  approved: "border-green-300 bg-green-50",
  rejected: "border-red-300 bg-red-50",
};

export function ApprovalWorkflow({ contentId, approvalChain }: ApprovalWorkflowProps) {
  const { activeProfile } = useProfile();
  const initMutation = useInitApproval();
  const approveMutation = useApproveContent();
  const rejectMutation = useRejectContent();

  const [actionStage, setActionStage] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [notes, setNotes] = useState("");

  const approvers: string[] = (activeProfile as any)?.approvers || [];
  const approvalStages: string[] = (activeProfile as any)?.approval_stages || [];

  const handleInit = () => {
    if (approvalStages.length === 0) return;
    initMutation.mutate({ contentId, stages: approvalStages });
  };

  const handleApprove = (stage: string) => {
    if (!selectedPerson) return;
    approveMutation.mutate({
      contentId,
      data: { stage, person: selectedPerson, notes: notes || undefined },
    });
    setActionStage(null);
    setSelectedPerson("");
    setNotes("");
  };

  const handleReject = (stage: string) => {
    if (!selectedPerson) return;
    rejectMutation.mutate({
      contentId,
      data: { stage, person: selectedPerson, notes: notes || undefined },
    });
    setActionStage(null);
    setSelectedPerson("");
    setNotes("");
  };

  if (approvalChain.length === 0) {
    if (approvalStages.length === 0) return null;
    return (
      <button
        onClick={handleInit}
        disabled={initMutation.isPending}
        className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent transition-colors"
      >
        {initMutation.isPending ? "Initializing..." : "Start Approval"}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {approvalChain.map((step, i) => (
          <div key={step.stage} className="flex items-center gap-1">
            {i > 0 && (
              <div className="w-6 h-px bg-border" />
            )}
            <button
              onClick={() =>
                step.status === "pending"
                  ? setActionStage(actionStage === step.stage ? null : step.stage)
                  : undefined
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                STATUS_BG[step.status] || ""
              } ${step.status === "pending" ? "cursor-pointer hover:shadow-sm" : ""}`}
              title={
                step.approved_by
                  ? `${step.status} by ${step.approved_by}${step.notes ? `: ${step.notes}` : ""}`
                  : step.stage
              }
            >
              {STATUS_ICON[step.status]}
              <span>{step.stage.replace(/_/g, " ")}</span>
              {step.status === "pending" && (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
        ))}
      </div>

      {actionStage && (
        <div className="border rounded-md p-3 bg-muted/30 space-y-2">
          <p className="text-sm font-medium">
            Action: {actionStage.replace(/_/g, " ")}
          </p>
          <select
            value={selectedPerson}
            onChange={(e) => setSelectedPerson(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="">Select approver...</option>
            {approvers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(actionStage)}
              disabled={!selectedPerson || approveMutation.isPending}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded-md disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => handleReject(actionStage)}
              disabled={!selectedPerson || rejectMutation.isPending}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => {
                setActionStage(null);
                setSelectedPerson("");
                setNotes("");
              }}
              className="px-3 py-1 text-sm border rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
