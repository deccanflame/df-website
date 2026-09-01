"use client";

import { useEffect, useState } from "react";

const menuItems = [
  {
    number: "01",
    name: "Dum Biryani",
    eyebrow: "The crown jewel",
    description:
      "Fragrant basmati, deep masala and saffron sealed under dough—opened only when every layer is ready.",
    className: "biryani",
  },
  {
    number: "02",
    name: "Haleem",
    eyebrow: "Low flame. Long memory.",
    description:
      "A slow-cooked Hyderabadi classic with a silken finish, lifted by crisp onion, herbs and citrus.",
    className: "haleem",
  },
  {
    number: "03",
    name: "Pathar ka Gosht",
    eyebrow: "Fire meets stone",
    description:
      "Tender, spice-lacquered cuts seared hot in the old-city tradition for smoke, char and unmistakable depth.",
    className: "gosht",
  },
  {
    number: "04",
    name: "Double ka Meetha",
    eyebrow: "A golden finale",
    description:
      "Caramelised bread, saffron milk and roasted nuts—warm, lush and just restrained enough.",
    className: "meetha",
  },
];

const craftSteps = [
  ["I", "Toast", "Whole spices warmed until their oils wake up."],
  ["II", "Layer", "Rice, masala, herbs and saffron built with precision."],
  ["III", "Seal", "The handi is closed so every note stays inside."],
  ["IV", "Dum", "Time and low flame finish what technique began."],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  const closeMenu = () => setMenuOpen(false);

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
          <a href="#story">Story</a>
          <a href="#menu">Signature menu</a>
          <a href="#craft">Our craft</a>
        </nav>

        <a className="nav-cta" href="#experience">
          Find your flame <span aria-hidden="true">↗</span>
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
      </header>

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <div className="mobile-menu-inner">
          <p>Navigate the feast</p>
          <a onClick={closeMenu} href="#story">
            <span>01</span> Story
          </a>
          <a onClick={closeMenu} href="#menu">
            <span>02</span> Signature menu
          </a>
          <a onClick={closeMenu} href="#craft">
            <span>03</span> Our craft
          </a>
          <a onClick={closeMenu} href="#experience">
            <span>04</span> Experience
          </a>
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
            <a className="text-link" href="#story">
              Discover our story <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className="hero-footer reveal-item">
          <div>
            <span className="hero-micro">01 / 04</span>
            <span className="hero-rule" />
            <span className="hero-micro">The fire begins</span>
          </div>
          <a href="#story" aria-label="Scroll to our story">
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

      <section className="story section-shell" id="story">
        <div className="story-copy">
          <div className="section-kicker">
            <span>02</span>
            <p>The Deccan way</p>
          </div>
          <h2>Not just cooked.<br /><em>Composed.</em></h2>
          <p className="story-lead">
            Hyderabadi cuisine lives in contrasts: smoke and perfume, patience
            and theatre, royal finesse and street-side soul. Deccan Flame brings
            those tensions to the table in every dish.
          </p>
          <div className="story-notes">
            <div><strong>Slow</strong><span>Time is an ingredient.</span></div>
            <div><strong>Layered</strong><span>Every bite reveals another note.</span></div>
            <div><strong>Alive</strong><span>Finished with heat and intent.</span></div>
          </div>
        </div>

        <div className="spice-stage" aria-label="Animated sculpture representing layered spice">
          <div className="stage-label top">A study in spice</div>
          <div className="masala-planet">
            <div className="planet-core"><span /></div>
            <div className="orbit orbit-a"><i /></div>
            <div className="orbit orbit-b"><i /></div>
            <div className="orbit orbit-c"><i /></div>
            <div className="spice-sphere sphere-a" />
            <div className="spice-sphere sphere-b" />
            <div className="spice-sphere sphere-c" />
          </div>
          <div className="stage-label bottom">Roasted · Ground · Bloomed</div>
        </div>
      </section>

      <section className="menu-section" id="menu">
        <div className="section-shell menu-heading">
          <div>
            <div className="section-kicker light">
              <span>03</span><p>Signature plates</p>
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
                <span>{item.number}</span>
                <span>Deccan signature</span>
              </div>
              <div className="dish-stage" aria-hidden="true">
                <div className="dish-glow" />
                <div className="dish-plate">
                  <span className="food food-one" />
                  <span className="food food-two" />
                  <span className="food food-three" />
                  <span className="food food-four" />
                  <i />
                </div>
                <div className="dish-shadow" />
              </div>
              <div className="menu-card-copy">
                <p>{item.eyebrow}</p>
                <h3>{item.name}</h3>
                <span>{item.description}</span>
              </div>
              <div className="card-corner" aria-hidden="true">↗</div>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <div className="manifesto-orb orb-left" aria-hidden="true" />
        <div className="manifesto-orb orb-right" aria-hidden="true" />
        <p>For the table that wants</p>
        <h2>more smoke,<br />more soul,<br /><em>more story.</em></h2>
        <div className="manifesto-mark" aria-hidden="true">
          <span className="flame flame-a" />
          <span className="flame flame-b" />
          <span className="flame flame-c" />
        </div>
      </section>

      <section className="craft section-shell" id="craft">
        <div className="craft-heading">
          <div className="section-kicker">
            <span>04</span><p>Built by fire</p>
          </div>
          <h2>Four moves.<br /><em>One unforgettable reveal.</em></h2>
        </div>
        <div className="craft-grid">
          {craftSteps.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <div className="craft-icon" aria-hidden="true"><i /><b /></div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="experience" id="experience">
        <div className="experience-image" aria-hidden="true">
          <img src="/deccan-flame-hero.webp" alt="" loading="lazy" />
        </div>
        <div className="experience-overlay" />
        <div className="experience-content">
          <img src="/deccan-flame-logo.webp" alt="Deccan Flame" loading="lazy" />
          <p>Authentic · Bold · Unforgettable</p>
          <h2>Come hungry.<br /><em>Leave lit.</em></h2>
          <p className="experience-note">
            Opening details, location and reservations are coming next.
          </p>
          <a className="button button-primary" href="#top">
            <span>Back to the flame</span><i aria-hidden="true">↑</i>
          </a>
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="footer-flame" aria-hidden="true" />
          <strong>DECCAN<br />FLAME</strong>
        </div>
        <div className="footer-block">
          <span>Explore</span>
          <a href="#story">Our story</a>
          <a href="#menu">Signature menu</a>
          <a href="#craft">Our craft</a>
        </div>
        <div className="footer-block">
          <span>Stay close</span>
          <p>Location, hours and booking details will be added before launch.</p>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Deccan Flame</span>
          <span>Hyderabadi cuisine · Reignited</span>
        </div>
      </footer>
    </main>
  );
}
