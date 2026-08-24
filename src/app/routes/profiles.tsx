/** The "/profiles" route - re-exports ProfileList as this route's lazy-loaded component. */

import { ProfileList } from "@/features/profiles/components/profile-list";

// Necessary for react router to lazy load.
export const Component = ProfileList;
