export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const backend =
    (process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "").trim();
  return new Response(
    JSON.stringify({ backendBase: backend || "(unset)", now: new Date().toISOString() }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
