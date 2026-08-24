import { House, LogOut, Settings as SettingsIcon, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useVault } from "@/features/vault/vault-provider";

const NAV_ITEMS: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { to: "/", icon: House, label: "Home" },
  { to: "/profiles", icon: Users, label: "Profiles" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

/**
 * This app's own composition of the shared sidebar primitives - not a copy
 * of shadcn's sidebar-02 reference content (that block's version switcher,
 * search box, and nested doc-style nav groups are all specific to a docs
 * site and don't fit this app's flat 3-page nav). No SidebarHeader: the
 * custom title bar (src/components/title-bar.tsx) already shows the ROSE
 * logo/app name, so repeating it here would be redundant.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { lock } = useVault();

  return (
    <Sidebar
      // Overrides the primitive's own h-svh (100% of the true window
      // height) - now that the sidebar's fixed positioning correctly
      // starts below the title bar (see app/index.tsx's contain-layout),
      // an explicit h-svh instead overflows past the window's actual
      // bottom edge by the title bar's height, pushing the footer/Lock
      // button off-screen. h-auto lets top:0/bottom:0 compute the height
      // from the real containing block instead (standard CSS rule for
      // absolutely-positioned boxes: height = containing-block height
      // minus the top/bottom offsets, when height is auto).
      className="h-auto"
      collapsible="icon"
      {...props}
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
                const isActive =
                  to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(to);
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={to}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={lock}>
              <LogOut />
              <span>Lock</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
