import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommunityProgress } from "../components/CommunityProgress";

test("free delivery keeps the requested heading and has no progress bar or minimum", async () => {
  render(<CommunityProgress orderingOpen />);
  expect(screen.getByRole("heading", { name: "Free delivery between 7pm - 8pm everyday" })).toBeTruthy();
  expect(screen.getByText("Better together · Free community delivery")).toBeTruthy();
  expect(screen.getByText(/No minimum spend/)).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByText(/pickup or refund/i)).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
test("distinguishes ordering hours from free delivery hours", () => {
  render(<CommunityProgress orderingOpen={false} />);
  expect(screen.getByText("2–6:30 p.m.")).toBeTruthy();
  expect(screen.getByText("7–8 p.m.")).toBeTruthy();
  expect(screen.getByText(/Community ordering is currently closed/)).toBeTruthy();
});
