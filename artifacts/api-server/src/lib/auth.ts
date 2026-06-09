import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, admin } from "better-auth/plugins";
import {
  db,
  baUserTable,
  baSessionTable,
  baAccountTable,
  baVerificationTable,
} from "@workspace/db";

const domain = process.env.REPLIT_DEV_DOMAIN;
const port = process.env.PORT ?? "8080";

const baseURL = domain
  ? `https://${domain}/api/auth`
  : `http://localhost:${port}/api/auth`;

const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret && process.env.NODE_ENV !== "development") {
  throw new Error("BETTER_AUTH_SECRET environment variable is required in non-development environments");
}

export const auth = betterAuth({
  secret: authSecret ?? "dev-secret-local-only",
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: baUserTable,
      session: baSessionTable,
      account: baAccountTable,
      verification: baVerificationTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: true,
  },
  plugins: [bearer(), admin()],
  trustedOrigins: domain ? [`https://${domain}`] : ["*"],
});
