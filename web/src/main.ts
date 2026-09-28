import "@fontsource-variable/atkinson-hyperlegible-next";
import "./styles.css";
import { type Dataset, loadDataset } from "./data";
import { h } from "./dom";
import { lang, loc, setLang, t } from "./i18n";
import { currentRoute } from "./router";
import { homeView } from "./views/home";
import { searchView } from "./views/search";
import { topicView } from "./views/topic";
import { unitView } from "./views/unit";

type Theme = "auto" | "light" | "dark";
const main = document.getElementById("main")!;
let dataset: Dataset | null = null;
let lastPath = "";

function theme(): Theme {
  const v = document.documentElement.dataset.theme;
  return v === "light" || v === "dark" ? v : "auto";
}

function setTheme(next: Theme): void {
  if (next === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    if (next === "auto") localStorage.removeItem("tk-theme");
    else localStorage.setItem("tk-theme", next);
  } catch {
    /* storage unavailable */
  }
}

function shell(ds: Dataset): void {
  const route = currentRoute();
  const section = route.path[0] ?? "";
  const link = (hash: string, label: string, active: boolean) =>
    h("a", { href: hash, "aria-current": active ? "page" : null }, label);
  document.getElementById("mainnav")!.replaceChildren(
    h(
      "ul",
      null,
      h("li", null, link("#/", t().navTopics, section === "" || section === "thema" || section === "einheit")),
      h("li", null, link("#/suche", t().navSearch, section === "suche")),
      h("li", null, link("#/netz", t().navNetwork, section === "netz")),
      h("li", null, link("#/daten", t().navQuality, section === "daten")),
    ),
  );
  const themes: Theme[] = ["auto", "light", "dark"];
  const themeLabel = { auto: t().themeAuto, light: t().themeLight, dark: t().themeDark }[theme()];
  document.getElementById("toggles")!.replaceChildren(
    h(
      "button",
      {
        type: "button",
        class: "toggle",
        lang: lang === "de" ? "en" : "de",
        "aria-label": t().langSwitchLabel,
        onclick: () => {
          setLang(lang === "de" ? "en" : "de");
          render(true);
        },
      },
      t().langSwitch,
    ),
    h(
      "button",
      {
        type: "button",
        class: "toggle theme-toggle",
        title: themeLabel,
        "aria-label": themeLabel,
        onclick: () => {
          setTheme(themes[(themes.indexOf(theme()) + 1) % themes.length]!);
          render(true);
        },
      },
      h("span", { class: `theme-icon theme-${theme()}`, "aria-hidden": "true" }),
    ),
  );
  const date = new Date(ds.meta.retrievedAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB");
  document.getElementById("sitefoot")!.replaceChildren(
    h(
      "ul",
      null,
      h("li", null, h("a", { href: "https://openalex.org", rel: "noopener", target: "_blank" }, t().footData)),
      h("li", null, t().footUpdated(date)),
      ds.meta.repository ? h("li", null, h("a", { href: ds.meta.repository, rel: "noopener", target: "_blank" }, t().footCode)) : null,
      h("li", null, h("a", { href: "#/daten" }, t().footQuality)),
      h("li", null, h("a", { href: "#/rechtliches" }, t().footLegal)),
    ),
  );
  document.querySelector(".skip-link")!.textContent = t().skip;
}

async function view(ds: Dataset): Promise<{ el: HTMLElement; title: string }> {
  const route = currentRoute();
  const [section = "", id = ""] = route.path;
  const inst = loc(ds.meta.institution.name);
  switch (section) {
    case "":
      return { el: homeView(ds, route), title: `Themenkompass: ${inst}` };
    case "thema":
      return { el: topicView(ds, id), title: ds.topics.topics[id]?.[0] ?? "Themenkompass" };
    case "einheit":
      return { el: unitView(ds, id), title: ds.unitById.get(id) ? loc(ds.unitById.get(id)!.name) : "Themenkompass" };
    case "suche":
      return { el: searchView(ds, route), title: t().searchTitle };
    default:
      return { el: h("p", null, t().notFound), title: "404" };
  }
}

async function render(keepFocus = false): Promise<void> {
  if (!dataset) return;
  const path = currentRoute().path.join("/");
  const navigated = path !== lastPath;
  lastPath = path;
  shell(dataset);
  const { el, title } = await view(dataset);
  main.replaceChildren(el);
  document.title = title === "Themenkompass" || title.startsWith("Themenkompass:") ? title : `${title} | Themenkompass`;
  if (navigated && !keepFocus) {
    window.scrollTo(0, 0);
    // Move focus to the new page for screen reader and keyboard users.
    if (path) (main.querySelector("h1") as HTMLElement | null)?.setAttribute("tabindex", "-1");
    if (path) (main.querySelector("h1") as HTMLElement | null)?.focus({ preventScroll: true });
  }
}

async function start(): Promise<void> {
  document.documentElement.lang = lang;
  main.replaceChildren(h("p", { class: "loading", role: "status" }, t().loading));
  try {
    dataset = await loadDataset();
  } catch (error) {
    console.error(error);
    main.replaceChildren(h("p", { class: "error", role: "alert" }, t().loadError));
    return;
  }
  window.addEventListener("hashchange", () => void render());
  await render();
}

void start();
