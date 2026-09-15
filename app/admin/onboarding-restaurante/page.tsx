import { OnboardingWorkspace } from "../components/OnboardingWorkspace";
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ nuevo?: string; restaurante?: string }> }) {
  const params = await searchParams;
  return <OnboardingWorkspace createNew={params.nuevo === "1"} restaurantId={params.restaurante}/>;
}
