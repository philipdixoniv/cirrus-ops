import { useState, useEffect, useMemo, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useTeamHierarchy } from "@/hooks/revops/useTeamHierarchy";
import { useStripeInstances } from "@/hooks/revops/useStripeInstances";
import { useSSO } from "@/hooks/revops/useSSO";
import { HierarchyNode } from "@/components/revops/HierarchyNode";

/* ---------- helpers ---------- */

function formatDate(date: string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString() : "";
}

/* ---------- tab definitions ---------- */

const TABS = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "sso", label: "SSO" },
  { id: "integrations", label: "Integrations" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ---------- OrgSettings ---------- */

export default function OrgSettings() {
  const {
    activeOrg,
    loading: orgLoading,
    updateOrg,
    loadMembers,
    addMember,
    updateMemberRole,
    updateMemberReportsTo,
    removeMember,
    hasRole,
    getIntegrations,
    saveIntegration,
    deleteIntegration,
  } = useOrg();

  const { teamMembers, buildHierarchyTree } = useTeamHierarchy();

  const {
    instances: stripeInstances,
    createInstance,
    updateInstance,
    deleteInstance: deleteStripeInstance,
    fetchStripeAccountInfo,
  } = useStripeInstances();

  const {
    domains: ssoDomains,
    error: ssoError,
    addDomain,
    updateDomain,
    removeDomain,
  } = useSSO();

  /* ---------- state ---------- */
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState<any[]>([]);

  // Members tab
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // Integrations tab
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [sfClientId, setSfClientId] = useState("");
  const [sfClientSecret, setSfClientSecret] = useState("");
  const [sfInstanceUrl, setSfInstanceUrl] = useState("");

  // Stripe instances
  const [showAddInstance, setShowAddInstance] = useState(false);
  const [newInstanceKey, setNewInstanceKey] = useState("");
  const [instanceSaving, setInstanceSaving] = useState(false);
  const [instanceAddError, setInstanceAddError] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(
    null,
  );
  const [editInstanceName, setEditInstanceName] = useState("");
  const [instanceAccountMeta, setInstanceAccountMeta] = useState<
    Record<string, any>
  >({});

  // SSO
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newSSODomain, setNewSSODomain] = useState("");
  const [newSSOProviderId, setNewSSOProviderId] = useState("");
  const [newSSOEnforced, setNewSSOEnforced] = useState(false);
  const [ssoSaving, setSsoSaving] = useState(false);

  /* ---------- derived ---------- */
  const hierarchyTree = useMemo(() => buildHierarchyTree(), [buildHierarchyTree]);
  const hierarchyRoots = hierarchyTree.roots;
  const unassignedMembers = hierarchyTree.unassigned;

  const managerCandidates = useMemo(
    () =>
      teamMembers.filter((m: any) =>
        ["owner", "admin", "manager"].includes(m.role),
      ),
    [teamMembers],
  );

  const sfIntegration = useMemo(
    () => integrations.find((i: any) => i.provider === "salesforce") || null,
    [integrations],
  );

  /* ---------- load on mount ---------- */
  useEffect(() => {
    if (!activeOrg) return;
    setOrgName(activeOrg.name);

    (async () => {
      const [membersList, integrationsData] = await Promise.all([
        loadMembers(activeOrg.id),
        getIntegrations(activeOrg.id),
      ]);
      setMembers(membersList);
      setIntegrations(integrationsData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  /* Load stripe account meta whenever instances change */
  useEffect(() => {
    (async () => {
      const meta: Record<string, any> = {};
      for (const inst of stripeInstances) {
        if (inst.credentials) {
          const info = await fetchStripeAccountInfo(inst.credentials);
          if (info) meta[inst.id] = info;
        }
      }
      setInstanceAccountMeta(meta);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeInstances]);

  /* ---------- reloaders ---------- */
  const reloadIntegrations = useCallback(async () => {
    if (activeOrg) {
      const data = await getIntegrations(activeOrg.id);
      setIntegrations(data);
    }
  }, [activeOrg, getIntegrations]);

  const reloadMembers = useCallback(async () => {
    if (activeOrg) {
      const data = await loadMembers(activeOrg.id);
      setMembers(data);
    }
  }, [activeOrg, loadMembers]);

  /* ---------- handlers ---------- */
  async function handleUpdateOrg() {
    if (activeOrg) {
      await updateOrg(activeOrg.id, { name: orgName });
    }
  }

  async function handleAddMember() {
    if (activeOrg && inviteUserId) {
      await addMember(activeOrg.id, inviteUserId, inviteRole);
      setInviteUserId("");
      setShowInvite(false);
      await reloadMembers();
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    await updateMemberRole(memberId, role);
    await reloadMembers();
  }

  async function handleRemoveMember(memberId: string) {
    await removeMember(memberId);
    await reloadMembers();
  }

  async function handleReportsToChange(
    memberId: string,
    reportsToUserId: string | null,
  ) {
    await updateMemberReportsTo(memberId, reportsToUserId);
  }

  async function handleAddSSODomain() {
    if (!newSSODomain.trim() || !newSSOProviderId.trim()) return;
    setSsoSaving(true);
    try {
      await addDomain({
        domain: newSSODomain.trim(),
        provider: newSSOProviderId.trim(),
      });
      setShowAddDomain(false);
      setNewSSODomain("");
      setNewSSOProviderId("");
      setNewSSOEnforced(false);
    } finally {
      setSsoSaving(false);
    }
  }

  async function handleToggleEnforced(domain: any) {
    await updateDomain(domain.id, { enforced: !domain.enforced });
  }

  async function handleRemoveSSODomain(id: string) {
    await removeDomain(id);
  }

  async function handleSaveSfCredentials() {
    if (!activeOrg) return;
    await saveIntegration({
      orgId: activeOrg.id,
      provider: "salesforce",
      environment: "production",
      credentials: {
        client_id: sfClientId,
        client_secret: sfClientSecret,
        instance_url: sfInstanceUrl,
      },
    });
    setSfClientId("");
    setSfClientSecret("");
    setSfInstanceUrl("");
    await reloadIntegrations();
  }

  async function handleDeleteIntegration(integrationId: string) {
    await deleteIntegration(integrationId);
    await reloadIntegrations();
  }

  async function handleAddInstance() {
    if (!newInstanceKey.trim()) return;
    setInstanceSaving(true);
    setInstanceAddError(null);
    try {
      const key = newInstanceKey.trim();
      const inst = await createInstance({
        credentials: { api_key: key, secret_key: key },
      });
      if (inst) {
        setShowAddInstance(false);
        setNewInstanceKey("");
        const meta = await fetchStripeAccountInfo(inst.credentials);
        if (meta) {
          setInstanceAccountMeta((prev) => ({ ...prev, [inst.id]: meta }));
        }
      } else {
        setInstanceAddError("Failed to create instance");
      }
    } catch (e: any) {
      setInstanceAddError(e.message);
    } finally {
      setInstanceSaving(false);
    }
  }

  function startEditInstance(inst: any) {
    setEditingInstanceId(inst.id);
    setEditInstanceName(inst.name);
  }

  async function handleSaveInstanceEdit(id: string) {
    await updateInstance(id, { name: editInstanceName });
    setEditingInstanceId(null);
  }

  async function handleDisconnectInstance(id: string) {
    await deleteStripeInstance(id);
    setInstanceAccountMeta((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /* ---------- guard ---------- */
  if (!activeOrg) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Organization Settings
        </h2>
        <div className="text-center py-12 text-gray-400 text-sm">
          No organization selected
        </div>
      </div>
    );
  }

  /* ---------- render ---------- */
  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-900">
        Organization Settings
      </h2>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ==================== General Tab ==================== */}
      {activeTab === "general" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">General</h2>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug
              </label>
              <input
                value={activeOrg.slug}
                type="text"
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
              />
            </div>
          </div>
          <button
            onClick={handleUpdateOrg}
            disabled={orgLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg text-sm"
          >
            Save
          </button>
        </div>
      )}

      {/* ==================== Members Tab ==================== */}
      {activeTab === "members" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Members</h2>
            {hasRole("admin") && (
              <button
                onClick={() => setShowInvite(!showInvite)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Member
              </button>
            )}
          </div>

          {showInvite && (
            <div className="flex gap-2 items-end border border-gray-200 rounded-lg p-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  User ID
                </label>
                <input
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                  type="text"
                  placeholder="User UUID"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                onClick={handleAddMember}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg"
              >
                Add
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">
                  Member
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Role
                </th>
                <th className="text-left py-2 font-medium text-gray-500">
                  Joined
                </th>
                <th className="text-right py-2 font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member: any) => (
                <tr key={member.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900 text-sm">
                    {member.display_name ||
                      member.user_id.slice(0, 8) + "..."}
                  </td>
                  <td className="py-2">
                    {hasRole("admin") && member.role !== "owner" ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value)
                        }
                        className="border-0 bg-transparent text-sm cursor-pointer p-0 focus:ring-0"
                      >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="text-gray-700 capitalize">
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-gray-500">
                    {formatDate(member.created_at)}
                  </td>
                  <td className="py-2 text-right">
                    {hasRole("admin") && member.role !== "owner" && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== Hierarchy Tab ==================== */}
      {activeTab === "hierarchy" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Reporting Hierarchy
          </h2>

          {/* Tree view of assigned members */}
          {hierarchyRoots.length > 0 && (
            <div className="space-y-1">
              {hierarchyRoots.map((root: any) => (
                <HierarchyNode
                  key={root.id}
                  member={root}
                  allMembers={teamMembers}
                  depth={0}
                  isAdmin={hasRole("admin")}
                  availableManagers={managerCandidates}
                  onUpdateReportsTo={handleReportsToChange}
                />
              ))}
            </div>
          )}

          {/* Unassigned members */}
          {unassignedMembers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Unassigned Members
              </h3>
              <div className="space-y-2">
                {unassignedMembers.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.display_name ||
                          member.user_id.slice(0, 8) + "..."}
                      </p>
                      {member.email && (
                        <p className="text-xs text-gray-500 truncate">
                          {member.email}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 capitalize">
                      {member.role}
                    </span>
                    {hasRole("admin") && (
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          handleReportsToChange(
                            member.id,
                            e.target.value || null,
                          )
                        }
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="">Assign manager...</option>
                        {managerCandidates.map((mgr: any) => (
                          <option key={mgr.user_id} value={mgr.user_id}>
                            {mgr.display_name ||
                              mgr.user_id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {members.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No members to display.
            </div>
          )}
        </div>
      )}

      {/* ==================== SSO Tab ==================== */}
      {activeTab === "sso" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              SSO Domains
            </h2>
            {hasRole("admin") && (
              <button
                onClick={() => setShowAddDomain(!showAddDomain)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Domain
              </button>
            )}
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">
              SAML providers must be registered via the Supabase CLI before
              adding domains here. Run{" "}
              <code className="bg-gray-200 px-1 rounded">
                supabase sso add --type saml --provider-id &lt;uuid&gt;
                --metadata-url &lt;url&gt;
              </code>{" "}
              to register a provider, then add the domain mapping below.
            </p>
          </div>

          {ssoError && (
            <div className="p-2 bg-red-50 text-red-700 rounded text-xs">
              {ssoError}
            </div>
          )}

          {/* Add Domain Form */}
          {showAddDomain && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Email Domain
                  </label>
                  <input
                    value={newSSODomain}
                    onChange={(e) => setNewSSODomain(e.target.value)}
                    type="text"
                    placeholder="acme.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    SSO Provider ID
                  </label>
                  <input
                    value={newSSOProviderId}
                    onChange={(e) => setNewSSOProviderId(e.target.value)}
                    type="text"
                    placeholder="UUID from supabase sso add"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  checked={newSSOEnforced}
                  onChange={(e) => setNewSSOEnforced(e.target.checked)}
                  type="checkbox"
                  className="rounded border-gray-300"
                />
                Enforce SSO (block social login for this domain)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSSODomain}
                  disabled={
                    !newSSODomain.trim() ||
                    !newSSOProviderId.trim() ||
                    ssoSaving
                  }
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
                >
                  {ssoSaving ? "Adding..." : "Add Domain"}
                </button>
                <button
                  onClick={() => setShowAddDomain(false)}
                  className="text-gray-500 hover:text-gray-700 text-sm font-medium py-1.5 px-4"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Domain List */}
          {ssoDomains.length === 0 && !showAddDomain && (
            <div className="text-sm text-gray-500 text-center py-4">
              No SSO domains configured. Click "Add Domain" to get started.
            </div>
          )}
          {ssoDomains.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">
                    Domain
                  </th>
                  <th className="text-left py-2 font-medium text-gray-500">
                    Provider ID
                  </th>
                  <th className="text-left py-2 font-medium text-gray-500">
                    Enforced
                  </th>
                  <th className="text-left py-2 font-medium text-gray-500">
                    Status
                  </th>
                  <th className="text-right py-2 font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {ssoDomains.map((d: any) => (
                  <tr key={d.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900 font-medium">
                      {d.domain}
                    </td>
                    <td className="py-2 text-gray-500 font-mono text-xs">
                      {d.sso_provider_id
                        ? d.sso_provider_id.slice(0, 8) + "..."
                        : d.provider?.slice(0, 8) + "..."}
                    </td>
                    <td className="py-2">
                      {hasRole("admin") ? (
                        <button
                          onClick={() => handleToggleEnforced(d)}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            d.enforced
                              ? "bg-orange-100 text-orange-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d.enforced ? "Enforced" : "Optional"}
                        </button>
                      ) : (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            d.enforced
                              ? "bg-orange-100 text-orange-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d.enforced ? "Enforced" : "Optional"}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          d.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {hasRole("admin") && (
                        <button
                          onClick={() => handleRemoveSSODomain(d.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ==================== Integrations Tab ==================== */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          {/* Salesforce */}
          <div className="bg-white rounded-lg shadow p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Salesforce
              </h3>
              {sfIntegration && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                  Connected
                </span>
              )}
            </div>
            {!sfIntegration ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Client ID
                    </label>
                    <input
                      value={sfClientId}
                      onChange={(e) => setSfClientId(e.target.value)}
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Client Secret
                    </label>
                    <input
                      value={sfClientSecret}
                      onChange={(e) => setSfClientSecret(e.target.value)}
                      type="password"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Instance URL
                    </label>
                    <input
                      value={sfInstanceUrl}
                      onChange={(e) => setSfInstanceUrl(e.target.value)}
                      type="text"
                      placeholder="https://yourorg.salesforce.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveSfCredentials}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
                >
                  Connect Salesforce
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  Instance:{" "}
                  {sfIntegration.credentials?.instance_url || "N/A"}
                </span>
                <button
                  onClick={() => handleDeleteIntegration(sfIntegration.id)}
                  className="text-red-600 hover:text-red-800 text-xs font-medium"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Stripe Instances */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Stripe Instances
              </h3>
              {hasRole("admin") && (
                <button
                  onClick={() => setShowAddInstance(!showAddInstance)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Add Instance
                </button>
              )}
            </div>

            {/* Add Instance Form */}
            {showAddInstance && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                {instanceAddError && (
                  <div className="p-2 bg-red-50 text-red-700 rounded text-xs">
                    {instanceAddError}
                  </div>
                )}
                <div className="max-w-md">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Stripe Secret Key
                  </label>
                  <input
                    value={newInstanceKey}
                    onChange={(e) => setNewInstanceKey(e.target.value)}
                    type="password"
                    placeholder="sk_test_... or sk_live_..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    The account name, mode, and account ID will be detected
                    automatically.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddInstance}
                    disabled={!newInstanceKey.trim() || instanceSaving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
                  >
                    {instanceSaving ? "Connecting..." : "Connect"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddInstance(false);
                      setInstanceAddError(null);
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm font-medium py-1.5 px-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Instance List */}
            {stripeInstances.length === 0 && !showAddInstance && (
              <div className="text-sm text-gray-500 text-center py-4">
                No Stripe instances connected. Click "Add Instance" to get
                started.
              </div>
            )}
            {stripeInstances.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-500">
                      Name
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Account
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left py-2 font-medium text-gray-500">
                      Last Synced
                    </th>
                    <th className="text-right py-2 font-medium text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stripeInstances.map((inst: any) => (
                    <tr key={inst.id} className="border-b border-gray-100">
                      <td className="py-2 text-gray-900 font-medium">
                        {editingInstanceId === inst.id ? (
                          <input
                            value={editInstanceName}
                            onChange={(e) =>
                              setEditInstanceName(e.target.value)
                            }
                            type="text"
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          inst.name
                        )}
                      </td>
                      <td className="py-2">
                        {instanceAccountMeta[inst.id] ? (
                          <div className="text-xs">
                            <span className="text-gray-700">
                              {instanceAccountMeta[inst.id].displayName ||
                                "Unnamed"}
                            </span>
                            <span className="text-gray-400 font-mono ml-1">
                              {inst.stripe_account_id
                                ? "..." +
                                  inst.stripe_account_id.slice(-4)
                                : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">
                            {inst.stripe_account_id || "..."}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      </td>
                      <td className="py-2 text-gray-500 text-xs">
                        {inst.last_sync_at
                          ? formatDate(inst.last_sync_at)
                          : "Never"}
                      </td>
                      <td className="py-2 text-right space-x-2">
                        {editingInstanceId === inst.id ? (
                          <>
                            <button
                              onClick={() =>
                                handleSaveInstanceEdit(inst.id)
                              }
                              className="text-green-600 hover:text-green-800 text-xs font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingInstanceId(null)}
                              className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditInstance(inst)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                handleDisconnectInstance(inst.id)
                              }
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
