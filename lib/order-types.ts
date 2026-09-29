export type MenuVariation = { id: string; name: string; price: number; available: boolean; stock: number | null };
export type ModifierOption = { id: string; name: string; price: number; selected: boolean };
export type ModifierGroup = { id: string; name: string; min: number; max: number; options: ModifierOption[] };
export type SquareMenuItem = {
  id: string; name: string; description: string; categoryId: string; category: string;
  image: string | null; variations: MenuVariation[]; modifierGroups: ModifierGroup[]; customizable: boolean;
};
export type SquareMenuData = {
  communityAcceptingOrders?: boolean;
  communityOrderingEnabled?: boolean;
  communityDelivery?: { startAt: string; endAt: string };
  paidDeliveryAvailable?: boolean;
  communityProgressEnabled?: boolean;
  deliverySettings?: { communities: string[]; startTime: string; endTime: string };
  items: SquareMenuItem[]; currency: string; sandbox: boolean; acceptingOrders: boolean;
  message: string; pickupMinutes: number; serverTime?: string; location: { name: string; address: string; phone: string };
};
export type CartLine = { variationId: string; modifierIds: string[]; quantity: number };
export type DeliveryAddress = { address_line_1: string; address_line_2?: string; locality: string; administrative_district_level_1: string; postal_code: string };
export type DeliveryQuote = { fee: number; miles: number; currency: string; address: DeliveryAddress };

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export function cartLineKey(line: Pick<CartLine, "variationId" | "modifierIds">) {
  return JSON.stringify([line.variationId, [...line.modifierIds].sort()]);
}
