export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabase } from "@/utils/supabase";

export async function GET() {
  try {
    const { error } = await supabase.from("jobs").select("id").limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Database keep-alive ping successful",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Database keep-alive ping failed";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
