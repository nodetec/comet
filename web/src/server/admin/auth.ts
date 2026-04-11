import { createServerFn } from "@tanstack/react-start";
import {
  setAdminSession,
  clearAdminSession,
  isAdminAuthenticated,
} from "../middleware";

export const login = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (data.token !== process.env.ADMIN_TOKEN) {
      return { ok: false as const, error: "Invalid token" };
    }
    setAdminSession();
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearAdminSession();
  return { ok: true };
});

export const checkAuth = createServerFn({ method: "GET" }).handler(
  async () => ({ authenticated: isAdminAuthenticated() }),
);
