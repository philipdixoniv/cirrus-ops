import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";

interface Activity {
  id: string;
  type: string;
  subject?: string;
  description?: string;
  activity_date?: string;
  duration_minutes?: number;
  opportunity_id: string;
}

interface ActivityTimelineProps {
  opportunityId: string;
}

const typeIconClasses: Record<string, string> = {
  call: "bg-blue-100 text-blue-700",
  email: "bg-green-100 text-green-700",
  meeting: "bg-purple-100 text-purple-700",
  task: "bg-amber-100 text-amber-700",
};

function typeIcon(type: string): string {
  return typeIconClasses[type] || typeIconClasses.task;
}

function typeInitial(type: string): string {
  return (type || "T")[0].toUpperCase();
}

function formatDate(date?: string): string {
  return date ? new Date(date).toLocaleDateString() : "";
}

export function ActivityTimeline({ opportunityId }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);

  const loadActivities = useCallback(async () => {
    if (!opportunityId) return;
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("activity_date", { ascending: false })
        .limit(50);

      setActivities(data || []);
    } catch {
      // Silently handle errors — match Vue behavior
    }
  }, [opportunityId]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm">No activities recorded.</div>
      ) : (
        activities.map((activity) => (
          <div key={activity.id} className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${typeIcon(activity.type)}`}
              >
                {typeInitial(activity.type)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {activity.subject || activity.type}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDate(activity.activity_date)}
                </span>
              </div>
              {activity.description && (
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                  {activity.description}
                </p>
              )}
              {activity.duration_minutes && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {activity.duration_minutes} minutes
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
