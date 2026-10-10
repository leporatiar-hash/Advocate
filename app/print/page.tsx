"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Retired: this used to render its own bare, data-only report separate from
// the AI-generated one on /summary. /summary already covers printing (its
// own Print/Save-as-PDF button + print stylesheet), so this route just sends
// people there instead of maintaining two different "report for the doctor"
// experiences.
export default function PrintPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/summary");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
    </div>
  );
}
