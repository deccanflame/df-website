import type { Metadata } from "next";
import Link from "next/link";
import { SquareMenu } from "../../components/SquareMenu";
import "./ordering.css";

export const metadata: Metadata = {
  title: "Full Menu | Deccan Flame",
  description: "Explore Deccan Flame's full menu of Hyderabadi biryani, curries, tandoori dishes, Indo-Chinese favourites, breads, chai and snacks.",
};

const menuSections = [
  {
    id: "appetizers",
    number: "01",
    title: "Appetizers",
    note: "Crisp, bold beginnings",
    items: [
      ["Chicken 65", "$13.99"],
      ["Chicken Manchurian", "$13.99"],
      ["Paneer 65", "$12.99"],
    ],
  },
  {
    id: "biryani",
    number: "02",
    title: "Biryani",
    note: "Dum-sealed signatures",
    items: [
      ["Hyderabadi Mutton Dum Biryani", "$17.99"],
      ["Hyderabadi Chicken Dum Biryani", "$13.99"],
      ["Chicken 65 Biryani", "$14.99"],
      ["Tandoori Chicken Biryani", "$14.99"],
    ],
  },
  {
    id: "indo-chinese",
    number: "03",
    title: "Indo Chinese",
    note: "Wok-fired favourites",
    items: [
      ["Chicken Fried Rice", "$10.99"],
      ["Egg Fried Rice", "$9.99"],
      ["Veg Fried Rice", "$9.99"],
      ["Chicken Noodles", "$10.99"],
      ["Egg Noodles", "$9.99"],
      ["Veg Noodles", "$9.99"],
    ],
  },
  {
    id: "tandoori",
    number: "04",
    title: "Tandoori",
    note: "Charred over open flame",
    items: [
      ["Tandoori Chicken Kabab", "$12.99"],
      ["Tandoori Tikka Kabab", "$12.99"],
    ],
  },
  {
    id: "curries",
    number: "05",
    title: "Curries",
    note: "Slow-simmered comfort",
    items: [
      ["Butter Chicken", "$13.99"],
      ["Dum Ka Chicken", "$13.99"],
      ["Paneer Butter Masala", "$12.99"],
    ],
  },
  {
    id: "breads",
    number: "06",
    title: "Breads",
    note: "Fresh from the heat",
    items: [
      ["Garlic Naan", "$1.99"],
      ["Butter Naan", "$1.99"],
      ["Rumali Roti", "$2.49"],
    ],
  },
  {
    id: "chai-snacks",
    number: "07",
    title: "Chai & Snacks",
    note: "A quick Deccan pause",
    items: [
      ["Chai", "$1.49"],
      ["Samosa 2pc", "$3.99"],
      ["Combo", "$2.99"],
    ],
  },
] as const;

export default function MenuPage() {
  return (
    <main className="full-menu-page">
      <a className="skip-link" href="#full-menu-content">Skip to menu</a>
      <div className="grain" aria-hidden="true" />
      <div className="menu-page-glow" aria-hidden="true" />

      <header className="full-menu-nav">
        <Link className="full-menu-brand" href="/" aria-label="Deccan Flame home">
          <img
            src="/deccan-flame-logo.webp"
            alt=""
            width="58"
            height="70"
            decoding="async"
            fetchPriority="high"
          />
          <span><strong>Deccan Flame</strong><small>Hyderabadi Cuisine</small></span>
        </Link>
        <div className="full-menu-nav-actions">
          <span className="halal-badge"><i aria-hidden="true">✦</i> 100% Halal</span>
          <Link href="/">Back home</Link>
        </div>
      </header>

      <section className="full-menu-hero">
        <div className="full-menu-hero-copy">
          <span className="full-menu-eyebrow">The complete Deccan table</span>
          <h1>Full<br /><em>menu.</em></h1>
          <p>Hyderabadi classics, tandoori fire and Indo-Chinese favourites—made bold, served without compromise.</p>
        </div>
        <div className="full-menu-seal" aria-hidden="true">
          <span>Fresh</span><small>from our kitchen</small><i>✦</i>
        </div>
      </section>

      <SquareMenu>
      <nav className="menu-category-nav" aria-label="Menu categories">
        <div>
          {menuSections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>{section.title}</a>
          ))}
        </div>
      </nav>

      <section className="full-menu-content" id="full-menu-content">
        <div className="full-menu-grid">
          {menuSections.map((section) => (
            <article className="menu-list-card" id={section.id} key={section.id}>
              <header>
                <span>{section.number}</span>
                <div><h2>{section.title}</h2><p>{section.note}</p></div>
              </header>
              <ul>
                {section.items.map(([name, price]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <i aria-hidden="true" />
                    <strong>{price}</strong>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      </SquareMenu>

      <section className="menu-contact-strip" aria-label="Restaurant contact details">
        <div>
          <span>Call to order</span>
          <a href="tel:+14805771274">480-577-1274</a>
        </div>
        <div>
          <span>Find us</span>
          <a href="https://maps.google.com/?q=3502+W+Greenway+Rd+Phoenix+AZ+85053" target="_blank" rel="noreferrer">
            3502 W Greenway Rd, Phoenix, AZ 85053
          </a>
        </div>
        <div>
          <span>Follow the flame</span>
          <p>@deccanflame4 · @deccanflame</p>
        </div>
      </section>

      <footer className="full-menu-footer">
        <p>Online prices and availability are confirmed at checkout. For catering and allergies, please call us.</p>
        <Link href="/#catering">Planning an event? Explore catering <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
