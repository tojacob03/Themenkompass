import { describe, expect, it } from "vitest";
import { activity, buildNetwork, filterWorks, peopleForTopic, recentWorks, topicTree, trend, workInTopic } from "./analysis";
import { dataset, topics, works } from "./fixtures";

describe("trend", () => {
  // Same cases as tests/test_export.py::test_trend, so both implementations agree.
  const cases: [number[], string][] = [
    [[0, 0, 0, 1, 1, 1, 5, 5, 5, 9], "up"],
    [[0, 0, 0, 5, 5, 5, 1, 1, 1, 0], "down"],
    [[0, 0, 0, 4, 4, 4, 4, 4, 5, 0], "stable"],
    [[0, 0, 0, 1, 0, 1, 1, 0, 1, 40], "few"],
    [[0, 0, 0, 0, 0, 0, 2, 2, 2, 0], "up"],
  ];
  it.each(cases)("%j -> %s", (counts, expected) => {
    expect(trend(counts, [2017, 2026], 2026)).toBe(expected);
  });
});

describe("filterWorks", () => {
  it("filters by faculty, unit and years", () => {
    expect(filterWorks(works, { from: 2022, to: 2026, faculty: "f2" }).map((w) => w.i)).toEqual(["W4", "W5"]);
    expect(filterWorks(works, { from: 2022, to: 2026, unit: "data" }).map((w) => w.i)).toEqual(["W1", "W2"]);
    expect(filterWorks(works, { from: 2025, to: 2026 }).map((w) => w.i)).toEqual(["W4", "W5"]);
  });
});

describe("topicTree", () => {
  it("counts each work once under its primary topic", () => {
    const tree = topicTree(works, topics, [2022, 2026]);
    expect(tree.total).toBe(6);
    const social = tree.domains.find((d) => d.id === "2")!;
    expect(social.total).toBe(4);
    const econ = social.children[0]!.children[0]!;
    expect(econ.children.map((t) => [t.id, t.total])).toEqual([["T1", 3], ["T2", 1]]);
    expect(econ.children[0]!.perYear).toEqual([1, 0, 2, 0, 0]);
    // largest domain first
    expect(tree.domains.map((d) => d.id)).toEqual(["2", "1"]);
  });
});

describe("people and activity", () => {
  it("lists people for a topic alphabetically, counting any topic rank", () => {
    const ds = dataset();
    const people = peopleForTopic(works, "T1", ds.personById);
    expect(people.map((p) => [p.person.n, p.works])).toEqual([
      ["Alma Beispiel", 4],
      ["Bruno Testmann", 3],
      ["Clara Fiktiv", 1],
    ]);
  });

  it("describes activity in plain terms", () => {
    const ds = dataset();
    expect(activity(ds.personById.get("A1")!, 2026)).toBe("active");
    expect(activity(ds.personById.get("A2")!, 2026)).toBe("quiet");
    expect(activity(ds.personById.get("A3")!, 2026)).toBe("inactive");
  });

  it("returns recent works newest first", () => {
    expect(recentWorks(works, 2026, 3).map((w) => w.i)).toEqual(["W5", "W4", "W3", "W6"]);
  });
});

describe("buildNetwork", () => {
  const base = { from: 2022, to: 2026, external: false, cap: 25, minWeight: 1 };

  it("links co-authors and skips large teams", () => {
    const ds = dataset();
    const g = buildNetwork(works, ds.personById, topics, base);
    expect(g.edges).toEqual([
      { source: "A1", target: "A2", weight: 2, kind: "internal" },
      { source: "A1", target: "A3", weight: 1, kind: "internal" },
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(["A1", "A2", "A3"]);
  });

  it("respects unit filter, minimum weight and external partners", () => {
    const ds = dataset();
    const g = buildNetwork(works, ds.personById, topics, { ...base, faculty: "f1", minWeight: 2 });
    expect(g.edges.map((e) => `${e.source}-${e.target}`)).toEqual(["A1-A2"]);
    const ext = buildNetwork(works, ds.personById, topics, { ...base, unit: "econ", external: true });
    expect(ext.edges.filter((e) => e.kind === "external").map((e) => e.target).sort()).toEqual(["I8", "I9"]);
    expect(ext.nodes.find((n) => n.id === "I9")).toEqual({ id: "I9", kind: "institution", weight: 2 });
  });

  it("filters by topic level", () => {
    const w = works[1]!;
    expect(workInTopic(w, topics, "field", "20")).toBe(true);
    expect(workInTopic(w, topics, "subfield", "1105")).toBe(false);
    expect(workInTopic(w, topics, "topic", "T1")).toBe(true);
  });
});
