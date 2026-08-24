/**
 * Shared layout primitives for full-page error screens (AppErrorPage,
 * NotFoundErrorPage) - a consistent header/description/actions shape so
 * every error screen looks the same regardless of what triggered it.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "flex h-full flex-col items-center justify-center bg-red-50 p-8 text-center",
        className
      )}
    >
      <div className="text-center">
        <p className="font-semibold text-base text-red-600">Error</p>
        {children}
      </div>
    </main>
  );
}

export function ErrorHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "mt-4 font-bold text-3xl text-gray-900 tracking-tight sm:text-5xl",
        className
      )}
    >
      {children}
    </h1>
  );
}

export function ErrorDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-6 text-base text-gray-600 leading-7", className)}>
      {children}
    </p>
  );
}

export function ErrorActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-10 flex items-center justify-center gap-x-6",
        className
      )}
    >
      {children}
    </div>
  );
}
