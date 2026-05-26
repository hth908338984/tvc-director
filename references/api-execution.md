# API Execution Layer

> Use this reference when the user wants this skill to call image/video APIs instead of only writing Markdown prompts.

## Principle

The skill still behaves as the director. It creates the creative plan, product asset prompt, storyboard prompt, and video prompt. The API layer is only the production runner:

1. Generate product multiview image.
2. Generate storyboard grid using the product multiview as an image reference.
3. Generate final video using storyboard grid + product multiview.
4. Save all outputs under the project render directory.

Do not put API keys in `SKILL.md`, project docs, or prompt files. Keep secrets in environment variables.

## Files

- `config/tvc-director.config.example.json`: copy this to a private config file and fill provider endpoints.
- `scripts/run-pipeline.mjs`: zero-dependency Node runner for the configured pipeline.

## Supported Image Provider

### `gemini-image`

Use for Nano Banana / Nano Banana Pro style image generation through Gemini API compatible `generateContent`.

Required config:

- `apiKeyEnv`: environment variable name that contains the API key.
- `model`: image model id.
- `endpoint`: endpoint template. `{model}` is replaced from config.
- `responseModalities`: usually `["TEXT", "IMAGE"]`.

The runner sends text prompts and optional input images as inline image data. It extracts the first returned inline image and saves it as PNG/JPEG/WebP based on MIME type.

## Supported Video Provider

### `http-task`

Use for Seedance / Jimeng / other async video APIs when the API follows this general shape:

1. Submit task.
2. Receive task id.
3. Poll task status.
4. Download final video URL.

Required config:

- `submit.endpoint`, `submit.method`, `submit.headers`, `submit.body`, `submit.taskIdPath`
- `poll.endpoint`, `poll.method`, `poll.headers`, `poll.statusPath`, `poll.videoUrlPath`
- `successValues`, `failureValues`, `intervalMs`, `timeoutMs`

Template variables:

- `{apiKey}`: value from `apiKeyEnv`
- `{model}`: video model id
- `{videoPrompt}`: prompt file content
- `{productImage}`: product multiview image reference
- `{storyboardImage}`: storyboard grid image reference
- `{taskId}`: task id returned by submit response

`imageReferenceMode` controls how local images are passed into the video request:

- `dataUrl`: embed local images as data URLs.
- `filePath`: pass absolute local file paths.

If the provider requires public image URLs, upload the images to your own storage first and set provider-specific submit body fields manually.

## Run

```bash
cp config/tvc-director.config.example.json config/tvc-director.config.local.json
export GEMINI_API_KEY="..."
export SEEDANCE_API_KEY="..."
node scripts/run-pipeline.mjs --config config/tvc-director.config.local.json
```

For image-only smoke tests, keep `video.enabled` as `false`.

## Commercial Safety

- Store source prompts, generated assets, and final video together for reproducibility.
- Keep generated text/logos out of the image model when possible; add brand text in post.
- For client work, save accepted prompts and model ids in the delivery folder.
