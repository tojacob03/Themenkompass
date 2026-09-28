import { describe, expect, it } from "vitest";
import { h } from "./dom";
import { currentRoute, href } from "./router";

describe("h", () => {
  it("never interprets text as markup", () => {
    const el = h("p", null, "<img src=x onerror=alert(1)>");
    expect(el.children.length).toBe(0);
    expect(el.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("sets attributes and skips empty ones", () => {
    const el = h("a", { href: "#/x", "aria-current": null, hidden: false });
    expect(el.getAttribute("href")).toBe("#/x");
    expect(el.hasAttribute("aria-current")).toBe(false);
  });
});

describe("router", () => {
  it("round-trips paths and params", () => {
    const link = href(["thema", "T1"], { f: "fk2", u: undefined, from: 2020 });
    expect(link).toBe("#/thema/T1?f=fk2&from=2020");
    const route = currentRoute(link);
    expect(route.path).toEqual(["thema", "T1"]);
    expect(route.params.get("from")).toBe("2020");
  });
});
