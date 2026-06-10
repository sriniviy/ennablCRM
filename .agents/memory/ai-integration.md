---
name: AI integration setup
description: How to set up Replit OpenAI integration for simple completions without the full template
---

For simple, non-streaming AI features (suggestions, classification, enrichment):

1. Call `setupReplitAIIntegrations({ providerSlug: "openai", providerUrlEnvVarName: "AI_INTEGRATIONS_OPENAI_BASE_URL", providerApiKeyEnvVarName: "AI_INTEGRATIONS_OPENAI_API_KEY" })` via code_execution.
2. Install `openai` in api-server: `pnpm --filter @workspace/api-server add openai`.
3. Create `artifacts/api-server/src/lib/openai-client.ts` with the pre-configured client.
4. Use `model: "gpt-5-mini"` for cost-effective tasks; `"gpt-5.4"` for complex reasoning.

**Why:** The full skill template (conversations/messages DB tables, SSE streaming, React hooks) is overkill for advisory features. A thin client + direct route is sufficient.

**How to apply:** Any time you need AI in the backend without streaming or persistent chat history.
