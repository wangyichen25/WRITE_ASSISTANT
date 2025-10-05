import { MODEL_OPTIONS } from "@/lib/models";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    models: MODEL_OPTIONS,
    supportsOnlineSuffix: true,
  });
}
