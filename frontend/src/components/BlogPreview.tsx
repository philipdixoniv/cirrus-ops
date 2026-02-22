import { truncate } from "@/lib/utils";

interface BlogPreviewProps {
  content: string;
  title?: string;
}

export function BlogPreview({ content, title = "Blog Post" }: BlogPreviewProps) {
  const lines = content.split("\n").filter((l) => l.trim());
  const excerpt = lines.slice(0, 3).join(" ");

  return (
    <div className="border rounded-lg bg-white max-w-2xl mx-auto shadow-sm overflow-hidden">
      {/* Featured image placeholder */}
      <div className="h-48 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        <span className="text-4xl text-blue-300/60 font-bold tracking-tight">
          {title}
        </span>
      </div>

      {/* Content */}
      <div className="p-6 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Marketing Team</span>
          <span>&middot;</span>
          <span>{Math.ceil(content.split(/\s+/).length / 200)} min read</span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {truncate(excerpt, 300)}
        </p>
        <div className="pt-2">
          <span className="text-sm font-medium text-blue-600 hover:underline cursor-pointer">
            Read more &rarr;
          </span>
        </div>
      </div>
    </div>
  );
}
