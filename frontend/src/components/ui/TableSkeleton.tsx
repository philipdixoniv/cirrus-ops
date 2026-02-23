import { Skeleton } from "./Skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-2.5">
                <Skeleton className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <Skeleton className={`h-4 ${colIdx === 0 ? "w-40" : "w-24"}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
