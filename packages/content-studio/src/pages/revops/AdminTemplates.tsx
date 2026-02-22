import { useState, useCallback } from "react";
import { useDocuments } from "@/hooks/revops/useDocuments";

export default function AdminTemplates() {
  const {
    templates,
    templatesLoading,
    templatesError,
    createTemplate,
    uploadTemplateFile,
    deleteTemplate,
  } = useDocuments();

  const [showCreate, setShowCreate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", type: "proposal" });
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    try {
      setError(null);
      await createTemplate(newTemplate);
      setShowCreate(false);
      setNewTemplate({ name: "", type: "proposal" });
    } catch (err: any) {
      setError(err.message || "Failed to create template");
    }
  }, [newTemplate, createTemplate]);

  const handleUpload = useCallback(
    async (templateId: string, event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        setError(null);
        await uploadTemplateFile(file, templateId);
      } catch (err: any) {
        setError(err.message || "Failed to upload file");
      }
    },
    [uploadTemplateFile],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        setError(null);
        await deleteTemplate(id);
      } catch (err: any) {
        setError(err.message || "Failed to delete template");
      }
    },
    [deleteTemplate],
  );

  const displayError = error || templatesError;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Document Templates</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
        >
          + Add Template
        </button>
      </div>

      {displayError && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{displayError}</div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">New Template</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={newTemplate.type}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="proposal">Proposal</option>
                <option value="agreement">Agreement</option>
                <option value="order_form">Order Form</option>
                <option value="terms">Terms</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-gray-500 text-sm font-medium py-1.5 px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="bg-white rounded-lg shadow p-6">
        {templatesLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No templates yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 font-medium text-gray-500">Type</th>
                <th className="text-left py-2 font-medium text-gray-500">Version</th>
                <th className="text-left py-2 font-medium text-gray-500">File</th>
                <th className="text-right py-2 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">{t.name}</td>
                  <td className="py-2 text-gray-700 capitalize">
                    {(t.type || "").replace("_", " ")}
                  </td>
                  <td className="py-2 text-gray-500">v{t.version}</td>
                  <td className="py-2">
                    {t.storage_path || t.file_path ? (
                      <span className="text-green-600 text-xs">Uploaded</span>
                    ) : (
                      <label className="text-blue-600 text-xs cursor-pointer hover:text-blue-800">
                        Upload .docx
                        <input
                          type="file"
                          accept=".docx"
                          className="hidden"
                          onChange={(e) => handleUpload(t.id, e)}
                        />
                      </label>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
