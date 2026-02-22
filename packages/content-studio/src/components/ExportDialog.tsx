import { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import { formatContentType } from "@/lib/utils";
import type { Content } from "@/api/client";

type ExportFormat = "txt" | "md" | "html";

interface ExportDialogProps {
  contents: Content[];
  onClose: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

function formatContent(content: Content, format: ExportFormat): string {
  const text = content.content;
  switch (format) {
    case "txt":
      return text;
    case "md":
      return `# ${formatContentType(content.content_type)}\n\n${text}`;
    case "html":
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${formatContentType(content.content_type)}</title>
<style>body{font-family:system-ui;max-width:650px;margin:2rem auto;padding:0 1rem;line-height:1.6}</style>
</head><body>
<h1>${formatContentType(content.content_type)}</h1>
${text
  .split("\n")
  .map((line) => `<p>${line}</p>`)
  .join("\n")}
</body></html>`;
  }
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MIME_TYPES: Record<ExportFormat, string> = {
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
};

export function ExportDialog({ contents, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [exporting, setExporting] = useState(false);

  const isBulk = contents.length > 1;

  const handleExport = async () => {
    setExporting(true);

    if (isBulk) {
      // Bulk export as ZIP
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();

        for (const c of contents) {
          const fileName = `${c.content_type}_v${c.version || 1}_${slugify(
            c.content_type
          )}.${format}`;
          zip.file(fileName, formatContent(c, format));
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `content_export.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: download individually
        for (const c of contents) {
          const fileName = `${c.content_type}_v${c.version || 1}.${format}`;
          downloadFile(fileName, formatContent(c, format), MIME_TYPES[format]);
        }
      }
    } else {
      const c = contents[0];
      const fileName = `${c.content_type}_v${c.version || 1}_${slugify(
        c.content_type
      )}.${format}`;
      downloadFile(fileName, formatContent(c, format), MIME_TYPES[format]);
    }

    setExporting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Export {isBulk ? `${contents.length} items` : "Content"}
          </h3>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Format</label>
          <div className="flex gap-2">
            {(["txt", "md", "html"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                  format === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent"
                }`}
              >
                .{f}
              </button>
            ))}
          </div>
        </div>

        {isBulk && (
          <p className="text-xs text-muted-foreground">
            Multiple items will be downloaded as a ZIP archive.
          </p>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Exporting..." : "Download"}
        </button>
      </div>
    </div>
  );
}
