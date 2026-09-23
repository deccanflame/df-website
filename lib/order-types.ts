export type MenuVariation = { id: string; name: string; price: number; available: boolean; stock: number | null };
export type ModifierOption = { id: string; name: string; price: number; selected: boolean };
export type ModifierGroup = { id: string; name: string; min: number; max: number; options: ModifierOption[] };
export type SquareMenuItem = {
  id: string; name: string; description: string; categoryId: string; category: string;
  image: string | null; variations: MenuVariation[]; modifierGroups: ModifierGroup[]; customizable: boolean;
};
export type SquareMenuData = {
  items: SquareMenuItem[]; currency: string; sandbox: boolean; acceptingOrders: boolean;
  message: string; pickupMinutes: number; location: { name: string; address: string; phone: string };
};
export type CartLine = { variationId: string; modifierIds: string[]; quantity: number };

export function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export function cartLineKey(line: Pick<CartLine, "variationId" | "modifierIds">) {
  return JSON.stringify([line.variationId, [...line.modifierIds].sort()]);
}
