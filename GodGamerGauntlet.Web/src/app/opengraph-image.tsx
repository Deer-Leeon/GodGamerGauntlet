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
          background: "#F6F0E4",
          color: "#2A241C",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 600,
            letterSpacing: "0",
            color: "#2A241C",
          }}
        >
          God Gamer Gauntlet
        </div>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 16,
            fontSize: 28,
            color: "#5C5348",
          }}
        >
          <span>Sprint</span>
          <span>·</span>
          <span>Marathon</span>
          <span>·</span>
          <span>Endurance</span>
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 24,
            color: "#8A7F72",
          }}
        >
          A solo speedrun club. 19 games.
        </div>
      </div>
    ),
    size,
  );
}
