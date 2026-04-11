import { useEffect, useEffectEvent } from "react";

import { errorMessage } from "@/shared/lib/utils";

export interface AccountChangePreparationDeps {
  flushCurrentDraftAsync: () => Promise<unknown>;
}

export function useAccountChangePreparation(
  deps: AccountChangePreparationDeps,
) {
  const handlePrepareAccountChange = useEffectEvent(() => {
    void (async () => {
      try {
        await deps.flushCurrentDraftAsync();
        window.dispatchEvent(
          new CustomEvent("comet:account-change-prepared", {
            detail: { ok: true },
          }),
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent("comet:account-change-prepared", {
            detail: {
              ok: false,
              message: errorMessage(error, "Couldn't save the current draft."),
            },
          }),
        );
      }
    })();
  });

  useEffect(() => {
    window.addEventListener(
      "comet:prepare-account-change",
      handlePrepareAccountChange,
    );
    return () => {
      window.removeEventListener(
        "comet:prepare-account-change",
        handlePrepareAccountChange,
      );
    };
  }, []);
}
