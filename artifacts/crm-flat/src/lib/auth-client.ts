import { createAuthClient } from "better-auth/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
});
