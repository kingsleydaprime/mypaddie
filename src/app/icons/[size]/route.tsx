import { ImageResponse } from "next/og";

const SIZES = new Set([192, 512]);

/** App icons drawn at request time: a gold "P" on the app's dark background. */
export async function GET(_req: Request, { params }: RouteContext<"/icons/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0f13",
          color: "#f5b83d",
          fontSize: size * 0.58,
          fontWeight: 800,
        }}
      >
        P
      </div>
    ),
    { width: size, height: size },
  );
}
