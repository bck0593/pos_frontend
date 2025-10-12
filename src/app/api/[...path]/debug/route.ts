import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const raw =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  return NextResponse.json({
    backendBase: raw || "(env not set at runtime)",
    note: "Proxy tries /api/:path, then fallback to /:path",
  });
}
