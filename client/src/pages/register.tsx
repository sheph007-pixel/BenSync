import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { ArrowRight, Loader2, Mail, Building2, Phone, User, Lock, ShieldCheck, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { US_STATES } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";

// Personal email domains blocklist
const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'ymail.com', 'rocketmail.com', 'protonmail.com', 'mail.com',
  'gmx.com', 'zoho.com', 'inbox.com', 'hey.com'
];

function isValidUSPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits[0] === '1') return true;
  return false;
}

const registerFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address").refine(
    (email) => {
      const domain = email.split('@')[1]?.toLowerCase();
      return !BLOCKED_EMAIL_DOMAINS.includes(domain);
    },
    { message: "Please use your business email (not Gmail, Yahoo, Hotmail, etc.)" }
  ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(1, "Phone number is required").refine(
    isValidUSPhone,
    { message: "Please enter a valid US phone number (10 digits)" }
  ),
  companyName: z.string().min(1, "Company name is required"),
  state: z
    .string()
    .min(2, "2-letter state required")
    .max(2, "Use the 2-letter state code")
    .transform((s) => s.trim().toUpperCase()),
  zipCode: z.string().refine((s) => /^\d{5}(-\d{4})?$/.test(s.trim()), {
    message: "Enter a 5-digit ZIP",
  }),
});

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const { register: registerUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const form = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      phone: "",
      companyName: "",
      state: "",
      zipCode: "",
    },
  });

  async function onSubmit(data: z.infer<typeof registerFormSchema>) {
    setIsLoading(true);
    try {
      const result = await registerUser(data);

      if (result?.pending) {
        setPendingApproval(true);
        setSubmittedEmail(data.email);
        return;
      }

      if (result?.verified) {
        toast({ title: "Welcome!", description: "Your account has been created successfully." });
        setTimeout(() => navigate("/dashboard"), 500);
        return;
      }

      setPendingApproval(true);
      setSubmittedEmail(data.email);
    } catch (err: any) {
      const errMsg = err.message || "";
      const cleanMessage = errMsg.replace(/^\d+:\s*/, "").replace(/[{}"]|message:/g, "").trim() || "Please try again.";
      toast({
        title: "Registration failed",
        description: cleanMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Navy banner that the card overlaps - exact match to /login */}
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

      <div className="relative mx-auto flex max-w-md flex-col items-center px-6 pt-16 pb-12">
        <div className="text-center text-white">
          <img
            src="/brand/wordmark-header-reversed.png"
            alt="BenSync"
            className="mx-auto h-9 w-auto"
          />
        </div>

        {pendingApproval ? (
          <Card className="mt-8 w-full p-7 shadow-lg" data-testid="card-pending-approval">
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-pending-approval-title">
              You&rsquo;re in line.
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Registered:{" "}
              <span className="font-medium text-foreground" data-testid="text-submitted-email">{submittedEmail}</span>
            </p>

            <p className="mt-5 text-sm text-muted-foreground leading-[1.55]">
              Our team reviews every new account before granting access. You&rsquo;ll get a confirmation email at the address above as soon as your account is approved. There&rsquo;s nothing else you need to do.
            </p>

            <div className="mt-5 border-t pt-4 text-center text-xs text-muted-foreground">
              <Link href="/" className="font-semibold text-primary hover:underline" data-testid="link-back-home">
                Back to homepage
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="mt-8 w-full p-6 shadow-lg" data-testid="card-create-account">
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-register-title">
              Submit Your Group
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-[1.5]">
              Once you create your account, you can upload your census and view your employee benefits proposal.
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="firstName">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      placeholder="John"
                      className="pl-9"
                      {...form.register("firstName")}
                      data-testid="input-first-name"
                    />
                  </div>
                  {form.formState.errors.firstName && (
                    <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Smith"
                    {...form.register("lastName")}
                    data-testid="input-last-name"
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Business Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
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

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 8 characters"
                    className="pl-9"
                    {...form.register("password")}
                    data-testid="input-password"
                  />
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className="pl-9"
                      {...form.register("phone")}
                      data-testid="input-phone"
                    />
                  </div>
                  {form.formState.errors.phone && (
                    <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="companyName">Company</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      placeholder="Acme Corp"
                      className="pl-9"
                      {...form.register("companyName")}
                      data-testid="input-company-name"
                    />
                  </div>
                  {form.formState.errors.companyName && (
                    <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                <div className="space-y-1">
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={form.watch("state") || ""}
                    onValueChange={(v) =>
                      form.setValue("state", v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger id="state" data-testid="input-state">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code}, {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.state && (
                    <p className="text-xs text-destructive">{form.formState.errors.state.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    placeholder="35243"
                    {...form.register("zipCode")}
                    data-testid="input-zip-code"
                  />
                  {form.formState.errors.zipCode && (
                    <p className="text-xs text-destructive">{form.formState.errors.zipCode.message}</p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-1.5 mt-1"
                disabled={isLoading}
                data-testid="button-register"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Submit <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 border-t pt-3 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/portal" className="font-semibold text-primary hover:underline" data-testid="link-login">
                Sign In
              </Link>
            </div>
          </Card>
        )}

        {/* Trust + support footer - same pattern as /login */}
        <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          256-bit encryption &middot; SOC 2 Type II
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5" />
          Need help?{" "}
          <a
            href="/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
            data-testid="link-support"
          >
            Open a support ticket
          </a>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} BenSync
        </div>
      </div>
    </div>
  );
}
