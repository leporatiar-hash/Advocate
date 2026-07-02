import AssessmentFormClient from "./AssessmentFormClient";

export function generateStaticParams() {
  return [
    { instrument: "lawton_iadl" },
    { instrument: "phq9" },
    { instrument: "csi" },
  ];
}

export default async function AssessmentFormPage({
  params,
}: {
  params: Promise<{ instrument: string }>;
}) {
  const { instrument } = await params;
  return <AssessmentFormClient instrumentKey={instrument} />;
}
