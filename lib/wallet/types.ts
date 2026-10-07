export type WalletMemberContext = {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  accent: string;
  customerId: string;
  customerName: string | null;
  memberCode: string;
  points: number;
  visits: number;
};

export type WalletCapability = {
  ready: boolean;
  missing: string[];
  supportsUpdates: boolean;
};

export type WalletCapabilities = {
  apple: WalletCapability;
  google: WalletCapability;
};
