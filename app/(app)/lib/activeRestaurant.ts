// Selection is local to this tab. Two restaurant panels must not redirect
// each other's reads or writes through a shared localStorage value.
export const ACTIVE_RESTAURANT_KEY = "gastrohelp_restaurante_activo";
const CHANGE_EVENT = "gastrohelp:restaurant-change";

export function getActiveRestaurant(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACTIVE_RESTAURANT_KEY) || null;
}

export function setActiveRestaurant(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.sessionStorage.setItem(ACTIVE_RESTAURANT_KEY, id);
  else window.sessionStorage.removeItem(ACTIVE_RESTAURANT_KEY);
  // Retire the old shared selection. Never import a choice from another tab.
  window.localStorage.removeItem(ACTIVE_RESTAURANT_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeActiveRestaurant(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.sessionStorage &&
        (event.key === ACTIVE_RESTAURANT_KEY || event.key === null)) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
