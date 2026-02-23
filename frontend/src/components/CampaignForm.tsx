import { useState } from "react";

interface CampaignFormProps {
  initial?: {
    name?: string;
    description?: string;
    target_audience?: string;
    status?: string;
  };
  onSubmit: (data: {
    name: string;
    description?: string;
    target_audience?: string;
    status?: string;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CampaignForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: CampaignFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [targetAudience, setTargetAudience] = useState(
    initial?.target_audience || ""
  );
  const [status, setStatus] = useState(initial?.status || "planning");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      target_audience: targetAudience.trim() || undefined,
      status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-card space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Campaign Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Q1 Product Launch"
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe campaign goals and scope..."
          rows={3}
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Target Audience</label>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="Revenue leaders at mid-market SaaS companies"
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isLoading || !name.trim()}
          className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {isLoading ? "Saving..." : initial ? "Update" : "Create Campaign"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm border rounded-md"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
