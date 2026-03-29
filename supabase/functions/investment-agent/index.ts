const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = {
  action?: string;
  payload?: Record<string, unknown>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function requireSignedInUser(request: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
  }

  if (!accessToken) {
    return { ok: false, response: json({ error: "Cloud session missing. Please sign in again before using the Edge Function." }, 401) };
  }

  const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!authResponse.ok) {
    return {
      ok: false,
      response: json({ error: "Cloud session expired or invalid. Please sign out and sign in again." }, 401),
    };
  }

  const user = await authResponse.json();
  return { ok: true, user };
}

async function callChatCompletion({
  apiBaseUrl,
  apiKey,
  model,
  messages,
}: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
}) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Agent provider request failed: ${response.status}${errorText ? ` - ${errorText.slice(0, 800)}` : ""}`,
    );
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiBaseUrl = Deno.env.get("AGENT_API_BASE_URL");
    const apiKey = Deno.env.get("AGENT_API_KEY");
    const apiModel = Deno.env.get("AGENT_MODEL");
    const ocrModel = Deno.env.get("OCR_MODEL") || apiModel;

    if (!apiBaseUrl || !apiKey || !apiModel) {
      return json({ error: "Missing AGENT_API_BASE_URL, AGENT_API_KEY, or AGENT_MODEL." }, 500);
    }

    const body = (await request.json()) as RequestBody;
    const action = body?.action;
    const payload = body?.payload || {};

    const auth = await requireSignedInUser(request);
    if (!auth.ok) {
      return auth.response;
    }

    if (action === "generate_pre_trade_assessment") {
      const text = await callChatCompletion({
        apiBaseUrl,
        apiKey,
        model: apiModel,
        messages: [
          {
            role: "system",
            content:
              "You are writing an investment committee pre-trade memo. Use investor language, not software language. Return concise bilingual Chinese-English prose with these headings exactly: Investment Committee Pre-trade Memo / 投前纪要, 投资结论 / Investment Conclusion, 观察状态 / Observation Status, 核心依据 / Core Basis, 关键风险 / Key Risks, 下一步动作 / Next Step.",
          },
          {
            role: "user",
            content: JSON.stringify(payload, null, 2),
          },
        ],
      });

      return json({ mode: "edge", text });
    }

    if (action === "generate_post_trade_reflection") {
      const text = await callChatCompletion({
        apiBaseUrl,
        apiKey,
        model: apiModel,
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only with keys text, suggestedReason, suggestedTags, and suggestedLesson. All text fields must be concise bilingual Chinese-English investment-committee writing, not software wording.",
          },
          {
            role: "user",
            content:
              `${JSON.stringify(payload, null, 2)}\n\nReturn strict JSON only. ` +
              'Use these headings inside the text fields when relevant: "Investment Committee Post-trade Memo / 投后复盘纪要", "原因归纳 / Core Reason", "复盘教训 / Lesson", "后续改进 / Improvement Focus".',
          },
        ],
      });

      const parsed = safeParseJson(text);
      if (!parsed) {
        return json({
          mode: "edge",
          text,
          suggestedReason: "",
          suggestedTags: [],
          suggestedLesson: "",
        });
      }

      return json({
        mode: "edge",
        text: parsed.text || text,
        suggestedReason: parsed.suggestedReason || "",
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
        suggestedLesson: parsed.suggestedLesson || "",
      });
    }

    if (action === "import_positions_from_image") {
      if (!ocrModel) {
        return json({ error: "Missing OCR_MODEL." }, 500);
      }

      const imageDataUrls = Array.isArray(payload.imageDataUrls)
        ? payload.imageDataUrls.filter((item): item is string => typeof item === "string" && item.length > 0)
        : typeof payload.imageDataUrl === "string" && payload.imageDataUrl.length > 0
          ? [payload.imageDataUrl]
          : [];

      if (!imageDataUrls.length) {
        return json({ error: "Missing screenshot payload." }, 400);
      }

      const text = await callChatCompletion({
        apiBaseUrl,
        apiKey,
        model: ocrModel,
        messages: [
          {
            role: "system",
            content:
              'Read the broker positions screenshot and return strict JSON only: {"totalPortfolioAmount":"","positions":[{"ticker":"","name":"","market":"HK","shareCount":"","marketValue":"","lastPrice":"","avgCost":"","portfolioWeight":""}]}. If multiple image tiles are provided, treat them as crops from the same screenshot, merge them into one holdings table, and deduplicate repeated rows.',
          },
          {
            role: "user",
            content: [
              ...imageDataUrls.map((url) => ({
                type: "image_url",
                image_url: {
                  url,
                  detail: "high",
                },
              })),
              {
                type: "text",
                text: "Extract the holdings table. Keep share count, market value, last price, avg cost, and total portfolio amount if visible. Do not invent rows. If the screenshot is split into tiles, merge and deduplicate before returning JSON.",
              },
            ],
          },
        ],
      });

      const parsed = safeParseJson(text);
      return json(parsed || { positions: [], totalPortfolioAmount: "" });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown function error." }, 500);
  }
});
