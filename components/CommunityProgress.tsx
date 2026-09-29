"use client";

// Kept under the existing component name. No counters or minimum-goal campaigns.
export function CommunityProgress({ orderingOpen }: { orderingOpen: boolean }) {
  return <section className="community-progress" aria-label="Free community delivery">
    <div><span className="community-eyebrow">Better together · Free community delivery</span><h2>Free delivery between 7pm - 8pm everyday</h2>
      <p>No minimum spend. Order <strong>2–6:30 p.m.</strong> for delivery <strong>7–8 p.m.</strong> · Phoenix time.</p>
    </div>
    <span className={`community-availability${orderingOpen ? " is-open" : ""}`}>{orderingOpen ? "Community ordering is open now." : "Community ordering is currently closed."}</span>
  </section>;
}
