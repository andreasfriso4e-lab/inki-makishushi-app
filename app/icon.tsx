import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #0b3c5d 0%, #145b7d 100%)",
          color: "#f8f3eb",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "16px solid rgba(248,243,235,0.18)",
            borderRadius: 112,
            display: "flex",
            height: 360,
            inset: 76,
            position: "absolute",
            width: 360,
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
          <div style={{ fontSize: 156, fontWeight: 800, letterSpacing: -6 }}>I</div>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: 10, marginTop: 10 }}>
            INKI
          </div>
        </div>
      </div>
    ),
    size
  );
}
