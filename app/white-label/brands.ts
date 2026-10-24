export type WhiteLabelBrand = {
  name: string;
  mark: string;
  slug: string;
  ink: string;
  accent: string;
  paper: string;
};

// Presentation only. Restaurant access always comes from GastroHelp Auth/RLS.
const configuredBrands: Array<[string | undefined, WhiteLabelBrand]> = [
  [process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID, {
    name: "New Talgo", mark: "NT", slug: "new-talgo",
    ink: "#203831", accent: "#b75b42", paper: "#f8f4ec",
  }],
  [process.env.NEXT_PUBLIC_WHITE_LABEL_MESA_NORTE_ID, {
    name: "Mesa Norte", mark: "MN", slug: "mesa-norte",
    ink: "#253751", accent: "#4b7da4", paper: "#f3f5f8",
  }],
];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getWhiteLabelBrand(restaurantId: string | null): WhiteLabelBrand | null {
  if (!restaurantId || !uuid.test(restaurantId)) return null;
  const match = configuredBrands.find(([id]) => id === restaurantId);
  return match?.[1] ?? null;
}
