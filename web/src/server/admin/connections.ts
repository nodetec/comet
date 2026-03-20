import { createServerFn } from "@tanstack/react-start";
import { assertAdmin } from "~/server/middleware";
import { getRelayConnections } from "~/server/relay-client";

export const listConnections = createServerFn({ method: "GET" }).handler(
  async () => {
    assertAdmin();
    return getRelayConnections();
  },
);
