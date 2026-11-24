# Shared Nashmi assistant

The Thirty Seconds service owns the Gemini configuration. Yemken Hay sends only explicit chat or referee requests to the private authenticated bridge; gameplay, clocks, scores and rooms remain on their existing servers. No polling or AI requests are added to normal question transitions. Unavailable shared judging falls back to the existing local answer evaluator. The host/reveal permission checks remain on Yemken Hay. Remote judge identifiers are temporary and team names/access tokens are not transferred.

## Activate on Render

1. Generate a random secret of at least 32 bytes using a trusted password generator. Set the identical value as NASHMI_SHARED_SECRET in the Environment settings of both services, never in a VITE_ variable, source code, or chat.
2. Deploy Thirty Seconds first, then Yemken Hay. Keep GEMINI_API_KEY on Thirty Seconds. The bridge is disabled without its secret. Until configured, Yemken Hay retains its prior local/provider path.
3. Confirm a chat and referee call on a test match; verify that a public screen before reveal cannot ask for the answer. Verify that a cold or unavailable assistant does not delay normal rounds. The new bridge does not implement shared account login.
