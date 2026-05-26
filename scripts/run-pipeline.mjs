#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || "config/tvc-director.config.local.json";
const config = JSON.parse(await readFile(configPath, "utf8"));
const skillRoot = process.cwd();
const projectRoot = resolvePath(skillRoot, config.project.rootDir);
const outputDir = resolvePath(skillRoot, config.project.outputDir);

await mkdir(outputDir, { recursive: true });

const productPrompt = await readProjectFile(config.image.promptFiles.productMultiview);
const productOutputPath = join(outputDir, config.image.outputs.productMultiview);
await generateGeminiImage({
  imageConfig: config.image,
  prompt: extractPrompt(productPrompt),
  outputPath: productOutputPath,
  inputImages: []
});
console.log(`product multiview: ${productOutputPath}`);

const storyboardPrompt = await readProjectFile(config.image.promptFiles.storyboardGrid);
const storyboardOutputPath = join(outputDir, config.image.outputs.storyboardGrid);
await generateGeminiImage({
  imageConfig: config.image,
  prompt: extractPrompt(storyboardPrompt),
  outputPath: storyboardOutputPath,
  inputImages: [productOutputPath]
});
console.log(`storyboard grid: ${storyboardOutputPath}`);

if (config.video?.enabled) {
  const videoPrompt = await readProjectFile(config.video.promptFile);
  const videoOutputPath = join(outputDir, config.video.output || "final-video.mp4");
  await generateHttpTaskVideo({
    videoConfig: config.video,
    prompt: extractVideoPrompt(videoPrompt),
    productImagePath: productOutputPath,
    storyboardImagePath: storyboardOutputPath,
    outputPath: videoOutputPath
  });
  console.log(`final video: ${videoOutputPath}`);
} else {
  console.log("video generation skipped: video.enabled is false");
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config") {
      parsed.config = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function resolvePath(baseDir, value) {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

async function readProjectFile(relativePath) {
  return readFile(join(projectRoot, relativePath), "utf8");
}

function extractPrompt(markdown) {
  const marker = "## Nano Banana Pro Prompt";
  const index = markdown.indexOf(marker);
  if (index < 0) return markdown.trim();
  const afterMarker = markdown.slice(index + marker.length).trim();
  const nextHeading = afterMarker.search(/\n## /);
  return (nextHeading >= 0 ? afterMarker.slice(0, nextHeading) : afterMarker).trim();
}

function extractVideoPrompt(markdown) {
  const marker = "## Multi-Phase Video Prompt";
  const index = markdown.indexOf(marker);
  if (index < 0) return markdown.trim();
  const afterMarker = markdown.slice(index + marker.length).trim();
  const nextHeading = afterMarker.search(/\n## /);
  return (nextHeading >= 0 ? afterMarker.slice(0, nextHeading) : afterMarker).trim();
}

async function generateGeminiImage({ imageConfig, prompt, outputPath, inputImages }) {
  if (imageConfig.provider !== "gemini-image") {
    throw new Error(`Unsupported image provider: ${imageConfig.provider}`);
  }

  const apiKey = readSecret(imageConfig.apiKeyEnv);
  const endpoint = template(imageConfig.endpoint, { model: imageConfig.model });
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);

  const parts = [{ text: prompt }];
  for (const imagePath of inputImages) {
    const { mimeType, data } = await readImageAsInlineData(imagePath);
    parts.push({ inlineData: { mimeType, data } });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: imageConfig.responseModalities || ["TEXT", "IMAGE"]
      }
    })
  });

  const payload = await readJsonResponse(response);
  const imagePart = findInlineImagePart(payload);
  if (!imagePart) {
    throw new Error(`Gemini response did not include an inline image: ${JSON.stringify(payload).slice(0, 1000)}`);
  }

  const imageBuffer = Buffer.from(imagePart.data, "base64");
  await writeFile(outputPath, imageBuffer);
}

async function generateHttpTaskVideo({
  videoConfig,
  prompt,
  productImagePath,
  storyboardImagePath,
  outputPath
}) {
  if (videoConfig.provider !== "http-task") {
    throw new Error(`Unsupported video provider: ${videoConfig.provider}`);
  }

  const apiKey = readSecret(videoConfig.apiKeyEnv);
  const productImage = await imageReference(productImagePath, videoConfig.imageReferenceMode);
  const storyboardImage = await imageReference(storyboardImagePath, videoConfig.imageReferenceMode);
  const variables = {
    apiKey,
    model: videoConfig.model,
    videoPrompt: prompt,
    productImage,
    storyboardImage
  };

  const submitResponse = await templatedFetch(videoConfig.submit, variables);
  const taskId = getPath(submitResponse, videoConfig.submit.taskIdPath);
  if (!taskId) {
    throw new Error(`Video submit response did not include task id at ${videoConfig.submit.taskIdPath}`);
  }

  const started = Date.now();
  const pollConfig = videoConfig.poll;
  while (Date.now() - started < pollConfig.timeoutMs) {
    await sleep(pollConfig.intervalMs);
    const pollResponse = await templatedFetch(pollConfig, { ...variables, taskId });
    const status = String(getPath(pollResponse, pollConfig.statusPath) || "").toLowerCase();

    if ((pollConfig.failureValues || []).map(String).map((x) => x.toLowerCase()).includes(status)) {
      throw new Error(`Video task failed with status "${status}": ${JSON.stringify(pollResponse).slice(0, 1000)}`);
    }

    if ((pollConfig.successValues || []).map(String).map((x) => x.toLowerCase()).includes(status)) {
      const videoUrl = getPath(pollResponse, pollConfig.videoUrlPath);
      if (!videoUrl) {
        throw new Error(`Video task succeeded but no video URL at ${pollConfig.videoUrlPath}`);
      }
      await downloadFile(videoUrl, outputPath);
      return;
    }

    console.log(`video task ${taskId}: ${status || "pending"}`);
  }

  throw new Error(`Video task timed out after ${pollConfig.timeoutMs}ms`);
}

async function templatedFetch(requestConfig, variables) {
  const endpoint = template(requestConfig.endpoint, variables);
  const headers = templateObject(requestConfig.headers || {}, variables);
  const init = {
    method: requestConfig.method || "GET",
    headers
  };

  if (requestConfig.body !== undefined) {
    init.body = JSON.stringify(templateObject(requestConfig.body, variables));
  }

  const response = await fetch(endpoint, init);
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON response from ${response.url}, got: ${text.slice(0, 1000)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${response.url}: ${JSON.stringify(payload).slice(0, 1000)}`);
  }

  return payload;
}

function findInlineImagePart(payload) {
  const parts = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data) {
      return inlineData;
    }
  }
  return null;
}

async function imageReference(imagePath, mode) {
  if (mode === "filePath") return resolve(imagePath);
  if (mode === "dataUrl" || !mode) {
    const { mimeType, data } = await readImageAsInlineData(imagePath);
    return `data:${mimeType};base64,${data}`;
  }
  throw new Error(`Unsupported imageReferenceMode: ${mode}`);
}

async function readImageAsInlineData(imagePath) {
  const data = await readFile(imagePath);
  return {
    mimeType: mimeTypeForPath(imagePath),
    data: data.toString("base64")
  };
}

function mimeTypeForPath(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function template(value, variables) {
  return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (variables[key] === undefined) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return String(variables[key]);
  });
}

function templateObject(value, variables) {
  if (typeof value === "string") return template(value, variables);
  if (Array.isArray(value)) return value.map((item) => templateObject(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, templateObject(item, variables)]));
  }
  return value;
}

function getPath(value, path) {
  if (!path) return value;
  return path.split(".").reduce((current, key) => current?.[key], value);
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status} ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

function readSecret(envName) {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
