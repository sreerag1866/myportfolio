/**
 * MetaAiArt — Cloudflare Worker: Anthropic API Proxy
 * ====================================================
 * Deploy this to Cloudflare Workers (free tier is plenty).
 * Set the secret:  wrangler secret put ANTHROPIC_API_KEY
 *
 * This worker:
 *   1. Accepts POST /api/anime   { image_base64, mime_type }
 *   2. Forwards to api.anthropic.com/v1/messages
 *   3. Returns { image_url: "data:image/png;base64,..." }
 *   4. Enforces CORS so only your domain can call it
 *   5. Validates file size (max 5 MB base64 ≈ 3.75 MB raw)
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Change this to your domain once deployed
const ALLOWED_ORIGIN = "https://metaaiart.com";

// The exact anime prompt used for every generation
const ANIME_PROMPT = `Create a trending anime art style image from the uploaded subject.
Use confident line-work with slight variation and minimal cel shading using flat shadow shapes.
Use bright, saturated colors and clean graphic lighting.
The style is defined by exaggerated, cartoonish character proportions featuring highly expressive,
simplistic facial features that allow for immense emotional range, with highly varied stretched anatomy.
Transform the environment into a slightly warped space with playful perspective distortion and simplified objects.
Composition and tone should be energetic, lively, and comedic in a fully stylized, non-realistic world.

IMPORTANT RESPONSE FORMAT:
Return ONLY a valid base64-encoded PNG image using this exact format with no other text:
data:image/png;base64,<base64_data>`;

// ─── CORS HEADERS ──────────────────────────────────────────────────────────
function corsHeaders(origin) {
  // Allow the production domain + localhost for development
  const allowed = [ALLOWED_ORIGIN, "http://localhost:3000", "http://127.0.0.1:5500"];
  const useOrigin = allowed.includes(origin) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": useOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    // ── Preflight ──
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ── Health check ──
    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({ ok: true, service: "MetaAiArt Anime Proxy" }, 200, origin);
    }

    // ── Only accept POST /api/anime ──
    if (url.pathname !== "/api/anime" || request.method !== "POST") {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }

    // ── Parse body ──
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
    }

    const { image_base64, mime_type } = body;

    if (!image_base64 || !mime_type) {
      return jsonResponse({ error: "Missing image_base64 or mime_type" }, 400, origin);
    }

    // Validate mime type
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedMimes.includes(mime_type)) {
      return jsonResponse({ error: "Unsupported image type. Use JPEG, PNG, or WebP." }, 400, origin);
    }

    // Validate base64 size (5 MB of base64 ≈ 3.75 MB raw — well within Claude's limit)
    if (image_base64.length > 5 * 1024 * 1024) {
      return jsonResponse({ error: "Image too large. Please use an image under 4 MB." }, 413, origin);
    }

    // ── Check API key ──
    if (!env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY secret not set");
      return jsonResponse({ error: "Server configuration error" }, 500, origin);
    }

    // ── Call Anthropic API ──
    let anthropicResponse;
    try {
      anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mime_type,
                    data: image_base64,
                  },
                },
                {
                  type: "text",
                  text: ANIME_PROMPT,
                },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      console.error("Fetch to Anthropic failed:", err);
      return jsonResponse({ error: "Failed to reach Anthropic API" }, 502, origin);
    }

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic error:", anthropicResponse.status, errText);
      return jsonResponse(
        { error: `Anthropic API error: ${anthropicResponse.status}` },
        502,
        origin
      );
    }

    let data;
    try {
      data = await anthropicResponse.json();
    } catch {
      return jsonResponse({ error: "Invalid response from Anthropic" }, 502, origin);
    }

    // ── Extract the image data URL from the response ──
    let text = "";
    if (data.content && Array.isArray(data.content)) {
      data.content.forEach((block) => {
        if (block.type === "text") text += block.text;
      });
    }

    // Pull out the data URL
    const dataUrlMatch = text.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);

    if (!dataUrlMatch) {
      console.warn("No image data URL found in response. Raw text:", text.slice(0, 200));
      return jsonResponse(
        { error: "Model did not return an image. Try again with a clearer photo." },
        422,
        origin
      );
    }

    return jsonResponse({ image_url: dataUrlMatch[0] }, 200, origin);
  },
};
