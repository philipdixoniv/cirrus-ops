import { Navigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";

export function OrgGuard({ children }: { children: React.ReactNode }) {
  const { orgs, activeOrg, loading } = useOrg();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading organization...</p>
      </div>
    );
  }

  if (orgs.length === 0) {
    return <Navigate to="/org/new" replace />;
  }

  if (!activeOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Selecting organization...</p>
      </div>
    );
  }

  return <>{children}</>;
}
