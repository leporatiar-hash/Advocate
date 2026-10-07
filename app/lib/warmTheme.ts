// The warm, personal look shared by Settings and Insights: the login page's
// Lora serif and cream/sage palette.
import { Lora } from "next/font/google";

export const lora = Lora({ subsets: ["latin"], variable: "--font-lora", weight: ["400", "500", "600"], display: "swap" });

export const WARM = {
  sage: "#4a7c59",
  forest: "#2d4f38",
  ink: "#1a2420",
  inkSoft: "#6b7d74",
  rule: "#e3ebe5",
  sagePale: "#e8f0eb",
  warm: "#f4efe6",
  warmBorder: "#e9e0d0",
  cream: "#faf9f6",
  worse: "#c2410c",
  better: "#3f7a52",
};

export const serif = { fontFamily: "var(--font-lora), Georgia, serif" };
