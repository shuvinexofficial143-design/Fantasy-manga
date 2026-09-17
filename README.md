# Fantasy Manga — Cinematic Studio

This repository is the new cinematic-image project built from the StoryFrame visual layout.

## Key difference from the old manga workflow

- Same dark/violet StoryFrame-style workspace and navigation language.
- Same project/story/character/location/reference workflow.
- **No manga panel sheets.**
- **No webtoon slicing.**
- **No page composer.**
- Each planned story moment generates **one complete cinematic painting / full-frame image**.
- Character and location reference photos are supported for similarity when Vertex Gemini is configured.

## Local development

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

## Image providers

Primary: Google Cloud Vertex AI Gemini image generation when configured.

Fallback: Pollinations public image endpoint. The fallback is text-only and cannot use uploaded reference images.

Copy `.env.example` to `.env.local` and fill only server-side environment variables. Never commit secrets.
