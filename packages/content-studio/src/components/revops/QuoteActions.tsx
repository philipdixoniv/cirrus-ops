import { useState } from "react";
import { useDocuments } from "@/hooks/revops/useDocuments";
import { useCheckout } from "@/hooks/revops/useCheckout";

interface QuoteActionsProps {
  quoteId: string;
  showPaymentLink?: boolean;
}

export function QuoteActions({
  quoteId,
  showPaymentLink = false,
}: QuoteActionsProps) {
  const { generatePdf, generateDocx, createShareLink } = useDocuments();
  const { generatePaymentLink } = useCheckout();

  const [pdfLoading, setPdfLoading] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGeneratePdf() {
    setPdfLoading(true);
    setErrorMsg(null);
    try {
      const result = await generatePdf({ quoteId });
      if (result?.url) window.open(result.url, "_blank");
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleGenerateDocx() {
    setDocxLoading(true);
    setErrorMsg(null);
    try {
      const result = await generateDocx({ quoteId });
      if (result?.url) window.open(result.url, "_blank");
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setDocxLoading(false);
    }
  }

  async function handleCreateShareLink() {
    setShareLoading(true);
    setErrorMsg(null);
    try {
      const result = await createShareLink({ documentId: quoteId });
      if (result?.id) {
        const url = `${window.location.origin}/quote/share/${result.id}`;
        setShareUrl(url);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setShareLoading(false);
    }
  }

  async function handleGeneratePaymentLink() {
    setPaymentLoading(true);
    setErrorMsg(null);
    try {
      const result = await generatePaymentLink({
        quoteId,
        lineItems: [],
      });
      if (result?.url) setPaymentUrl(result.url);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setPaymentLoading(false);
    }
  }

  function copyShareLink() {
    if (shareUrl) navigator.clipboard.writeText(shareUrl);
  }

  function copyPaymentLink() {
    if (paymentUrl) navigator.clipboard.writeText(paymentUrl);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* Export PDF */}
      <button
        onClick={handleGeneratePdf}
        disabled={pdfLoading}
        className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {pdfLoading ? "Generating..." : "PDF"}
      </button>

      {/* Export DOCX */}
      <button
        onClick={handleGenerateDocx}
        disabled={docxLoading}
        className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {docxLoading ? "Generating..." : "DOCX"}
      </button>

      {/* Share Link */}
      <button
        onClick={handleCreateShareLink}
        disabled={shareLoading}
        className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        {shareLoading ? "Creating..." : "Share Link"}
      </button>

      {/* Payment Link */}
      {showPaymentLink && (
        <button
          onClick={handleGeneratePaymentLink}
          disabled={paymentLoading}
          className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          {paymentLoading ? "Creating..." : "Payment Link"}
        </button>
      )}

      {/* Share link display */}
      {shareUrl && (
        <div className="w-full mt-2 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
          <input
            value={shareUrl}
            readOnly
            className="flex-1 bg-transparent border-0 text-sm text-blue-800 font-mono focus:ring-0 p-0"
          />
          <button
            onClick={copyShareLink}
            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
          >
            Copy
          </button>
        </div>
      )}

      {/* Payment link display */}
      {paymentUrl && (
        <div className="w-full mt-2 flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
          <input
            value={paymentUrl}
            readOnly
            className="flex-1 bg-transparent border-0 text-sm text-green-800 font-mono focus:ring-0 p-0"
          />
          <button
            onClick={copyPaymentLink}
            className="text-green-600 hover:text-green-800 text-xs font-medium"
          >
            Copy
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="w-full text-sm text-red-600 mt-1">{errorMsg}</div>
      )}
    </div>
  );
}
