import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../packages/data/src/schema.ts",
  out: "../packages/data/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/relay",
  },
});
