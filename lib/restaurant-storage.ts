import { getActiveRestaurantId } from "@/lib/restaurant-config";

export function getRestaurantStorageKey(baseKey: string) {
  const restaurantId = getActiveRestaurantId();

  return restaurantId === "default" ? baseKey : `${restaurantId}:${baseKey}`;
}
