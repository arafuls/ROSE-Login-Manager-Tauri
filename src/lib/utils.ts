/** Shared Tailwind class-name helper (the standard shadcn/ui `cn` utility). */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names via clsx, then resolves conflicting Tailwind utilities via tailwind-merge. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
