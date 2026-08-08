import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600", "700"], display: "swap" });

export default function ClinicianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`clinician-portal ${inter.variable}`}>
      {children}
    </div>
  );
}
