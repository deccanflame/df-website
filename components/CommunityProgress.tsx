"use client";

import { useEffect, useRef, useState } from "react";
import { campaignPercent, campaignPhase } from "../functions/community-progress.mjs";
import { formatPrice } from "../lib/order-types";

type Campaign = { id: string; community: string; startAt: string; endAt: string; paidOrders: number; foodSubtotal: number; qualifiedAt: string | null };
type Progress = { enabled: boolean; serverTime: string; campaigns: Campaign[] };

export function CommunityProgress({ enabled, community, onCommunityChange }: { enabled: boolean; community: string; onCommunityChange: (name: string) => void }) {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const clock = useRef({ timestamp: 0, receivedAt: 0 });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const response = await fetch("/api/square/community-progress/", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const result = await response.json() as Progress;
        if (!response.ok || typeof result.enabled !== "boolean" || !Array.isArray(result.campaigns) || !Number.isFinite(Date.parse(result.serverTime))) throw new Error("Unavailable");
        if (controller.signal.aborted) return;
        clock.current = { timestamp: Date.parse(result.serverTime), receivedAt: performance.now() };
        setNow(clock.current.timestamp); setData(result); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { busy = false; }
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 20000);
    const tick = window.setInterval(() => { if (clock.current.timestamp) setNow(clock.current.timestamp + performance.now() - clock.current.receivedAt); }, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled]);
  const campaign = data?.campaigns.find(c => c.community === community) || data?.campaigns[0];
  const phase = campaign ? campaignPhase(campaign, now) : "";
  const percent = campaign ? campaignPercent(campaign) : 0;
  const countdown = campaign ? Math.max(0, Math.ceil((Date.parse(campaign.startAt) - now) / 1000)) : 0;
  const unavailable = !enabled || data?.enabled === false;
  const title = unavailable ? "Community delivery is getting ready" : !campaign ? "Checking community delivery…" : phase === "countdown" ? "Your neighbourhood. One delicious delivery." : phase === "confirmed" ? "Community delivery confirmed!" : phase === "collecting" ? "A little closer with every order." : phase === "settling" ? "Checking the final payments…" : "This window has closed";
  return <section className={`community-progress ${phase === "confirmed" ? "is-confirmed" : ""}`} aria-label="Community delivery progress">
    <div className="community-progress-heading"><div><span className="community-eyebrow">Better together · community delivery</span><h2>{title}</h2></div>
      {data && data.campaigns.length > 0 && <label className="community-picker">Your community<select value={campaign?.community || ""} onChange={event => onCommunityChange(event.target.value)}>{data.campaigns.map(c => <option key={c.id} value={c.community}>{c.community}</option>)}</select></label>}
    </div>
    {unavailable ? <p>Live payment tracking is not connected yet. Choose pickup or <a href="tel:+14805771274">call us about delivery</a>.</p> : campaign ? <>
      <div className="community-window"><span>{new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(campaign.startAt))}–{new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" }).format(new Date(campaign.endAt))} · Phoenix time</span>
        {phase === "countdown" && <strong>Opens in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</strong>}
      </div>
      <div className="community-meter" role="progressbar" aria-label={`${campaign.community} delivery goal`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${campaign.paidOrders} of 5 paid orders or ${formatPrice(campaign.foodSubtotal, "USD")} of $50`}><span style={{ width: `${percent}%` }} /></div>
      <div className="community-metrics"><strong>{campaign.paidOrders} <span>of 5 paid orders</span></strong><span className="community-or">OR</span><strong>{formatPrice(campaign.foodSubtotal, "USD")} <span>of $50</span></strong></div>
      <p>{phase === "confirmed" ? "The goal is met. Our team will deliver eligible community orders from this window." : phase === "fallback" ? "The minimum has not been met. Please pick up your order or contact us to request a refund. Delayed payment confirmations may still update this result." : phase === "settling" ? "The ordering window has ended. Allow a moment for Square to confirm the final payments." : "Reach either 5 paid orders OR $50 together before the window closes to unlock delivery."}</p>
      {(phase === "fallback" || phase === "settling") && <a className="community-contact" href="tel:+14805771274">Pickup or refund help · 480-577-1274</a>}
      <small>Food subtotal after discounts, excluding taxes and tips. If neither goal is met, pickup or request a refund. Pay before the cutoff; late payments are pickup or refund only. Refunds are handled by our team.</small>
    </> : <p>{error ? "We couldn't load progress. Please try again shortly or call us." : "Loading verified payment progress…"}</p>}
    {error && campaign && <p role="status" className="community-stale">Connection interrupted — showing the last known totals. Reconnecting automatically.</p>}
  </section>;
}
