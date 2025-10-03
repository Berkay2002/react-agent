Based on the official documentation provided, here's the corrected setup process:

## Required Packages

Install the **extensions package** for the AI SDK adapter:[1]

```bash
npm install @openai/agents-sdk
```

Then install the Google provider from Vercel AI SDK:[1]

```bash
npm install @ai-sdk/google
```

## Integration Code

The adapter is imported from `@openai/agents-sdk/ai-sdk` (not a separate extensions package):[1]

```typescript
import { Agent } from "@openai/agents-sdk";
import { createAISDKModel } from "@openai/agents-sdk/ai-sdk";
import { google } from "@ai-sdk/google";

// Environment variable setup
const model = google("gemini-2.5-flash");

// Create agent with AI SDK model
const agent = new Agent({
  model: createAISDKModel(model),
  instructions: "You are a helpful assistant",
});
```

## Environment Variable

The `google()` provider automatically uses `GOOGLE_GENERATIVE_AI_API_KEY`, so just ensure it's set:[2]

```bash
# .env.local
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

## Provider Metadata (Optional)

If passing provider-specific options, use `providerMetadata` in the Agents SDK, which forwards to the underlying AI SDK model:[1]

```typescript
const response = await agent.run({
  message: "Your prompt",
  providerMetadata: {
    google: {
      // Google-specific options
      temperature: 0.7,
      topP: 0.9,
    },
  },
});
```

## Key Points

The **adapter is built-in** to `@openai/agents-sdk` under the `/ai-sdk` export path, eliminating the need for separate extension packages. The `createAISDKModel()` wrapper ensures full compatibility between the Vercel AI SDK model interface and the Agents SDK requirements. This setup supports any Vercel AI SDK-compatible model, not just Google.[1]

[1](https://openai.github.io/openai-agents-js/extensions/ai-sdk/)
[2](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
[3](https://openai.github.io/openai-agents-python/)
[4](https://github.com/openai/openai-agents-python)
[5](https://github.com/lastmile-ai/openai-agents-mcp)
[6](https://cookbook.openai.com/examples/agents_sdk/app_assistant_voice_agents)
[7](https://ai.google.dev/gemini-api/docs/openai)
[8](https://www.npmjs.com/package/@openai/agents)
[9](https://cloud.google.com/vertex-ai/generative-ai/docs/start/openai)
[10](https://brightdata.com/blog/ai/openai-sdk-and-web-unlocker)
[11](https://openai.com/index/new-tools-for-building-agents/)
[12](https://www.youtube.com/watch?v=gFcAfU3V1Zo)
[13](https://apipie.ai/docs/blog/top-10-opensource-ai-agent-frameworks-may-2025)
[14](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
[15](https://iamulya.one/posts/a-developer-guide-to-ai-agents-openai-agents-sdk-vs-google-adk/)
[16](https://pypi.org/project/openai-agents/)
[17](https://www.theunwindai.com/p/google-s-open-source-sdk-for-building-production-ai-apps)
