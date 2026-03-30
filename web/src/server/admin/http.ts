export async function getAdminErrorMessage(
  response: Response,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim() !== "") {
        return body.error;
      }
    } catch {
      // Fall through to plain text parsing.
    }
  }

  try {
    const body = (await response.text()).trim();
    if (body !== "") {
      return body;
    }
  } catch {
    // Ignore response parsing failures and use the status message below.
  }

  return `request failed with status ${response.status}`;
}
