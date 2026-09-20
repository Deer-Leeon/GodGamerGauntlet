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
          background: "#18181a",
          color: "#f2f2f0",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#c4b49a",
          }}
        >
          God Gamer Gauntlet
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 32,
            color: "#b4b4b0",
          }}
        >
          Sprint · Marathon · Endurance
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 24,
            color: "#8a8a86",
          }}
        >
          Draft 3, 5, or 7 full-game speedruns
        </div>
      </div>
    ),
    size,
  );
}
