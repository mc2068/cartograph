import { OrganizationSwitcher, Show, UserButton } from "@clerk/nextjs";
import type { Theme } from "./theme";
import { ThemeControl } from "./theme-control";

export function Header({ theme }: { theme: Theme }) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 text-xs">
      <div className="flex items-center gap-3">
        <span className="font-medium">Cartograph</span>
        <Show when="signed-in">
          {/* Switching, creating and inviting all live in this one control.
              hidePersonal because every session here belongs to a team. */}
          <OrganizationSwitcher hidePersonal />
        </Show>
      </div>
      <div className="flex items-center gap-3">
        <ThemeControl initial={theme} />
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
