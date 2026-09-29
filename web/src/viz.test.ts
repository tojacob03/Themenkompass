import { describe, expect, it } from "vitest";
import { dataset } from "./fixtures";
import { domainMix, topicFingerprint } from "./viz";

describe("topicFingerprint", () => {
  it("is a table of topics by year whose totals match the works", () => {
    const ds = dataset();
    const alma = ds.personById.get("A1")!;
    alma.tp = [["T1", 4], ["T3", 1]];
    const el = topicFingerprint(ds, alma)!;
    const rows = [...el.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    // T1: W1 2022, W2 2023, W3 2024, W6 2024 -> total 4, two dots in 2024 counted once as a cell
    expect(rows[0]!.querySelector(".fp-total")!.textContent).toBe("4");
    expect(rows[0]!.querySelectorAll(".fp-dot")).toHaveLength(3);
    expect(el.querySelectorAll("thead th")).toHaveLength(1 + 5 + 1);
  });
});

describe("domainMix", () => {
  it("describes the shares for screen readers", () => {
    const ds = dataset();
    const el = domainMix(ds, new Map([["2", 3], ["1", 1]]));
    expect(el.getAttribute("aria-label")).toBe("Social Sciences: 75 %, Life Sciences: 25 %");
    expect(el.children).toHaveLength(2);
  });
});
