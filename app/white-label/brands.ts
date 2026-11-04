export type WhiteLabelBrand = {
  name: string;
  mark: string;
  slug: string;
  ink: string;
  accent: string;
  paper: string;
};

// Presentation only. Access remains subject to the signed-in user and RLS.
export const NEW_TALGO_RESTAURANT_ID = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";

export function getWhiteLabelBrand(restaurantId: string | null): WhiteLabelBrand | null {
  if (restaurantId !== NEW_TALGO_RESTAURANT_ID) return null;
  return {
    name: "New Talgo",
    mark: "NT",
    slug: "new-talgo",
    ink: "#203831",
    accent: "#b75b42",
    paper: "#f8f4ec",
  };
}
