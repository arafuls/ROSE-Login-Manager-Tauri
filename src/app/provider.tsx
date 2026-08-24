import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppUpdateChecker } from "@/features/app-update/use-app-update";
import AppErrorPage from "@/features/errors/app-error";
import { ThemeApplier } from "@/features/themes/theme-applier";

export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>Loading...</>}>
      <ErrorBoundary FallbackComponent={AppErrorPage}>
        <TooltipProvider>
          <ThemeApplier />
          <AppUpdateChecker />
          {children}
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    </Suspense>
  );
}
