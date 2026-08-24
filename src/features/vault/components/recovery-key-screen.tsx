/** The one-time, post-setup recovery-key display screen. */

import { Check, Copy, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useVault } from "@/features/vault/vault-provider";

/**
 * Shown exactly once, right after vault_setup, since the recovery key is
 * never retrievable again after this screen closes - only a wrapped copy of
 * it survives in the database, not the key itself. Requires an explicit
 * acknowledgment (not just a toast) before letting the user continue, since
 * this is the only chance they get to save it.
 */
export function RecoveryKeyScreen() {
  const { recoveryKey, confirmRecoveryKeySaved } = useVault();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!recoveryKey) {
      return;
    }
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldAlert className="size-6" />
          </div>
          <CardTitle>Save your recovery key</CardTitle>
          <CardDescription>
            If you ever forget your passphrase, this is the only way back into
            your vault. It won't be shown again after this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted p-4 text-center font-mono text-sm tracking-wide">
            {recoveryKey}
          </div>
          <Button
            className="w-full"
            onClick={handleCopy}
            type="button"
            variant="outline"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy to clipboard
              </>
            )}
          </Button>

          <label
            className="flex items-start gap-2 text-sm"
            htmlFor="recovery-key-saved"
          >
            <Checkbox
              checked={saved}
              className="mt-0.5"
              id="recovery-key-saved"
              onCheckedChange={(checked) => setSaved(checked === true)}
            />
            <span>
              I've saved this recovery key somewhere safe (a password manager,
              printed and stored securely, etc.)
            </span>
          </label>

          <Button
            className="w-full"
            disabled={!saved}
            onClick={confirmRecoveryKeySaved}
            type="button"
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
