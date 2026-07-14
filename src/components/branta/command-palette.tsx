import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { LayoutDashboard, Users, Settings, Mail, Calendar, LogOut } from "lucide-react";
import { auth } from "@/lib/auth";
import { toast } from "sonner";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or run a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go("/app")}>
            <LayoutDashboard className="size-4" />
            <span>Overview</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/app/leads")}>
            <Users className="size-4" />
            <span>Leads</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/app/settings")}>
            <Settings className="size-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              toast("New lead", { description: "Available in phase 2." });
            }}
          >
            <Users className="size-4" />
            <span>New lead</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              toast("Compose email", { description: "Available in phase 2." });
            }}
          >
            <Mail className="size-4" />
            <span>Compose email</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              toast("Schedule meeting", { description: "Available in phase 2." });
            }}
          >
            <Calendar className="size-4" />
            <span>Schedule meeting</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Session">
          <CommandItem
            onSelect={async () => {
              setOpen(false);
              await auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
