"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { orderingAppCheckHeaders } from "../lib/ordering-app-check";
import { cartLineKey, formatPrice, type CartLine, type SquareMenuData, type SquareMenuItem } from "../lib/order-types";

const CART_KEY = "deccan-flame-cart-v1";
const CHECKOUT_KEY = "deccan-flame-checkout-v1";

function readCart(): CartLine[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(line => line && typeof line.variationId === "string" &&
      Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20 &&
      Array.isArray(line.modifierIds) && line.modifierIds.every((id: unknown) => typeof id === "string")).slice(0, 40) : [];
  } catch { return []; }
}

function saveCart(cart: CartLine[]) {
  try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Ordering also works without browser storage. */ }
}

export function SquareMenu({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<SquareMenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<SquareMenuItem | null>(null);
  const [variationId, setVariationId] = useState("");
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [optionError, setOptionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const checkoutKey = useRef("");
  const checkoutLock = useRef(false);
  const closeOptions = useCallback(() => setSelectedItem(null), []);
  useFocusTrap(Boolean(selectedItem), dialog, closeOptions);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/square/menu/", { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000), cache: "no-store" });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Online ordering is currently unavailable. Please call us to order.");
      const data = await response.json() as SquareMenuData & { error?: string };
      if (!response.ok) throw new Error(data.error || "The menu couldn't be loaded.");
      if (!Array.isArray(data.items) || typeof data.currency !== "string") throw new Error("The menu couldn't be loaded. Please call us to order.");
      setMenu(data);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "The menu couldn't be loaded. Please try again.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function initialize() {
      await load(controller.signal);
      if (controller.signal.aborted) return;
      setCart(readCart());
      try {
        checkoutKey.current = sessionStorage.getItem(CHECKOUT_KEY) || crypto.randomUUID();
        sessionStorage.setItem(CHECKOUT_KEY, checkoutKey.current);
        setCheckoutStarted(sessionStorage.getItem(`${CHECKOUT_KEY}-started`) === "true");
      } catch { checkoutKey.current = crypto.randomUUID(); }
    }
    void initialize();
    return () => controller.abort();
  }, [load]);

  function updateCart(next: CartLine[]) { setCart(next); saveCart(next); setCheckoutError(""); }

  const resolved = cart.map(line => {
    const item = menu?.items.find(item => item.variations.some(variation => variation.id === line.variationId));
    const variation = item?.variations.find(variation => variation.id === line.variationId);
    const options = line.modifierIds.map(id => item?.modifierGroups.flatMap(group => group.options).find(option => option.id === id));
    const groupInvalid = item?.modifierGroups.some(group => {
      const count = line.modifierIds.filter(id => group.options.some(option => option.id === id)).length;
      return count < group.min || count > group.max;
    });
    const totalQuantity = cart.filter(other => other.variationId === line.variationId).reduce((sum, other) => sum + other.quantity, 0);
    const invalid = !variation?.available || options.some(option => !option) || groupInvalid || totalQuantity > 20 || (variation?.stock != null && totalQuantity > variation.stock);
    return { line, item, variation, options, invalid, price: (variation?.price || 0) + options.reduce((sum, option) => sum + (option?.price || 0), 0) };
  });
  const subtotal = resolved.reduce((sum, row) => sum + row.price * row.line.quantity, 0);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const canCheckout = Boolean(menu?.acceptingOrders && cart.length && !resolved.some(row => row.invalid) && !loading && !loadError);
  const categories = menu ? Array.from(new Map(menu.items.map(item => [item.categoryId, item.category])).entries()) : [];
  const visibleItems = menu?.items.filter(item => (category === "all" || item.categoryId === category) &&
    `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase().trim())) || [];

  function chooseItem(item: SquareMenuItem) {
    setSelectedItem(item);
    setVariationId(item.variations.find(variation => variation.available)?.id || "");
    setModifierIds(item.modifierGroups.flatMap(group => group.options.filter(option => option.selected).slice(0, group.max).map(option => option.id)));
    setOptionError("");
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    if (!selectedItem) return;
    for (const group of selectedItem.modifierGroups) {
      const selected = group.options.filter(option => modifierIds.includes(option.id)).length;
      if (selected < group.min || selected > group.max) { setOptionError(`Choose ${group.min === group.max ? group.min : `${group.min}–${group.max}`} from ${group.name}.`); return; }
    }
    const variation = selectedItem.variations.find(variation => variation.id === variationId);
    if (!variation?.available) return;
    const total = cart.filter(line => line.variationId === variationId).reduce((sum, line) => sum + line.quantity, 0);
    if (total >= Math.min(20, variation.stock ?? 20)) { setOptionError("You've reached the available quantity for this dish."); return; }
    const newLine = { variationId, modifierIds: [...modifierIds].sort(), quantity: 1 };
    const key = cartLineKey(newLine);
    const exists = cart.some(line => cartLineKey(line) === key);
    if (!exists && cart.length >= 40) { setOptionError("For larger orders, please call us for catering."); return; }
    updateCart(exists ? cart.map(line => cartLineKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line) : [...cart, newLine]);
    setAnnouncement(`${selectedItem.name} added to your order.`);
    closeOptions();
  }

  function changeQuantity(index: number, difference: number) {
    const next = cart.map((line, i) => i === index ? { ...line, quantity: Math.min(20, line.quantity + difference) } : line).filter(line => line.quantity > 0);
    updateCart(next);
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCheckout || checkoutLock.current) return;
    checkoutLock.current = true; setCheckingOut(true); setCheckoutError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/square/checkout/", {
        method: "POST", headers: { "Content-Type": "application/json", ...await orderingAppCheckHeaders() },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          idempotencyKey: checkoutKey.current, items: cart,
          customer: { name: data.get("name"), email: data.get("email"), phone: data.get("phone") }, note: data.get("note"),
        }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Checkout is unavailable. Please call us to order.");
      const result = await response.json() as { url: string; error?: string };
      if (!response.ok) { if (response.status === 409) void load(); throw new Error(result.error || "Checkout couldn't be started. Please try again."); }
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !["square.link", "sandbox.square.link", "checkout.square.site", "sandbox.checkout.square.site"].includes(url.hostname)) throw new Error("Checkout couldn't be started. Please try again.");
      try { sessionStorage.setItem(`${CHECKOUT_KEY}-started`, "true"); } catch { /* Optional local state. */ }
      setCheckoutStarted(true);
      window.location.assign(url.href);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout couldn't be started. Please try again.");
    } finally { checkoutLock.current = false; setCheckingOut(false); }
  }

  function startNewOrder() {
    updateCart([]); setCheckoutStarted(false); checkoutKey.current = crypto.randomUUID();
    try { sessionStorage.setItem(CHECKOUT_KEY, checkoutKey.current); sessionStorage.removeItem(`${CHECKOUT_KEY}-started`); } catch { /* Optional local state. */ }
  }

  return (
    <>
      <div className="ordering-status" role="status">
        {loading ? <p>Getting the latest menu…</p> : loadError ? <p>{loadError} <button type="button" onClick={() => void load()}>Try again</button> · <a href="tel:+14805771274">Call 480-577-1274</a></p> : menu && <>
          {menu.sandbox && <span className="ordering-test-badge">Test mode · no real orders</span>}
          <p>{menu.acceptingOrders ? `Pickup · approximately ${menu.pickupMinutes} minutes` : menu.message}</p>
          <small>{menu.location.address}</small>
        </>}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {!menu ? children : <>
        <div className="ordering-toolbar">
          <label className="menu-search"><span className="sr-only">Search menu</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Find your favourite…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="ordering-categories" aria-label="Filter menu categories">
            <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All dishes</button>
            {categories.map(([id, name]) => <button type="button" key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{name}</button>)}
          </div>
        </div>
        <section className="ordering-layout" id="full-menu-content" aria-label="Menu and order">
          <div className="ordering-dishes">
            <div className="ordering-section-title"><h2>Made for your cravings.</h2><span>{visibleItems.length} dishes</span></div>
            {!visibleItems.length && <div className="ordering-empty"><h3>{menu.items.length ? "No dishes found" : "The kitchen's menu is on its way"}</h3><p>{menu.items.length ? "Try another search or category." : "Please call us for today's available dishes."}</p></div>}
            <div className="ordering-item-grid">
              {visibleItems.map(item => {
                const available = item.variations.some(variation => variation.available);
                return <article className="ordering-item" key={item.id}>
                  {item.image && <img src={item.image} alt={item.name} loading="lazy" width="480" height="300" />}
                  <div className="ordering-item-copy">
                    <span className="ordering-item-category">{item.category}</span><h3>{item.name}</h3>
                    {item.description && <p>{item.description}</p>}
                    <div className="ordering-item-bottom"><strong>{item.variations.length > 1 ? "From " : ""}{formatPrice(Math.min(...item.variations.map(variation => variation.price)), menu.currency)}</strong>
                      <button type="button" disabled={!available || !menu.acceptingOrders || Boolean(loadError) || loading} onClick={() => chooseItem(item)} aria-label={`Add ${item.name}`}>
                        {available ? <>Add <span aria-hidden="true">＋</span></> : item.customizable ? "Sold out" : "Call to order"}
                      </button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </div>
          <aside className="order-cart" id="your-order" aria-label="Your order">
            <div className="order-cart-title"><h2>Your order</h2><span>{count}</span></div>
            <p className="order-cart-pickup">Pickup at Deccan Flame</p>
            {checkoutStarted && <div className="order-notice"><p>Already paid? Your Square receipt confirms your order. Check it before placing another.</p><button type="button" onClick={startNewOrder}>Start a new order</button></div>}
            {!cart.length ? <div className="order-empty-cart"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 15h28l-3 25H13L10 15Z" /><path d="M17 18v-7a7 7 0 0 1 14 0v7" /></svg><h3>A little empty. A lot of possibility.</h3><p>Add something delicious to get started.</p></div> : <>
              <ul className="order-cart-lines">{resolved.map((row, index) => <li key={cartLineKey(row.line)}>
                <div className="order-line-heading"><strong>{row.item?.name || "Unavailable item"}</strong><span>{formatPrice(row.price * row.line.quantity, menu.currency)}</span></div>
                {row.variation && row.variation.name !== "Regular" && <small>{row.variation.name}</small>}
                {row.options.length > 0 && <small>{row.options.map(option => option?.name || "Unavailable option").join(", ")}</small>}
                {row.invalid && <p className="order-error">This selection changed or is unavailable. Remove it and select again.</p>}
                <div className="order-line-actions"><div className="order-quantity"><button type="button" aria-label={`Decrease ${row.item?.name || "item"} quantity`} disabled={checkingOut} onClick={() => changeQuantity(index, -1)}>−</button><span>{row.line.quantity}</span><button type="button" aria-label={`Increase ${row.item?.name || "item"} quantity`} disabled={checkingOut || row.invalid || cart.filter(line => line.variationId === row.line.variationId).reduce((sum, line) => sum + line.quantity, 0) >= Math.min(20, row.variation?.stock ?? 20)} onClick={() => changeQuantity(index, 1)}>+</button></div><button className="order-remove" type="button" disabled={checkingOut} onClick={() => updateCart(cart.filter((_, i) => i !== index))}>Remove<span className="sr-only"> {row.item?.name || "item"}</span></button></div>
              </li>)}</ul>
              <div className="order-subtotal"><span>Subtotal</span><strong>{formatPrice(subtotal, menu.currency)}</strong></div>
              <p className="order-tax-note">Taxes, applicable discounts and optional tip are finalized on Square.</p>
              <form className="order-details" onSubmit={checkout}>
                <fieldset disabled={checkingOut}><legend>Who’s picking up?</legend>
                  <label>Name<input name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Your name" /></label>
                  <label>Phone<input name="phone" type="tel" autoComplete="tel" required minLength={10} maxLength={24} placeholder="(480) 555-0123" /></label>
                  <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
                  <label>Order notes <span>(optional)</span><textarea name="note" rows={2} maxLength={400} placeholder="Anything we should know?" /></label>
                </fieldset>
                <p className="order-tax-note">For allergies, please call us before ordering.</p>
                {checkoutError && <p className="order-error" role="alert">{checkoutError}</p>}
                <button className="order-checkout" type="submit" disabled={!canCheckout || checkingOut}>{checkingOut ? "Opening Square…" : <>Continue to Square <span aria-hidden="true">↗</span></>}</button>
                <p className="order-payment-note">Secure payment on Square. Your order is placed after payment.</p>
              </form>
            </>}
          </aside>
        </section>
        {count > 0 && <a className="order-mobile-cart" href="#your-order"><span>Your order <b>{count}</b></span><strong>{formatPrice(subtotal, menu.currency)} <span aria-hidden="true">↑</span></strong></a>}
        {selectedItem && <div className="order-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) closeOptions(); }}>
          <div className="order-options" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="order-options-title" tabIndex={-1}>
            <button className="order-close" type="button" aria-label="Close dish options" onClick={closeOptions}>×</button>
            <span className="ordering-item-category">Make it yours</span><h2 id="order-options-title">{selectedItem.name}</h2>
            <form onSubmit={addItem}>
              <fieldset><legend>Choose your portion</legend>{selectedItem.variations.map(variation => <label className="order-option" key={variation.id}><input type="radio" name="variation" value={variation.id} checked={variationId === variation.id} disabled={!variation.available} onChange={() => setVariationId(variation.id)} /><span>{variation.name}{!variation.available && " · Sold out"}</span><strong>{formatPrice(variation.price, menu.currency)}</strong></label>)}</fieldset>
              {selectedItem.modifierGroups.map(group => <fieldset key={group.id}><legend>{group.name} <small>{group.min ? `Choose ${group.min}${group.max !== group.min ? `–${group.max}` : ""}` : `Optional · up to ${group.max}`}</small></legend>{group.options.map(option => <label className="order-option" key={option.id}><input type="checkbox" checked={modifierIds.includes(option.id)} onChange={event => setModifierIds(current => event.target.checked ? [...current.filter(id => group.max !== 1 || !group.options.some(item => item.id === id)), option.id] : current.filter(id => id !== option.id))} /><span>{option.name}</span><strong>{option.price ? `+${formatPrice(option.price, menu.currency)}` : ""}</strong></label>)}</fieldset>)}
              {optionError && <p role="alert" className="order-error">{optionError}</p>}
              <button className="order-checkout" type="submit" disabled={!variationId}>Add to your order <span aria-hidden="true">＋</span></button>
            </form>
          </div>
        </div>}
      </>}
    </>
  );
}
