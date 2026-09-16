"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { VoteWidget } from "../components/VoteWidget";
import { useAuth } from "./providers";

const menuItems = [
  {
    number: "01",
    name: "Dum Biryani",
    eyebrow: "The crown jewel",
    description:
      "Fragrant basmati, deep masala and saffron sealed under dough—opened only when every layer is ready.",
    className: "biryani",
    image: "/mutton-dum-biryani.png",
    imageAlt: "Mutton dum biryani served in a hammered copper bowl",
  },
  {
    number: "02",
    name: "Haleem",
    eyebrow: "Low flame. Long memory.",
    description:
      "A slow-cooked Hyderabadi classic with a silken finish, lifted by crisp onion, herbs and citrus.",
    className: "haleem",
    image: "/mutton-haleem.png",
    imageAlt: "Hyderabadi mutton haleem garnished with fried onions, herbs and lemon",
  },
  {
    number: "03",
    name: "Mirchi ka Salan",
    eyebrow: "The exotic blend of spices",
    description:
      "A rich, tangy Hyderabadi blend of green chilies simmered in a creamy peanut, sesame, and coconut sauce.",
    className: "gosht",
    image: "/mirchi-ka-salan-v3.png",
    imageAlt: "Mirchi ka salan with green chillies in a traditional copper bowl",
  },
  {
    number: "04",
    name: "Double ka Meetha",
    eyebrow: "A golden finale",
    description:
      "Caramelised bread, saffron milk and roasted nuts—warm, lush and just restrained enough.",
    className: "meetha",
    image: "/double-ka-meetha.png",
    imageAlt: "Double ka meetha with saffron, pistachios and cashews",
  },
];

export default function Home() {
  const { user, profile, loading: authLoading, openAuth, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inquiryPrepared, setInquiryPrepared] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaded(true), 350);
    const onPointerMove = (event: PointerEvent) => {
      document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
      document.documentElement.style.setProperty("--my", `${event.clientY}px`);
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      document.documentElement.style.setProperty("--tilt-x", `${x * 7}deg`);
      document.documentElement.style.setProperty("--tilt-y", `${y * -5}deg`);
    };
    const onScroll = () => {
      document.documentElement.style.setProperty(
        "--scroll",
        `${Math.min(window.scrollY, 900)}px`,
      );
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const touchDevice = window.matchMedia("(hover: none), (pointer: coarse)");
    if (!touchDevice.matches || !("IntersectionObserver" in window)) return;

    const cards = document.querySelectorAll<HTMLElement>(".menu-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("is-touch-active", entry.isIntersecting);
        });
      },
      { threshold: 0.42, rootMargin: "-8% 0px -14%" },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const prepareCateringInquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const subject = `Deccan Flame catering enquiry — ${value("eventType") || "Event"}`;
    const body = [
      "Hello Deccan Flame,",
      "",
      "I’d like to discuss catering for an upcoming event.",
      "",
      `Name: ${value("name")}`,
      `Email: ${value("email")}`,
      `Phone: ${value("phone") || "Not provided"}`,
      `Event type: ${value("eventType")}`,
      `Event date: ${value("eventDate")}`,
      `Guest count: ${value("guestCount")}`,
      `Event location: ${value("location") || "Not provided"}`,
      `Dietary needs / notes: ${value("notes") || "None provided"}`,
      "",
      "Thank you.",
    ].join("\n");

    setInquiryPrepared(true);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <main className={loaded ? "site is-loaded" : "site"}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="pointer-glow" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="embers" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} style={{ "--i": index } as React.CSSProperties} />
        ))}
      </div>

      <header className="nav-shell">
        <a className="brand" href="#top" aria-label="Deccan Flame home">
          <span className="brand-mark">
            <img src="/deccan-flame-logo.webp" alt="" />
          </span>
          <span className="brand-copy">
            <strong>Deccan Flame</strong>
            <small>Hyderabadi Cuisine</small>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#menu">Signature menu</a>
          <a href="#vote">Vote</a>
          <a href="#catering">Catering</a>
        </nav>

        <div className="nav-actions">
          <button className="account-pill" type="button" onClick={() => user ? setMenuOpen(true) : openAuth("login")} disabled={authLoading}>
            <i aria-hidden="true">{user ? (profile?.displayName?.[0] ?? user.email?.[0] ?? "D").toUpperCase() : "•"}</i>
            <span>{authLoading ? "Loading" : user ? profile?.displayName?.split(" ")[0] ?? "Account" : "Sign in"}</span>
          </button>
          <a className="nav-cta" href="#catering">
            Plan catering <span aria-hidden="true">↗</span>
          </a>
          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <div className="mobile-menu-inner">
          <p>Navigate the feast</p>
          <a onClick={closeMenu} href="#menu">
            <span>02</span> Signature menu
          </a>
          <a onClick={closeMenu} href="#vote">
            <span>03</span> Vote
          </a>
          <a onClick={closeMenu} href="#catering">
            <span>04</span> Catering
          </a>
          {profile?.role === "admin" && (
            <a onClick={closeMenu} href="/dashboard" className="admin-menu-link">
              <span>ADM</span> Dashboard
            </a>
          )}
          <div className="menu-account">
            {user ? (
              <>
                <p>Signed in as <strong>{profile?.displayName ?? user.email}</strong></p>
                <button type="button" onClick={() => { logout(); closeMenu(); }}>Sign out</button>
              </>
            ) : (
              <button type="button" onClick={() => { closeMenu(); openAuth("login"); }}>Sign in or register</button>
            )}
          </div>
          <small>Authentic · Bold · Unforgettable</small>
        </div>
      </div>

      <section className="hero" id="top">
        <div className="hero-image" aria-hidden="true">
          <img src="/deccan-flame-hero.webp" alt="" fetchPriority="high" />
          <div className="hero-image-shade" />
        </div>

        <div className="hero-architecture" aria-hidden="true">
          <span className="hero-ring ring-one" />
          <span className="hero-ring ring-two" />
          <span className="hero-ring ring-three" />
        </div>

        <div className="hero-content" id="main-content">
          <div className="eyebrow reveal-item">
            <span /> Born in the lanes of Hyderabad
          </div>
          <h1 className="reveal-item">
            <span>Heat with</span>
            <em>heritage.</em>
          </h1>
          <p className="hero-intro reveal-item">
            Ancient technique. Fearless flavour. A Deccan feast reimagined for
            right now.
          </p>
          <div className="hero-actions reveal-item">
            <a className="button button-primary" href="#menu">
              <span>Explore the menu</span>
              <i aria-hidden="true">↓</i>
            </a>
            <a className="text-link" href="#vote">
              Vote for the special <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className="hero-footer reveal-item">
          <div>
            {/* <span className="hero-micro">01 / 04</span> */}
            {/* <span className="hero-rule" /> */}
            {/* <span className="hero-micro">The fire begins</span> */}
          </div>
          <a href="#menu" aria-label="Scroll to the signature menu">
            Scroll to taste <span>⌄</span>
          </a>
        </div>
      </section>

      <section className="ticker" aria-label="Restaurant qualities">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <div className="ticker-copy" key={copy} aria-hidden={copy === 1}>
              <span>DUM SEALED</span><i>✦</i><span>SPICE AWAKENED</span><i>✦</i>
              <span>OLD CITY SOUL</span><i>✦</i><span>FLAME FINISHED</span><i>✦</i>
            </div>
          ))}
        </div>
      </section>

      <section className="menu-section" id="menu">
        <div className="section-shell menu-heading">
          <div>
            <div className="menu-kicker-row">
              <div className="section-kicker light">
                <span>02</span><p>Signature plates</p>
              </div>
              <Link className="full-menu-link" href="/menu">
                <span>View full menu</span><i aria-hidden="true">↗</i>
              </Link>
            </div>
            <h2>The icons,<br /><em>set ablaze.</em></h2>
          </div>
          <p>
            A tightly edited journey through Hyderabad—built around aroma,
            texture and the kind of heat that keeps unfolding.
          </p>
        </div>

        <div className="menu-grid section-shell">
          {menuItems.map((item) => (
            <article className={`menu-card ${item.className}`} key={item.name}>
              <div className="menu-card-top">
                {/* <span>{item.number}</span> */}
                {/* <span>Deccan signature</span> */}
              </div>
              <figure className="dish-stage">
                <div className="dish-glow" />
                <div className="dish-image-shell">
                  <img src={item.image} alt={item.imageAlt} width={1254} height={1254} loading="lazy" decoding="async" />
                  <span className="dish-image-glint" aria-hidden="true" />
                  <span className="dish-image-vignette" aria-hidden="true" />
                </div>
                {/* <figcaption><span>Flame portrait</span><i>{item.number}</i></figcaption> */}
              </figure>
              <div className="menu-card-copy">
                <p>{item.eyebrow}</p>
                <h3>{item.name}</h3>
                <span>{item.description}</span>
              </div>
              {/* <div className="card-corner" aria-hidden="true">↗</div> */}
            </article>
          ))}
        </div>
      </section>

      <VoteWidget />

      {/* <section className="manifesto">
        <div className="manifesto-orb orb-left" aria-hidden="true" />
        <div className="manifesto-orb orb-right" aria-hidden="true" />
        <p>For the table that wants</p>
        <h2>more smoke,<br />more soul,<br /><em>more story.</em></h2>
        <div className="manifesto-mark" aria-hidden="true">
          <span className="flame flame-a" />
          <span className="flame flame-b" />
          <span className="flame flame-c" />
        </div>
      </section> */}

      <section className="catering section-shell" id="catering">
        <div className="catering-intro">
          <div className="section-kicker">
            <span>04</span><p>Catering enquiries</p>
          </div>
          <h2>Bring the flame<br /><em>to your table.</em></h2>
          <p className="catering-lead">
            From office lunches to wedding celebrations, tell us what you’re
            planning and we’ll shape a Hyderabadi feast around your occasion.
          </p>

          <div className="catering-occasions" aria-label="Catering occasions">
            <span>Weddings</span>
            <span>Corporate events</span>
            <span>Family celebrations</span>
            <span>Community gatherings</span>
          </div>

          <div className="catering-path">
            <div><b>01</b><span><strong>Share the occasion</strong>Tell us the date, setting and guest count.</span></div>
            <div><b>02</b><span><strong>Shape the menu</strong>Add dietary needs and dishes you have in mind.</span></div>
            <div><b>03</b><span><strong>Confirm together</strong>We’ll use your enquiry to plan the next conversation.</span></div>
          </div>
        </div>

        <div className="catering-form-shell">
          <div className="form-glow" aria-hidden="true" />
          <div className="form-heading">
            <div>
              <span>Start an enquiry</span>
              <h3>Tell us about your event.</h3>
            </div>
            <div className="form-emblem" aria-hidden="true"><i /></div>
          </div>

          <form onSubmit={prepareCateringInquiry}>
            <div className="field-row">
              <label>
                <span>Your name</span>
                <input name="name" type="text" autoComplete="name" placeholder="Full name" required />
              </label>
              <label>
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
              </label>
            </div>

            <div className="field-row">
              <label>
                <span>Phone</span>
                <input name="phone" type="tel" autoComplete="tel" placeholder="Optional" />
              </label>
              <label>
                <span>Event type</span>
                <select name="eventType" defaultValue="" required>
                  <option value="" disabled>Select occasion</option>
                  <option>Wedding</option>
                  <option>Corporate event</option>
                  <option>Family celebration</option>
                  <option>Community gathering</option>
                  <option>Other</option>
                </select>
              </label>
            </div>

            <div className="field-row">
              <label>
                <span>Event date</span>
                <input name="eventDate" type="date" required />
              </label>
              <label>
                <span>Guest count</span>
                <input name="guestCount" type="number" min="1" inputMode="numeric" placeholder="How many guests?" required />
              </label>
            </div>

            <label>
              <span>Event location</span>
              <input name="location" type="text" autoComplete="street-address" placeholder="Venue, city or neighbourhood" />
            </label>

            <label>
              <span>Menu ideas, dietary needs or questions</span>
              <textarea name="notes" rows={4} placeholder="Tell us what would make the feast feel just right…" />
            </label>

            <button className="catering-submit" type="submit">
              <span>{inquiryPrepared ? "Email draft opened" : "Prepare catering enquiry"}</span>
              <i aria-hidden="true">↗</i>
            </button>
            <p className="form-note">
              This prepares a complete email draft in your email app. No details
              are sent until you review and send it.
            </p>
          </form>
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="footer-flame" aria-hidden="true" />
          <strong>DECCAN<br />FLAME</strong>
        </div>
        <div className="footer-block">
          <span>Explore</span>
          <a href="#menu">Signature menu</a>
          <a href="#vote">Vote for a special</a>
          <a href="#catering">Catering</a>
        </div>
        <div className="footer-block footer-social">
          <span>Social</span>
          <div className="footer-social-icons">
            <a href="https://www.instagram.com/deccanflame4/" target="_blank" rel="noreferrer" aria-label="Deccan Flame on Instagram" title="Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" />
                <circle cx="12" cy="12" r="4.1" />
                <circle className="social-icon-dot" cx="17.4" cy="6.7" r="1" />
              </svg>
            </a>
            <a href="https://www.facebook.com/deccanflame" target="_blank" rel="noreferrer" aria-label="Deccan Flame on Facebook" title="Facebook">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.2 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4v1.9H8v3.1h2.8v8h3.4Z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-block footer-details">
          <span>Stay close</span>
          <p>Planning an event? Prepare your catering enquiry with the details we need to get started.</p>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Deccan Flame - All Rights Reserved</span>
          <span>Powered By VersaHQ</span>
        </div>
      </footer>
    </main>
  );
}
