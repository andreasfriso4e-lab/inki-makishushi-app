import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0b3c5d",
          borderRadius: 36,
          color: "#f8f3eb",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "6px solid rgba(248,243,235,0.22)",
            borderRadius: 30,
            inset: 18,
            position: "absolute",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 70, fontWeight: 800, letterSpacing: -2 }}>I</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, marginTop: 4 }}>
            INKI
          </div>
        </div>
      </div>
    ),
    size
  );
}
