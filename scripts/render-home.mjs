// Build index.html from content/site.json. Hand-edit via /admin/ or the JSON.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitePath = join(root, "content", "site.json");
const outPath = join(root, "index.html");

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isExternal(href) {
  return /^https?:\/\//i.test(href);
}

function anchor(href, label) {
  const extra = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<a href="${esc(href)}"${extra}>${esc(label)}</a>`;
}

function linkList(links, sep = " ·\n    ") {
  return links.map((l) => anchor(l.href, l.label)).join(sep);
}

function renderExperience(items) {
  return items
    .map((e) => {
      const sub =
        e.links?.length > 0
          ? `\n    <p class="sub">${linkList(e.links, " · ")}</p>`
          : "";
      return `  <div class="entry">
    <h3>${esc(e.title)}</h3>
    <span class="date">· ${esc(e.date)}</span>${sub}
    <p>${esc(e.body)}</p>
  </div>`;
    })
    .join("\n\n");
}

function renderProjects(items) {
  return items
    .map((p) => {
      const date = p.link?.href
        ? `· ${anchor(p.link.href, p.link.label)}`
        : p.link?.label
          ? `· ${esc(p.link.label)}`
          : "";
      return `  <div class="entry">
    <h3>${esc(p.title)}</h3>
    <span class="date">${date}</span>
    <p>${esc(p.body)}</p>
  </div>`;
    })
    .join("\n\n");
}

function renderWriting(writing) {
  const items = (writing.items ?? [])
    .map(
      (w) => `    <li>
      ${anchor(w.url, w.title)}
      <span class="date">· ${esc(w.date)}</span>
      <span class="about">${esc(w.about)}</span>
    </li>`
    )
    .join("\n");
  const more = writing.more?.href
    ? `\n  <p class="more">${anchor(writing.more.href, writing.more.label)}</p>`
    : "";
  return `  <ul class="notes">
${items}
  </ul>${more}`;
}

function renderHackathons(items) {
  return items
    .map((h) => {
      let about = esc(h.about);
      if (h.link?.href) {
        about = `${anchor(h.link.href, h.link.label)} —\n        ${about}`;
      }
      return `    <li>
      <strong>${esc(h.name)}</strong>
      <span class="date">· ${esc(h.date)}</span>
      <span class="about">${about}</span>
    </li>`;
    })
    .join("\n");
}

function renderEducation(items) {
  return items
    .map((e) => {
      const sub = e.sub?.trim()
        ? `\n    <p class="sub">${esc(e.sub)}</p>`
        : "";
      return `  <div class="entry">
    <h3>${esc(e.title)}</h3>
    <span class="date">· ${esc(e.date)}</span>
    <p>${esc(e.body)}</p>${sub}
  </div>`;
    })
    .join("\n\n");
}

export function renderHome(site) {
  const { meta, header, experience, projects, writing, hackathons, education, footer } = site;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <link rel="canonical" href="${esc(meta.canonical)}">
  <meta property="og:title" content="${esc(meta.title)}">
  <meta property="og:description" content="${esc(meta.ogDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(meta.canonical)}">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..600&display=swap">
  <link rel="stylesheet" href="styles.css">
</head>
<body>

<header>
  <h1>${esc(header.name)}</h1>
  <p>${esc(header.blurb)}</p>
  <p class="links">
    ${linkList(header.links)}
  </p>
${header.invite?.href ? `  <p class="invite">${esc(header.invite.lead)} ${anchor(header.invite.href, `${header.invite.label} →`)}</p>\n` : ""}</header>

<main>

<section aria-labelledby="education">
  <h2 id="education">Education</h2>

${renderEducation(education)}
</section>

<section aria-labelledby="experience">
  <h2 id="experience">Experience</h2>

${renderExperience(experience)}
</section>

<section aria-labelledby="projects">
  <h2 id="projects">Projects</h2>

${renderProjects(projects)}
</section>

<section aria-labelledby="writing">
  <h2 id="writing">Writing</h2>

${renderWriting(writing)}
</section>

<section aria-labelledby="hackathons">
  <h2 id="hackathons">Hackathons</h2>

  <ul class="notes">
${renderHackathons(hackathons)}
  </ul>
</section>

</main>

<footer>
  <p>${esc(footer.line)}</p>
  <p>
    ${linkList(footer.links)}
  </p>
</footer>

</body>
</html>
`;
}

export function buildHome() {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  writeFileSync(outPath, renderHome(site));
  return outPath;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  buildHome();
  console.log(`wrote ${outPath}`);
}
