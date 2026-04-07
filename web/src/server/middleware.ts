import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";

const SESSION_COOKIE = "admin_session";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function assertAdmin(): void {
  const token = getCookie(SESSION_COOKIE);
  if (!token || token !== process.env.ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export function setAdminSession(): void {
  setCookie(SESSION_COOKIE, process.env.ADMIN_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SEVEN_DAYS,
    path: "/",
  });
}

export function clearAdminSession(): void {
  deleteCookie(SESSION_COOKIE);
}

export function isAdminAuthenticated(): boolean {
  const token = getCookie(SESSION_COOKIE);
  return !!token && token === process.env.ADMIN_TOKEN;
}

const USER_SESSION_COOKIE = "user_session";

export function setUserSession(pubkey: string): void {
  setCookie(USER_SESSION_COOKIE, pubkey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SEVEN_DAYS,
    path: "/",
  });
}

export function clearUserSession(): void {
  deleteCookie(USER_SESSION_COOKIE);
}

export function getUserPubkey(): string | null {
  return getCookie(USER_SESSION_COOKIE) ?? null;
}

export function assertUser(): string {
  const pubkey = getUserPubkey();
  if (!pubkey) {
    throw new Error("Unauthorized");
  }
  return pubkey;
}
