import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          color: "#111111",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.16em",
            color: "#E10600",
            textTransform: "uppercase",
          }}
        >
          THE CHALLENGE
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: "#111111",
          }}
        >
          God Gamer Gauntlet
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 28,
            color: "#444444",
          }}
        >
          Ten wins in a row.
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 24,
            color: "#6B6B6B",
          }}
        >
          Verified speedrun.com runs.
        </div>
      </div>
    ),
    size,
  );
}
