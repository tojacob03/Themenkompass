// Legal notice (Impressum, if configured) and privacy notice.

import type { Dataset } from "../data";
import { h } from "../dom";
import { lang, loc } from "../i18n";

export function legalView(ds: Dataset): HTMLElement {
  const legal = ds.meta.legal ?? {};
  const inst = loc(ds.meta.institution.name);
  const repo = ds.meta.repository;
  const contact = legal.email
    ? h("a", { href: `mailto:${legal.email}` }, legal.email)
    : repo
      ? h("a", { href: `${repo}/issues`, rel: "noopener", target: "_blank" }, "GitHub Issues")
      : null;
  const de = lang === "de";

  const impressum = legal.operator
    ? h(
        "section",
        null,
        h("h2", null, de ? "Impressum" : "Legal notice"),
        h("p", null, legal.operator, legal.address ? h("br") : null, legal.address ?? null),
        contact ? h("p", null, de ? "Kontakt: " : "Contact: ", contact) : null,
        h(
          "p",
          null,
          de
            ? `Der Themenkompass ist ein privates, nicht kommerzielles Open-Source-Projekt und kein Angebot der ${inst}.`
            : `Themenkompass is a private, non-commercial open-source project and not a service of the ${inst}.`,
        ),
      )
    : h(
        "section",
        null,
        h("h2", null, de ? "Betrieb" : "Operator"),
        h(
          "p",
          null,
          de
            ? `Der Themenkompass ist ein privates, nicht kommerzielles Open-Source-Projekt und kein Angebot der ${inst}. Kontakt über `
            : `Themenkompass is a private, non-commercial open-source project and not a service of the ${inst}. Contact via `,
          contact,
          ".",
        ),
      );

  const privacyDe: [string, string][] = [
    [
      "Besuch der Seite",
      "Die Seite setzt keine Cookies, nutzt kein Tracking und lädt keine Inhalte von Dritten; Schriften und Programmcode liegen auf demselben Server. Gehostet wird sie bei Cloudflare Pages (Cloudflare, Inc.). Beim Abruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten wie die IP-Adresse, um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Einstellungen für Sprache und Farbschema speichert nur dein Browser (localStorage).",
    ],
    [
      "Angaben zu Forschenden",
      "Die Seite zeigt Namen und Veröffentlichungen von Forschenden. Diese Angaben stammen aus OpenAlex, einer frei lizenzierten Sammlung öffentlich zugänglicher bibliografischer Daten, und damit nicht von den Betroffenen selbst (Art. 14 DSGVO). Zweck ist, Studierenden die Orientierung zu erleichtern, wer an der Universität zu welchem Thema forscht. Rechtsgrundlage ist das berechtigte Interesse nach Art. 6 Abs. 1 lit. f DSGVO: Die Angaben sind bereits öffentlich, beschränken sich auf die berufliche Veröffentlichungstätigkeit und enthalten keine Kontaktdaten, Fotos oder Bewertungen.",
    ],
    [
      "Deine Rechte",
      "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch (Art. 15 bis 21 DSGVO). Wer nicht genannt werden möchte, wird ohne Rückfragen entfernt; die Seite „Datenqualität und Grenzen“ beschreibt den Weg. Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel bei der Landesbeauftragten für den Datenschutz Niedersachsen.",
    ],
    ["Speicherdauer", "Die Daten werden monatlich neu aus OpenAlex erzeugt. Entfernte Personen stehen dauerhaft auf einer Ausschlussliste, die nur die OpenAlex-ID enthält."],
  ];
  const privacyEn: [string, string][] = [
    [
      "Visiting the site",
      "The site sets no cookies, uses no tracking and loads nothing from third parties; fonts and code are served from the same host. It is hosted on Cloudflare Pages (Cloudflare, Inc.). When you visit, Cloudflare processes technically necessary connection data such as your IP address to deliver the site and protect it against attacks. Legal basis: Art. 6(1)(f) GDPR. Language and colour-scheme settings are stored only in your browser (localStorage).",
    ],
    [
      "Information about researchers",
      "The site shows names and publications of researchers. This information comes from OpenAlex, a freely licensed collection of publicly available bibliographic data, and therefore not from the people concerned (Art. 14 GDPR). The purpose is to help students find out who at the university works on which topic. Legal basis is legitimate interest under Art. 6(1)(f) GDPR: the information is already public, limited to professional publishing, and includes no contact details, photos or ratings.",
    ],
    [
      "Your rights",
      "You have the right to access, rectification, erasure, restriction and objection (Art. 15 to 21 GDPR). Anyone who does not want to be listed is removed without questions; the page “Data quality and limits” describes how. You can also complain to a data protection authority, for example the one for Lower Saxony.",
    ],
    ["Retention", "The data is rebuilt from OpenAlex every month. Removed people stay on an exclusion list that contains only their OpenAlex id."],
  ];

  return h(
    "article",
    { class: "page prose" },
    h("h1", null, de ? "Impressum und Datenschutz" : "Legal notice and privacy"),
    impressum,
    h("h2", null, de ? "Datenschutzhinweis" : "Privacy notice"),
    (de ? privacyDe : privacyEn).map(([title, text]) => h("section", null, h("h3", null, title), h("p", null, text))),
  );
}
