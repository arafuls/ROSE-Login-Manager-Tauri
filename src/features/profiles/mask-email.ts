/** Respects the displayEmail/maskEmail settings wherever a profile's email is shown. */

import type { Settings } from "@/features/settings/types";

/**
 * Shared by both places a profile's email can be shown (the Profiles page's
 * `ProfileCard` and the Home screen's `HomeProfileRow`) so `displayEmail`/
 * `maskEmail` behave identically everywhere a profile is listed, rather
 * than only working on one page.
 */
export function getEmailText(
  email: string,
  settings: Settings | null
): string | null {
  if (!settings?.displayEmail) {
    return null;
  }
  return settings.maskEmail ? maskEmail(email) : email;
}

/**
 * Ported from the old app's `ProfileCardViewModel.Mask`: keeps the first and
 * last character of the local part and asterisks out the middle, leaving
 * the domain untouched.
 */
export function maskEmail(email: string): string {
  if (!email) {
    return "";
  }
  const atIndex = email.indexOf("@");
  if (atIndex === -1) {
    return email;
  }
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);

  let maskedLocalPart: string;
  if (localPart.length === 0) {
    maskedLocalPart = "";
  } else if (localPart.length === 1) {
    maskedLocalPart = localPart;
  } else if (localPart.length === 2) {
    maskedLocalPart = `${localPart[0]}*`;
  } else {
    // biome-ignore lint/style/useAtIndex: tsconfig targets ES2020 (no String.prototype.at); keep indexed access.
    maskedLocalPart = `${localPart[0]}${"*".repeat(localPart.length - 2)}${localPart[localPart.length - 1]}`;
  }

  return `${maskedLocalPart}@${domainPart}`;
}
