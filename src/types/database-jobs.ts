/**
 * Expected `jobs` columns for Supabase client typing.
 * Add these columns in Supabase if missing:
 *
 * ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_email text;
 * ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_instructions text;
 * ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description text; -- AI-cleaned Markdown body
 * ALTER COLUMN application_url DROP NOT NULL; -- allow email-only postings
 */

export type JobApplyColumns = {
  application_url: string | null;
  application_email: string | null;
  application_instructions: string | null;
};
