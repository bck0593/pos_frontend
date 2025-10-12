export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const env = process.env;
  const payload = {
    NEXT_PUBLIC_BACKEND_URL: env.NEXT_PUBLIC_BACKEND_URL ?? null,
    NEXT_PUBLIC_API_BASE: env.NEXT_PUBLIC_API_BASE ?? null,
    NEXT_PUBLIC_API_BASE_URL: env.NEXT_PUBLIC_API_BASE_URL ?? null,
    NODE_ENV: env.NODE_ENV ?? null
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200, headers: { "content-type": "application/json" }
  });
}
