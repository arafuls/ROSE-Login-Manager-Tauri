/** The "/" route - re-exports HomeScreen as this route's lazy-loaded component. */

import { HomeScreen } from "@/features/home/components/home-screen";

// Necessary for react router to lazy load.
export const Component = HomeScreen;
