import { PunchClient } from "./PunchClient";

export default async function PunchPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <PunchClient initialCode={code} />;
}
