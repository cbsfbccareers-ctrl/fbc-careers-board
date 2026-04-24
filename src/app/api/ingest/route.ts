import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";

import {
  EMPLOYMENT_TYPES,
  POSITIONS,
  VERTICAL_TAGS,
  VISA_SPONSORSHIP,
  type EmploymentType,
  type Position,
  type VerticalTag,
  type VisaSponsorship,
} from "@/lib/jobs-constants";

const employmentEnum = z.enum(EMPLOYMENT_TYPES as unknown as [EmploymentType, ...EmploymentType[]]);
const positionEnum = z.enum(
  POSITIONS as unknown as [Position, ...Position[]],
);
const verticalEnum = z.enum(
  VERTICAL_TAGS as unknown as [VerticalTag, ...VerticalTag[]],
);
const visaEnum = z.enum(
  VISA_SPONSORSHIP as unknown as [VisaSponsorship, ...VisaSponsorship[]],
);

const jobExtractionSchema = z.object({
  title: z.string().min(1).describe("The exact job title. Strip out internal requisition numbers or locations (e.g., return 'Product Manager' instead of 'Product Manager - NYC (Req: 123)')."),
  company: z.string().min(1).describe("The clean company name. Remove 'Inc.', 'LLC', or 'Corporation'."),
  locations: z
    .array(z.string().min(1))
    .min(1)
    .describe("List of cities. Format as 'City, State' or 'City, Country'."),
  employment_type: employmentEnum.describe("Best match from the allowed enum"),
  position: positionEnum.describe("Best match from the allowed enum"),
  vertical_tag: verticalEnum.describe("Industry vertical: best match from enum"),
  visa_sponsorship: visaEnum.describe("Only select Yes or No if explicitly stated in the text. Otherwise, select Unspecified."),
  compensation: z
    .string()
    .nullable()
    .describe("The salary range, e.g., '$150,000 - $170,000'. Include currency symbols. Return null if not explicitly stated."),
  original_posted_date: z
    .string()
    .nullable()
    .describe("When the job was posted, e.g., '3 days ago' or 'YYYY-MM-DD'. Return null if not explicitly stated."),
  application_deadline: z
    .string()
    .nullable()
    .describe("The hard deadline to apply in YYYY-MM-DD, if explicitly stated. Do not guess. Return null if not explicitly stated."),
  application_url: z
    .string()
    .min(1)
    .describe("Primary application or apply link; prefer the URL that was fetched when appropriate"),
});

export const maxDuration = 60;

function parseToDeadlineDate(
  value: string | undefined | null,
): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const isoDay = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/,
  );
  if (isoDay) {
    const y = Number(isoDay[1]);
    const m = Number(isoDay[2]);
    const d = Number(isoDay[3]);
    const t = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
    const out = new Date(t);
    if (!Number.isNaN(out.getTime())) return out;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function defaultExpiresAt45DaysFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    rawText?: string;
  } | null;
  const url = body?.url?.trim();
  const rawText = body?.rawText?.trim();

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

  let markdown: string;
  if (rawText) {
    markdown = rawText.slice(0, 100_000);
    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "Raw text fallback was empty after trimming." },
        { status: 422 },
      );
    }
  } else {
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

    markdown = (await readerResponse.text()).slice(0, 100_000);
    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "Jina returned empty content for this URL." },
        { status: 422 },
      );
    }
    
    // === THE ANTI-BOT TRIPWIRE ===
    // If the scraper was served a security challenge instead of the job, throw an error to trigger the UI fallback
    const botKeywords = [
      "JavaScript is disabled", 
      "Max challenge attempts exceeded", 
      "verify that you're not a robot", 
      "Enable JavaScript and then reload",
      "Cloudflare"
    ];
    
    const isBotWall = botKeywords.some(keyword => markdown.includes(keyword));
    if (isBotWall) {
      return NextResponse.json(
        { error: "ATS Anti-Bot Wall Detected. Fallback required." },
        { status: 403 }
      );
    }
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      system: `You are an expert MBA technical recruiter for a top-tier business school. 
Your job is to read parsed HTML/Markdown from a job posting and extract the core details perfectly.
Ignore nav bars, cookie policies, and boilerplate footer text. 
If you cannot find a specific application deadline or salary, do not guess, just return null.`,
      schema: jobExtractionSchema,
      prompt: `You are parsing a job posting. The following markdown was read from: ${url}

Rules:
- For locations: list every distinct work location, region, or remote variant as separate array entries.
- Enums: you must output exactly one value from each allowed enum. Do not invent new labels.
- application_url: the primary apply link for this job.

=== EXAMPLE OF PERFECT EXTRACTION ===
Example Input Markdown:
"Stripe, Inc. is hiring a Summer 2027 Product Management Intern. 
Location: SF, New York, or Remote (US). 
Pay: 10k-12k/mo. 
Visa sponsorship is not available for this role.
Deadline to apply is October 15th."

Example Expected Output Behavior:
- title: "Product Management Intern" (Stripped the 'Summer 2027' fluff)
- company: "Stripe" (Stripped the ', Inc.')
- locations: ["San Francisco, CA", "New York, NY", "Remote US"] (Standardized the city names)
- employment_type: "Summer Internship" (Inferred from text)
- position: "Product Management" (Mapped exactly to the Enum)
- visa_sponsorship: "No" (Explicitly stated)
- compensation: "$10,000 - $12,000 / month" (Formatted cleanly)
- application_deadline: "2026-10-15" (Converted to standard YYYY-MM-DD format)
=====================================

--- ACTUAL MARKDOWN TO PARSE ---

${markdown}

--- END ---`,
    });

    const deadline = parseToDeadlineDate(object.application_deadline);
    const expiresAt = deadline ?? defaultExpiresAt45DaysFromNow();

    return NextResponse.json({
      title: object.title,
      company: object.company,
      locations: object.locations,
      employment_type: object.employment_type,
      position: object.position,
      vertical_tag: object.vertical_tag,
      visa_sponsorship: object.visa_sponsorship,
      // We use ?? "" so the frontend UI form receives empty strings instead of breaking on nulls
      compensation: object.compensation ?? "",
      original_posted_date: object.original_posted_date ?? "",
      application_deadline: object.application_deadline ?? "",
      application_url: object.application_url,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}