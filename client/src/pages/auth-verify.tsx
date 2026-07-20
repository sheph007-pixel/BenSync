import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { KennionLogo } from "@/components/kennion-logo";

export default function AuthVerifyPage() {
  const { verifyMagicLink } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setErrorMessage("No sign-in token found. Please request a new link.");
      return;
    }

    verifyMagicLink(token)
      .then(() => {
        setStatus("success");
        setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMessage(err.message || "This link is invalid or expired. Please request a new one.");
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <KennionLogo size="md" />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md p-8">
          <div className="text-center space-y-4">
            {status === "verifying" && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                <h1 className="text-xl font-semibold" data-testid="text-verifying">Signing you in...</h1>
                <p className="text-sm text-muted-foreground">Please wait while we verify your link.</p>
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <h1 className="text-xl font-semibold" data-testid="text-success">You're signed in!</h1>
                <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
              </>
            )}
            {status === "error" && (
              <>
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <h1 className="text-xl font-semibold" data-testid="text-error">Sign-in failed</h1>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <Button onClick={() => navigate("/portal")} className="mt-4" data-testid="button-try-again">
                  Try Again
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
