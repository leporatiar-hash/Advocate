import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { Toaster } from "react-hot-toast";
import TopProgressBar from "./components/TopProgressBar";
import { Analytics } from "@vercel/analytics/next";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Advocate",
  description: "Caregiver health tracking & doctor-ready summaries",
  icons: {
    icon: "/advocate-icon.png",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Advocate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased`}>
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>
        <AuthProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3500,
              style: {
                background: "#0D1B2A",
                color: "#fff",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "14px",
              },
              success: { iconTheme: { primary: "#0D9488", secondary: "#fff" } },
              error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
            }}
          />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
