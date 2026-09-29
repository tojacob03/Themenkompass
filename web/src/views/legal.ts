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

  const notOfficial = de
    ? `Der Themenkompass ist ein privates, nicht kommerzielles Open-Source-Projekt und kein Angebot der ${inst}.`
    : `Themenkompass is a private, non-commercial open-source project and not a service of the ${inst}.`;
  const addressLines = (legal.address ?? "").split("\n").filter(Boolean);
  const withBreaks = (lines: string[]) => lines.flatMap((line, i) => (i ? [h("br"), line] : [line]));

  const impressum = legal.operator
    ? h(
        "section",
        null,
        h("h2", null, de ? "Impressum" : "Legal notice"),
        h("h3", null, de ? "Angaben gemäß § 5 DDG" : "Information according to § 5 DDG"),
        h("p", null, withBreaks([legal.operator, ...addressLines])),
        contact ? h("p", null, de ? "E-Mail: " : "E-mail: ", contact) : null,
        addressLines.length
          ? [
              h("h3", null, de ? "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV" : "Responsible for content (§ 18(2) MStV)"),
              h("p", null, de ? `${legal.operator}, Anschrift wie oben` : `${legal.operator}, address as above`),
            ]
          : null,
        h("h3", null, de ? "Haftung für Links" : "Liability for links"),
        h(
          "p",
          null,
          de
            ? "Diese Website enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Für diese fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werde ich derartige Links umgehend entfernen."
            : "This website links to external websites of third parties whose content I cannot influence. The respective provider or operator is always responsible for that content. I will remove such links as soon as I become aware of any infringement.",
        ),
        h("p", null, notOfficial),
      )
    : h(
        "section",
        null,
        h("h2", null, de ? "Betrieb" : "Operator"),
        h("p", null, notOfficial, contact ? [de ? " Kontakt über " : " Contact via ", contact, "."] : null),
      );

  const privacyDe: [string, string][] = [
    ["Verantwortlich", legal.operator ? `${legal.operator}, Kontakt siehe Impressum.` : "Siehe Abschnitt „Betrieb“."],
    [
      "Besuch der Seite",
      "Die Seite setzt keine Cookies, nutzt kein Tracking und lädt keine Inhalte von Dritten; Schriften und Programmcode liegen auf demselben Server. Gehostet wird sie bei Cloudflare (Cloudflare, Inc., Workers Static Assets). Beim Abruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten wie die IP-Adresse, um die Seite auszuliefern und vor Angriffen zu schützen. Cloudflare hat seinen Sitz in den USA und ist nach dem EU-US Data Privacy Framework zertifiziert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Einstellungen für Sprache und Farbschema speichert nur dein Browser (localStorage).",
    ],
    [
      "Angaben zu Forschenden",
      "Die Seite zeigt Namen und Veröffentlichungen von Forschenden. Diese Angaben stammen aus OpenAlex, einer frei lizenzierten Sammlung öffentlich zugänglicher bibliografischer Daten, und damit nicht von den Betroffenen selbst (Art. 14 DSGVO). Zweck ist, Studierenden die Orientierung zu erleichtern, wer an der Universität zu welchem Thema forscht. Rechtsgrundlage ist das berechtigte Interesse nach Art. 6 Abs. 1 lit. f DSGVO: Die Angaben sind bereits öffentlich, beschränken sich auf die berufliche Veröffentlichungstätigkeit und enthalten keine Kontaktdaten, Fotos oder Bewertungen.",
    ],
    [
      "Deine Rechte",
      "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch (Art. 15 bis 21 DSGVO). Wer nicht genannt werden möchte, wird ohne Rückfragen entfernt, auf Wunsch auch per E-Mail an die Adresse im Impressum statt über GitHub; die Seite „Datenqualität und Grenzen“ beschreibt den Weg. Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel bei der Landesbeauftragten für den Datenschutz Niedersachsen.",
    ],
    ["Speicherdauer", "Die Daten werden monatlich neu aus OpenAlex erzeugt. Entfernte Personen stehen dauerhaft auf einer Ausschlussliste, die nur die OpenAlex-ID enthält."],
  ];
  const privacyEn: [string, string][] = [
    ["Controller", legal.operator ? `${legal.operator}, contact see legal notice.` : "See “Operator”."],
    [
      "Visiting the site",
      "The site sets no cookies, uses no tracking and loads nothing from third parties; fonts and code are served from the same host. It is hosted on Cloudflare (Cloudflare, Inc., Workers Static Assets). When you visit, Cloudflare processes technically necessary connection data such as your IP address to deliver the site and protect it against attacks. Cloudflare is based in the US and certified under the EU-US Data Privacy Framework. Legal basis: Art. 6(1)(f) GDPR. Language and colour-scheme settings are stored only in your browser (localStorage).",
    ],
    [
      "Information about researchers",
      "The site shows names and publications of researchers. This information comes from OpenAlex, a freely licensed collection of publicly available bibliographic data, and therefore not from the people concerned (Art. 14 GDPR). The purpose is to help students find out who at the university works on which topic. Legal basis is legitimate interest under Art. 6(1)(f) GDPR: the information is already public, limited to professional publishing, and includes no contact details, photos or ratings.",
    ],
    [
      "Your rights",
      "You have the right to access, rectification, erasure, restriction and objection (Art. 15 to 21 GDPR). Anyone who does not want to be listed is removed without questions, also by e-mail to the address in the legal notice instead of GitHub; the page “Data quality and limits” describes how. You can also complain to a data protection authority, for example the one for Lower Saxony.",
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
