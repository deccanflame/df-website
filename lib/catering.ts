export const cateringEmail = "deccanflame1@gmail.com";

export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function cateringMailto(form: FormData) {
  const value = (name: string) => String(form.get(name) ?? "").trim();
  if (!value("name") || !value("email") || !value("eventType") || !value("eventDate")) {
    throw new Error("Please complete your name, email, event type and event date.");
  }
  if (value("eventDate") < localDate()) throw new Error("Choose today or a future event date.");
  const guests = Number(value("guestCount"));
  if (!Number.isSafeInteger(guests) || guests < 1) throw new Error("Enter a whole guest count of at least one.");
  const subject = `Deccan Flame catering enquiry — ${value("eventType")}`;
  const body = [
    "Hello Deccan Flame,", "", "I’d like to discuss catering for an upcoming event.", "",
    `Name: ${value("name")}`, `Email: ${value("email")}`,
    `Phone: ${value("phone") || "Not provided"}`, `Event type: ${value("eventType")}`,
    `Event date: ${value("eventDate")}`, `Guest count: ${value("guestCount")}`,
    `Event location: ${value("location") || "Not provided"}`,
    `Dietary needs / notes: ${value("notes") || "None provided"}`, "", "Thank you.",
  ].join("\n");
  return `mailto:${cateringEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openCateringInquiry(form: FormData) {
  const mailto = cateringMailto(form);
  const { userAgent, maxTouchPoints } = window.navigator;
  // iPadOS can identify as a Mac, including when a keyboard or mouse is connected.
  const mobileOrTablet = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent)
    || (/Macintosh|MacIntel/i.test(userAgent) && maxTouchPoints > 1);

  if (mobileOrTablet) {
    window.location.href = mailto;
    return;
  }

  const draft = new URL(mailto);
  const gmail = new URL("https://mail.google.com/mail/");
  gmail.search = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: cateringEmail,
    su: draft.searchParams.get("subject") ?? "",
    body: draft.searchParams.get("body") ?? "",
  }).toString();

  // Open synchronously during submission, then detach before navigating to Gmail.
  const composeWindow = window.open("about:blank", "_blank");
  if (composeWindow) {
    composeWindow.opener = null;
    composeWindow.location.replace(gmail.href);
  } else {
    window.location.href = gmail.href;
  }
}
