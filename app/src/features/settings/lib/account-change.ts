import type { SettingsTab } from "@/shared/stores/use-ui-store";

const REOPEN_SETTINGS_AFTER_ACCOUNT_CHANGE_KEY =
  "comet:reopen-settings-after-account-change";

type AccountChangePreparedDetail = {
  ok: boolean;
  message?: string;
};

export async function prepareForAccountChange(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener(
        "comet:account-change-prepared",
        handlePrepared as EventListener,
      );
      reject(new Error("Timed out while saving the current draft."));
    }, 5000);

    const handlePrepared = (event: Event) => {
      const customEvent = event as CustomEvent<AccountChangePreparedDetail>;
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "comet:account-change-prepared",
        handlePrepared as EventListener,
      );

      if (customEvent.detail?.ok) {
        resolve();
        return;
      }

      reject(
        new Error(
          customEvent.detail?.message ?? "Couldn't save the current draft.",
        ),
      );
    };

    window.addEventListener(
      "comet:account-change-prepared",
      handlePrepared as EventListener,
      { once: true },
    );
    window.dispatchEvent(new CustomEvent("comet:prepare-account-change"));
  });
}

export function preserveSettingsAcrossReload(tab: SettingsTab) {
  try {
    window.sessionStorage.setItem(
      REOPEN_SETTINGS_AFTER_ACCOUNT_CHANGE_KEY,
      tab,
    );
  } catch {
    // Ignore session storage failures and fall back to a normal reload.
  }
}
