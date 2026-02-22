import { Heart, MessageCircle, Repeat2, Share } from "lucide-react";

interface TweetPreviewProps {
  content: string;
  handle?: string;
  displayName?: string;
}

export function TweetPreview({
  content,
  handle = "@yourcompany",
  displayName = "Your Company",
}: TweetPreviewProps) {
  return (
    <div className="border rounded-xl bg-white max-w-lg mx-auto shadow-sm p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {displayName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-gray-900">{displayName}</span>
            <span className="text-sm text-gray-500">{handle}</span>
            <span className="text-sm text-gray-400 mx-1">&middot;</span>
            <span className="text-sm text-gray-500">now</span>
          </div>

          {/* Content */}
          <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap leading-relaxed">
            {content}
          </p>

          {/* Action bar */}
          <div className="flex items-center justify-between mt-3 max-w-[300px]">
            {[
              { icon: MessageCircle, count: "2" },
              { icon: Repeat2, count: "5" },
              { icon: Heart, count: "18" },
              { icon: Share, count: "" },
            ].map(({ icon: Icon, count }, i) => (
              <button
                key={i}
                className="flex items-center gap-1 text-gray-500 hover:text-blue-500 transition-colors"
              >
                <Icon className="h-4 w-4" />
                {count && <span className="text-xs">{count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
