/**
 * App-wide provider stack - error boundary, tooltips, live theme
 * application, window-size sync, and the app-update checker - shared by
 * every screen regardless of vault/router state.
 */

import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppUpdateChecker } from "@/features/app-update/use-app-update";
import AppErrorPage from "@/features/errors/app-error";
import { WindowSizeApplier } from "@/features/home/window-size-applier";
import { ThemeApplier } from "@/features/themes/theme-applier";

/** Wraps `children` in the provider stack described in the file header. */
export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>Loading...</>}>
      <ErrorBoundary FallbackComponent={AppErrorPage}>
        <TooltipProvider>
          <ThemeApplier />
          <WindowSizeApplier />
          <AppUpdateChecker />
          {children}
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    </Suspense>
  );
}
