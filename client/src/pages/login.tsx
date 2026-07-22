import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { ArrowRight, Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const form = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: z.infer<typeof signInSchema>) {
    setIsLoading(true);
    try {
      // login() returns the fresh user and seeds the auth cache, so
      // we can navigate deterministically with no second round-trip.
      const user = await login(data.email, data.password);
      navigate(user?.role === "admin" ? "/admin" : "/dashboard");
    } catch (err: any) {
      const errMsg = err?.message || "";
      const clean =
        errMsg.replace(/^\d+:\s*/, "").replace(/[{}"]|message:/g, "").trim() ||
        "Invalid email or password.";
      toast({ title: "Login failed", description: clean, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Navy banner that the card overlaps */}
      <div
        className="absolute inset-x-0 top-0 h-[260px] bg-gradient-to-b text-white"
        style={{
          backgroundImage:
            "linear-gradient(180deg, hsl(215 55% 22%) 0%, hsl(215 50% 18%) 100%)",
        }}
        aria-hidden
      />
      <div className="absolute right-6 top-3 z-10">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex max-w-md flex-col items-center px-6 pt-16">
        <div className="text-center text-white">
          <img
            src="/brand/wordmark-header-reversed.png"
            alt="BenSync"
            className="mx-auto h-7 w-auto"
          />
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
            Broker Portal
          </div>
        </div>

        <Card className="mt-8 w-full p-7 shadow-lg" data-testid="card-sign-in">
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-sign-in-title">
            Sign in to your account
          </h1>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="pl-9"
                  {...form.register("email")}
                  data-testid="input-email"
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pl-9"
                  {...form.register("password")}
                  data-testid="input-password"
                />
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full gap-1.5"
              disabled={isLoading}
              data-testid="button-sign-in"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Card>

        <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          256-bit encryption · SOC 2 Type II
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} BenSync
        </div>
      </div>
    </div>
  );
}
