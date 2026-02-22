import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function Login() {
  const { signInWithGoogle, signInWithSSO, checkSSOForEmail, devBypass, devSignIn } = useAuth();
  const [showSSO, setShowSSO] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleGoogle() {
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSSO(e: React.FormEvent) {
    e.preventDefault();
    setSsoLoading(true);
    setError(null);
    try {
      const result = await checkSSOForEmail(ssoEmail);
      if (result) {
        await signInWithSSO({ providerId: result.sso_provider_id });
      } else {
        setError("No SSO provider found for this domain. Try signing in with Google instead.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Cirrus Ops</h1>
        <p className="text-gray-500 text-center mb-6 text-sm">Sign in to continue</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        )}

        {!showSSO ? (
          <div className="space-y-3">
            <button
              onClick={handleGoogle}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              Sign in with Google
            </button>
            <button
              onClick={() => setShowSSO(true)}
              className="w-full text-sm text-blue-600 hover:underline"
            >
              Sign in with SSO
            </button>
            {devBypass && (
              <button
                onClick={devSignIn}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700"
              >
                Dev Login (Bypass Auth)
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSSO} className="space-y-3">
            <input
              type="email"
              value={ssoEmail}
              onChange={(e) => setSsoEmail(e.target.value)}
              placeholder="work@company.com"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={ssoLoading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {ssoLoading ? "Checking..." : "Continue with SSO"}
            </button>
            <button
              type="button"
              onClick={() => { setShowSSO(false); setError(null); }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
