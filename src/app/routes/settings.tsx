/** The "/settings" route - re-exports SettingsPage as this route's lazy-loaded component. */

import { SettingsPage } from "@/features/settings/components/settings-page";

// Necessary for react router to lazy load.
export const Component = SettingsPage;
