import { useAction, useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DTOUR_SESSION_KEY } from "@/lib/session";

function b64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  return b64UrlEncode(buf);
}

export function PasskeySection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "register" | "login" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const genRegOptions = useMutation(anyApi.authPasskey.generateRegistrationOptions);
  const registerCred = useAction(anyApi.authPasskey.registerCredential);
  const genLoginOptions = useMutation(anyApi.authPasskey.generateLoginOptions);
  const loginCred = useAction(anyApi.authPasskey.login);

  const handleRegister = useCallback(async () => {
    if (!email.trim()) return;
    setMode("loading");
    setError(null);
    try {
      const options = await genRegOptions({ email: email.trim() });

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: b64UrlDecode(options.challenge),
          rp: options.rp,
          user: {
            id: b64UrlDecode(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          authenticatorSelection: options.authenticatorSelection,
          attestation: options.attestation as AttestationConveyancePreference,
        },
      })) as PublicKeyCredential;

      const response = credential.response as AuthenticatorAttestationResponse;

      const result = (await registerCred({
        credentialId: credential.id,
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        attestationObject: arrayBufferToBase64Url(response.attestationObject),
        transports: response.getTransports ? response.getTransports() : [],
        email: email.trim(),
        challenge: options.challenge,
      })) as { token: string; userId: string };

      localStorage.setItem(DTOUR_SESSION_KEY, result.token);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError("Passkey creation was cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Registration failed");
      }
      setMode("idle");
    }
  }, [email, genRegOptions, registerCred, navigate]);

  const handleLogin = useCallback(async () => {
    setMode("loading");
    setError(null);
    try {
      const options = await genLoginOptions({});

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: b64UrlDecode(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification as UserVerificationRequirement,
        },
      })) as PublicKeyCredential;

      const response = credential.response as AuthenticatorAssertionResponse;

      const result = (await loginCred({
        credentialId: credential.id,
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
        signature: arrayBufferToBase64Url(response.signature),
        userHandle: response.userHandle
          ? arrayBufferToBase64Url(response.userHandle)
          : undefined,
        challenge: options.challenge,
      })) as { token: string; userId: string; hasProfile: boolean };

      localStorage.setItem(DTOUR_SESSION_KEY, result.token);
      navigate(result.hasProfile ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError("Passkey sign-in was cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
      setMode("idle");
    }
  }, [genLoginOptions, loginCred, navigate]);

  return (
    <div className="space-y-3">
      {/* Register */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-semibold text-white">New here?</h3>
        <p className="mt-1 text-xs text-white/45">
          Create an account with a passkey — no wallet needed.
        </p>
        <div className="mt-3 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleRegister}
            disabled={mode === "loading" || !email.trim()}
            className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10 disabled:opacity-50"
          >
            {mode === "loading" ? "Creating…" : "Create account with passkey"}
          </button>
        </div>
      </div>

      {/* Login */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-semibold text-white">Returning?</h3>
        <p className="mt-1 text-xs text-white/45">
          Sign in with your saved passkey — Touch ID, Face ID, or device PIN.
        </p>
        <button
          type="button"
          onClick={handleLogin}
          disabled={mode === "loading"}
          className="mt-3 w-full rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          {mode === "loading" ? "Signing in…" : "Sign in with passkey"}
        </button>
      </div>

      {error && <p className="text-center text-xs text-red-400/90">{error}</p>}
    </div>
  );
}
