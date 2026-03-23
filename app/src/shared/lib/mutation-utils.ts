import { toast } from "sonner";

import { errorMessage } from "@/shared/lib/utils";

export function toastErrorHandler(
  message: string,
  toastId: string,
  fallback = "Try again.",
) {
  return (error: unknown) => {
    toast.error(message, {
      description: errorMessage(error, fallback),
      id: toastId,
    });
  };
}
