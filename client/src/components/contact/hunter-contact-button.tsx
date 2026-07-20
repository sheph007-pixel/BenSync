import { useState } from "react";
import { LifeBuoy, Mail, Phone } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const HUNTER_EMAIL = "hunter@kennion.com";
// Phone stored as parts so it doesn't appear as plain text in the
// shipped JS. Same anti-scrape pattern as click-to-reveal-phone.
const HUNTER_PHONE_PARTS = ["205", "641", "0469"];

export function HunterContactButton() {
  const [open, setOpen] = useState(false);
  const phoneDisplay = `(${HUNTER_PHONE_PARTS[0]}) ${HUNTER_PHONE_PARTS[1]}-${HUNTER_PHONE_PARTS[2]}`;
  const phoneTel = `tel:+1${HUNTER_PHONE_PARTS.join("")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Contact your BenSync advisor"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          data-testid="button-contact-hunter"
        >
          <LifeBuoy className="h-6 w-6" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={12} className="w-80">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Need a hand?
            </div>
            <div className="mt-1 text-base font-semibold">Hunter Shepherd</div>
            <div className="text-xs text-muted-foreground">
              Your BenSync advisor
            </div>
          </div>
          <div className="space-y-1 border-t pt-2">
            <a
              href={`mailto:${HUNTER_EMAIL}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-muted"
              data-testid="link-email-hunter"
            >
              <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{HUNTER_EMAIL}</span>
            </a>
            <a
              href={phoneTel}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-muted"
              data-testid="link-call-hunter"
            >
              <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{phoneDisplay}</span>
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
