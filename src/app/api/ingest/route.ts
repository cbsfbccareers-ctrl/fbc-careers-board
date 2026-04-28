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

const employmentEnum = z.enum(
  EMPLOYMENT_TYPES as unknown as [EmploymentType, ...EmploymentType[]],
);
const positionEnum = z.enum(
  POSITIONS as unknown as [Position, ...Position[]],
);
const verticalEnum = z.enum(
  VERTICAL_TAGS as unknown as [VerticalTag, ...VerticalTag[]],
);
const visaEnum = z.enum(
  VISA_SPONSORSHIP as unknown as [VisaSponsorship, ...VisaSponsorship[]],
);

const nullableEmail = z
  .string()
  .nullable()
  .describe(
    "Employer email for applicants if postings say to email a mailbox (e.g. careers@firm.com); null otherwise",
  );

const jobExtractionSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe(
      "The exact job title. Strip out internal requisition numbers or locations.",
    ),
  company: z
    .string()
    .min(1)
    .describe("The clean company name. Remove 'Inc.', 'LLC', or 'Corporation'."),
  locations: z
    .array(z.string().min(1))
    .min(1)
    .describe("List of cities. Format as 'City, State' or 'City, Country'."),
  employment_type: employmentEnum.describe("Best match from the allowed enum"),
  position: positionEnum.describe("Best match from the allowed enum"),
  vertical_tag: verticalEnum.describe(
    "Industry vertical: best match from enum",
  ),
  visa_sponsorship: visaEnum.describe(
    "Only select Yes or No if explicitly stated in the text. Otherwise, select Unspecified.",
  ),
  compensation: z
    .string()
    .nullable()
    .describe(
      "The salary range, e.g., '$150,000 - $170,000'. Return null if not explicitly stated.",
    ),
  original_posted_date: z
    .string()
    .nullable()
    .describe(
      "When the job was posted, e.g., 'YYYY-MM-DD' or human text as given. Return null if not explicitly stated.",
    ),
  application_deadline: z
    .string()
    .nullable()
    .describe(
      "The hard deadline to apply in YYYY-MM-DD, if explicitly stated. Do not guess. Return null if not explicitly stated.",
    ),
  application_url: z
    .string()
    .nullable()
    .describe(
      "Primary https link to apply online. Null if applications are email-only.",
    ),
  application_email: nullableEmail,
  application_instructions: z
    .string()
    .nullable()
    .describe(
      "If apply-by-email is used: subject line requirements, attachments, or wording from the posting. Null if not stated.",
    ),
});

export const maxDuration = 60;

export type ManualRoutingBody = {
  applyMode?: "link" | "email";
  linkUrl?: string;
  applyEmail?: string;
  instructions?: string;
};

function parseToDeadlineDate(value: string | undefined | null): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s.length === 0) return null;
  const isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
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

function validHttpOriginUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function routingPromptBlock(body: ManualRoutingBody | undefined): string {
  if (!body?.applyMode) return "";
  const lines = ["--- REVIEWER-PROVIDED APPLICATION ROUTING (prefer over vague text) ---"];
  lines.push(`Mode: ${body.applyMode}`);
  if (body.applyMode === "link" && body.linkUrl?.trim()) {
    lines.push(`Link URL reported: ${body.linkUrl.trim()}`);
  }
  if (body.applyMode === "email") {
    if (body.applyEmail?.trim()) {
      lines.push(`Email reported for applications: ${body.applyEmail.trim()}`);
    }
    if (body.instructions?.trim()) {
      lines.push(`Special instructions: ${body.instructions.trim()}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
    rawText?: string;
    intakeSource?: "scan-jina" | "pdf" | "manual";
    documentLabel?: string;
    manualRouting?: ManualRoutingBody;
  } | null;

  const routing = body?.manualRouting;
  const intakeSource = body?.intakeSource;
  const documentLabel = body?.documentLabel?.trim();

  const urlCandidate = body?.url?.trim();
  const rt = body?.rawText?.trim();

  let markdown = "";
  /** Label for AI prompt only — not always a reachable URL when raw intake is pasted. */
  let promptAnchor = "https://intake.manual/fbc-ingest";

  if (rt) {
    markdown = rt.slice(0, 100_000);
    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "Raw text payload was empty after trimming." },
        { status: 422 },
      );
    }
    const fromLink = routing?.applyMode === "link"
      ? validHttpOriginUrl(routing.linkUrl)
      : validHttpOriginUrl(urlCandidate);
    promptAnchor =
      fromLink ??
      (routing?.applyMode === "email" && routing.applyEmail?.trim()
        ? `mailto:${routing.applyEmail.trim()}`
        : intakeSource === "pdf"
          ? documentLabel
            ? `pdf:${documentLabel}`
            : "pdf:upload"
          : "manual-ingest");

    const routingHints = routingPromptBlock(routing);
    markdown = routingHints.trim()
      ? `${routingHints.trim()}\n\n${markdown}`
      : markdown;
  } else if (urlCandidate) {
    const parsed = validHttpOriginUrl(urlCandidate);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid URL. Include http or https." },
        { status: 400 },
      );
    }
    promptAnchor = parsed;

    const jinaUrl = `https://r.jina.ai/${parsed}`;
    const readerResponse = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
    });

    if (!readerResponse.ok) {
      return NextResponse.json(
        {
          error: `Jina Reader failed (${readerResponse.status}): ${readerResponse.statusText}`,
          code: "JINA_FAILED",
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

    const botKeywords = [
      "JavaScript is disabled",
      "Max challenge attempts exceeded",
      "verify that you're not a robot",
      "Enable JavaScript and then reload",
      "Cloudflare",
    ];

    const isBotWall = botKeywords.some((keyword) =>
      markdown.includes(keyword),
    );
    if (isBotWall) {
      return NextResponse.json(
        { error: "ATS Anti-Bot Wall Detected. Fallback required.", code: "BOT_WALL" },
        { status: 403 },
      );
    }
  } else {
    return NextResponse.json(
      {
        error: "Provide either a job URL to scan or raw job text.",
      },
      { status: 400 },
    );
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      system: `You are an expert MBA technical recruiter for a top-tier business school.
Your job is to read parsed HTML/Markdown or pasted job text and extract structured fields.
Ignore nav bars, cookie policies, boilerplate footers.

Application methods:
- If the posting directs candidates to apply through a careers site or ATS link (Greenhouse, Workday, etc.), populate application_url with a full https URL.
- If the posting accepts applications ONLY by emailing a recruiter or careers inbox, leave application_url null and set application_email to that address (single best address).
- If the posting mentions both link and email, prefer the canonical apply link unless the primary CTA is clearly email-only.
Use application_instructions for subjects, filenames, attachments, or format requirements when emailing.

If an application deadline or salary cannot be inferred with confidence, output null.`,
      schema: jobExtractionSchema,
      prompt: `You are parsing a job posting. Prompt source anchor: ${promptAnchor}

Rules:
- For locations: list every distinct work location as separate entries.
- Enums: output exactly one value from each allowed enum.
- application_url: valid https applicant URL or null when email-only.
- application_email: email inbox for applications only when posting is email-centric; otherwise null.

=== EXAMPLE ===
Input text includes "Apply: jobs@firm.com subject line Analyst"
→ application_email: "jobs@firm.com", application_instructions: include subject ...", application_url: null
=== END ===

--- MARKDOWN / TEXT ---
${markdown}
--- END ---`,
    });

    let application_url = object.application_url?.trim() || null;
    let application_email = object.application_email?.trim().toLowerCase() || null;
    let application_instructions =
      object.application_instructions?.trim() || null;

    if (routing?.applyMode === "link" && routing.linkUrl?.trim()) {
      const href = validHttpOriginUrl(routing.linkUrl.trim());
      if (href && !application_url) {
        application_url = href;
      }
    }
    if (routing?.applyMode === "email") {
      if (routing.applyEmail?.trim()) {
        const em = routing.applyEmail.trim().toLowerCase();
        application_email = application_email || em;
      }
      if (!application_instructions?.trim() && routing.instructions?.trim()) {
        application_instructions = routing.instructions.trim();
      }
    }

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
      compensation: object.compensation ?? "",
      original_posted_date: object.original_posted_date ?? "",
      application_deadline: object.application_deadline ?? "",
      application_url: application_url ?? "",
      application_email: application_email ?? "",
      application_instructions: application_instructions ?? "",
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
