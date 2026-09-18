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


## Novel chapter import

The **Novel Import** workspace can scan a public chapter URL, lock the successful source domain, analyze the chapter with the configured Vertex story model, append continuity-aware scenes, and optionally start image generation automatically.

Flow:

1. Enter the original novel name.
2. Paste the Chapter 1 direct URL.
3. Scan Chapter 1.
4. The successful website origin is locked.
5. Chapter 2, 3, and later scans reuse the same source through the detected Next Chapter link or saved URL template.
6. Each chapter is analyzed against existing characters, locations, previous chapter summary, and previous generated frames.
7. Scan/import errors are stored and displayed in the Novel Import error panel.

The scanner does **not** bypass login pages, paywalls, access-denied responses, or anti-bot protections. If a site cannot be read normally, paste/use a source you are permitted to access or provide chapter text manually in the Story workspace.


### Reliable novel input modes

Novel Import now supports three input paths:

1. **Direct Chapter URL** — best when the chapter page exposes readable public text.
2. **Novel / Story Page URL** — the importer looks for the requested chapter link on a public chapter list, then scans that chapter.
3. **Paste Chapter Text** — reliable fallback for sites that do not expose chapter text to server-side/public page requests. Pasted text goes directly to the same Vertex continuity analysis and image pipeline.

Source locking is only applied after a successful URL-based chapter scan. Pasted text does not bypass or unlock a protected source.
