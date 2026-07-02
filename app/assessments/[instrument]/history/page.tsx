import AssessmentHistoryClient from "./AssessmentHistoryClient";

export function generateStaticParams() {
  return [
    { instrument: "lawton_iadl" },
    { instrument: "phq9" },
    { instrument: "csi" },
  ];
}

export default async function AssessmentHistoryPage({
  params,
}: {
  params: Promise<{ instrument: string }>;
}) {
  const { instrument } = await params;
  return <AssessmentHistoryClient instrumentKey={instrument} />;
}
