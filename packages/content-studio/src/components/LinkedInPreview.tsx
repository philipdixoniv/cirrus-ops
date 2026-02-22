import { ThumbsUp, MessageSquare, Repeat2, Send } from "lucide-react";

interface LinkedInPreviewProps {
  content: string;
  authorName?: string;
  authorTitle?: string;
}

export function LinkedInPreview({
  content,
  authorName = "Marketing Team",
  authorTitle = "Content Marketing Manager",
}: LinkedInPreviewProps) {
  return (
    <div className="border rounded-lg bg-white max-w-lg mx-auto shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
          {authorName.charAt(0)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{authorName}</p>
          <p className="text-xs text-gray-500">{authorTitle}</p>
          <p className="text-xs text-gray-400">Just now</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {content}
        </p>
      </div>

      {/* Engagement stats */}
      <div className="px-4 py-2 border-t border-b flex items-center gap-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-0.5">
          <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
            <ThumbsUp className="h-2.5 w-2.5 text-white" />
          </span>
          24
        </span>
        <span className="ml-auto">3 comments</span>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-around py-2 px-2">
        {[
          { icon: ThumbsUp, label: "Like" },
          { icon: MessageSquare, label: "Comment" },
          { icon: Repeat2, label: "Repost" },
          { icon: Send, label: "Send" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
