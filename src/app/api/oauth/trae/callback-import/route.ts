import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";
import { parseTraeCallbackQuery } from "../../../../authorize/parseCallback";

async function requireOAuthImportAuth(request: Request) {
  if (!(await isAuthRequired(request))) return null;
  if (await isAuthenticated(request)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function paramsFromCallbackUrl(raw: string): URLSearchParams | null {
  try {
    return new URL(raw).searchParams;
  } catch {
    const idx = raw.indexOf("?");
    if (idx >= 0) return new URLSearchParams(raw.slice(idx + 1));
    if (raw.includes("userJwt=") || raw.includes("refreshToken=")) return new URLSearchParams(raw);
    return null;
  }
}

export async function POST(request: Request) {
  const authResponse = await requireOAuthImportAuth(request);
  if (authResponse) return authResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const callbackUrl = typeof (rawBody as any)?.callbackUrl === "string" ? (rawBody as any).callbackUrl.trim() : "";
  if (!callbackUrl) return NextResponse.json({ error: "callbackUrl is required" }, { status: 400 });

  const params = paramsFromCallbackUrl(callbackUrl);
  if (!params) return NextResponse.json({ error: "Invalid Trae callback URL" }, { status: 400 });

  const parsed = parseTraeCallbackQuery(params);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const connection: any = await createProviderConnection(parsed.record);
    return NextResponse.json({
      success: true,
      connection: { id: connection.id, provider: connection.provider },
    });
  } catch (error) {
    console.error("Trae callback import error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

