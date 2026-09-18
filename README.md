# Fantasy Manga — Cinematic Studio

Cinematic full-image story generator based on the StoryFrame workflow, with continuity tracking for recurring characters, locations, actions and previous frames.

## Google Cloud only

This project is intentionally configured for **Google Cloud Vertex AI only**.

- Story / continuity analysis: `GEMINI_STORY_MODEL=gemini-3.1-pro-preview`
- Image generation: `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`
- Vertex endpoint: `aiplatform.googleapis.com`
- No Pollinations / Cloudflare / other image fallback is used.

## Vercel environment variables

Required:

- `VERTEX_AI_PROJECT_ID`
- `VERTEX_AI_LOCATION=global`
- `GEMINI_STORY_MODEL=gemini-3.1-pro-preview`
- `VERTEX_STORY_TIMEOUT_MS=120000`
- `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`
- `FANTASY_DEFAULT_IMAGE_PROVIDER=gemini`

For authentication choose one:

### Option A — Google Cloud authorization/API key

Set:

- `VERTEX_AI_API_KEY`

The key must be usable with Vertex AI / `aiplatform.googleapis.com`. A normal unrestricted API key that is not accepted by Vertex AI will not work.

### Option B — Service account JSON

Set:

- `VERTEX_AI_SERVICE_ACCOUNT_JSON`

Open the downloaded service-account `.json` file in any text editor, copy the **entire JSON from the first `{` to the last `}`**, and paste it as one Vercel secret value. Do not commit the JSON file to GitHub.

Optional alternative:

- `VERTEX_AI_SERVICE_ACCOUNT_BASE64` — base64 of the complete JSON file.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

Secrets belong only in Vercel Environment Variables / local `.env.local`; never commit real keys or service-account JSON to the repository.
