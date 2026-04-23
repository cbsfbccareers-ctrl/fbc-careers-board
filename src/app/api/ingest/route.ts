import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

const jobExtractionSchema = z.object({
  title: z.string().describe("Job title or role name"),
  company: z.string().describe("Hiring company or organization"),
  location: z.string().describe("Office location, region, or remote policy"),
  application_url: z
    .string()
    .min(1)
    .describe(
      "Application or apply URL (include https:// when possible; user may correct later)",
    ),
  vertical_tag: z
    .enum([
      "TradFi",
      "DeFi",
      "Crypto",
      "AI Infrastructure",
      "Other",
    ])
    .describe(
      "Inferred from the posting: TradFi, DeFi, Crypto, AI Infrastructure, or Other if unclear",
    ),
});

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
  } | null;
  const url = body?.url?.trim();

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL. Include http or https." },
      { status: 400 },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "URL must use http or https." },
      { status: 400 },
    );
  }

  const jinaUrl = `https://r.jina.ai/${url}`;
  const readerResponse = await fetch(jinaUrl, {
    headers: { Accept: "text/plain" },
  });

  if (!readerResponse.ok) {
    return NextResponse.json(
      {
        error: `Jina Reader failed (${readerResponse.status}): ${readerResponse.statusText}`,
      },
      { status: 502 },
    );
  }

  const markdown = (await readerResponse.text()).slice(0, 100_000);
  if (!markdown.trim()) {
    return NextResponse.json(
      { error: "Jina returned empty content for this URL." },
      { status: 422 },
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: jobExtractionSchema,
      prompt: `You are parsing a job posting. The following markdown was read from: ${url}

Extract the fields exactly. Use the application / apply / careers link for application_url. If several links exist, prefer the one that starts or completes an application for this job.

If you cannot find a value, use a short placeholder like "Unknown" for text fields, and choose the vertical_tag that best matches the content.

--- MARKDOWN ---

${markdown}

--- END ---`,
    });

    return NextResponse.json({
      title: object.title,
      company: object.company,
      location: object.location,
      application_url: object.application_url,
      vertical_tag: object.vertical_tag,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
