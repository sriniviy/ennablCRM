import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { EnnablLogo } from "@/components/brand/ennabl-logo";

type Stage = "loading" | "ready" | "invalid" | "submitting" | "done";

export function SetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setStage("invalid"); return; }
    fetch(`/api/team/invite/${token}`)
      .then((r) => r.json())
      .then((data: { email?: string; name?: string | null; error?: string }) => {
        if (data.error || !data.email) { setStage("invalid"); return; }
        setEmail(data.email);
        setMemberName(data.name ?? "");
        setStage("ready");
      })
      .catch(() => setStage("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setStage("submitting");

    try {
      const signInResult = await authClient.signIn.email({ email, password: token });
      if (signInResult.error) throw new Error(signInResult.error.message ?? "Sign-in failed");

      const changeResult = await authClient.changePassword({
        currentPassword: token,
        newPassword,
        revokeOtherSessions: true,
      });
      if (changeResult.error) throw new Error(changeResult.error.message ?? "Password change failed");

      await fetch(`/api/team/invite/${token}`, { method: "DELETE" }).catch(() => {});

      setStage("done");
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? "Something went wrong. The link may have already been used.");
      setStage("ready");
    }
  };

  /* ── layout shell ── */
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <EnnablLogo className="h-9 w-auto" />
        </div>

        {/* Loading */}
        {stage === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Validating your invite link…</p>
          </div>
        )}

        {/* Invalid */}
        {stage === "invalid" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <h2 className="font-semibold mb-1">Invite link expired</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This link is invalid or has already been used. Ask your admin to send a new one.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/sign-in")}>
              Go to sign in
            </Button>
          </div>
        )}

        {/* Done */}
        {stage === "done" && (
          <div className="rounded-lg border bg-card p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h2 className="font-semibold mb-1">Password set!</h2>
            <p className="text-sm text-muted-foreground">
              Taking you to the dashboard…
            </p>
          </div>
        )}

        {/* Ready / submitting */}
        {(stage === "ready" || stage === "submitting") && (
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-5">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 mb-3">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <h2 className="font-semibold text-lg">Set your password</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Welcome{memberName ? `, ${memberName.split(" ")[0]}` : ""}! Choose a password for{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-new">New password</Label>
                <div className="relative">
                  <Input
                    id="sp-new"
                    type={showPw ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={stage === "submitting"}
                    autoFocus
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-confirm">Confirm password</Label>
                <Input
                  id="sp-confirm"
                  type={showPw ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={stage === "submitting"}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={stage === "submitting"}>
                {stage === "submitting" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Setting password…</>
                ) : (
                  "Set password & sign in"
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
