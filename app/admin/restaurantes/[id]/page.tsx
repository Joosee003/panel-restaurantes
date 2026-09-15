import { RestaurantWorkspace } from "../../components/AgencyViews";
export default async function RestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RestaurantWorkspace restaurantId={id}/>;
}
