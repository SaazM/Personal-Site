// Local homepage editor. Loads/saves content/site.json via the dev server.

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");

let site = null;
let dirty = false;

function setStatus(msg, kind = "") {
  statusEl.textContent = msg;
  statusEl.className = kind;
}

function markDirty() {
  dirty = true;
  if (!statusEl.classList.contains("err")) setStatus("unsaved changes");
}

function field(label, value, { multiline = false, onInput } = {}) {
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.textContent = label;
  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  if (!multiline) input.type = "text";
  input.value = value ?? "";
  input.addEventListener("input", () => {
    onInput(input.value);
    markDirty();
  });
  wrap.append(lab, input);
  return wrap;
}

function linksEditor(links, onChange) {
  const box = document.createElement("div");
  const lab = document.createElement("label");
  lab.textContent = "Links (label | url, one per line)";
  const ta = document.createElement("textarea");
  ta.value = (links ?? []).map((l) => `${l.label} | ${l.href}`).join("\n");
  ta.addEventListener("input", () => {
    const next = ta.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("|");
        if (i === -1) return { label: line, href: "" };
        return { label: line.slice(0, i).trim(), href: line.slice(i + 1).trim() };
      });
    onChange(next);
    markDirty();
  });
  box.append(lab, ta);
  return box;
}

function optionalLinkEditor(link, onChange) {
  const box = document.createElement("div");
  box.className = "row2";
  let label = link?.label ?? "";
  let href = link?.href ?? "";
  const emit = () => onChange(label || href ? { label, href } : null);
  box.append(
    field("Link label", label, {
      onInput: (v) => {
        label = v;
        emit();
      },
    }),
    field("Link url", href, {
      onInput: (v) => {
        href = v;
        emit();
      },
    })
  );
  return box;
}

function makeCard({ sortable, onRemove, buildFields }) {
  const card = document.createElement("div");
  card.className = "card";
  if (sortable) card.draggable = true;

  const bar = document.createElement("div");
  bar.className = "card-bar";

  if (sortable) {
    const handle = document.createElement("span");
    handle.className = "handle";
    handle.title = "Drag to reorder";
    handle.textContent = "⋮⋮";
    handle.setAttribute("aria-hidden", "true");
    bar.append(handle);
  }

  const spacer = document.createElement("span");
  spacer.className = "spacer";
  bar.append(spacer);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "danger";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    onRemove();
    markDirty();
    render();
  });
  bar.append(del);
  card.append(bar);
  buildFields(card);
  return card;
}

function bindSortable(listEl, items, renderFn) {
  let dragFrom = null;

  listEl.querySelectorAll(".card").forEach((card, index) => {
    card.addEventListener("dragstart", (e) => {
      dragFrom = index;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      listEl.querySelectorAll(".card").forEach((c) => c.classList.remove("drag-over"));
      dragFrom = null;
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const from = dragFrom ?? Number(e.dataTransfer.getData("text/plain"));
      const to = index;
      if (Number.isNaN(from) || from === to) return;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      markDirty();
      renderFn();
    });
  });
}

function section(title, { onAdd, listBuilder }) {
  const block = document.createElement("section");
  block.className = "section-block";

  const head = document.createElement("div");
  head.className = "section-head";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  head.append(h2);

  if (onAdd) {
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add";
    add.addEventListener("click", () => {
      onAdd();
      markDirty();
      render();
    });
    head.append(add);
  }

  block.append(head);
  const list = document.createElement("div");
  listBuilder(list);
  block.append(list);
  return block;
}

function render() {
  if (!site) return;
  app.replaceChildren();

  // Header
  {
    const block = document.createElement("section");
    block.className = "section-block";
    const head = document.createElement("div");
    head.className = "section-head";
    const h2 = document.createElement("h2");
    h2.textContent = "Header";
    head.append(h2);
    block.append(head);

    const card = document.createElement("div");
    card.className = "card";
    card.append(
      field("Name", site.header.name, {
        onInput: (v) => {
          site.header.name = v;
          site.meta.title = v;
        },
      }),
      field("Blurb", site.header.blurb, {
        multiline: true,
        onInput: (v) => {
          site.header.blurb = v;
          site.meta.description = v;
          site.meta.ogDescription = v.split(".")[0] + ".";
        },
      }),
      linksEditor(site.header.links, (v) => {
        site.header.links = v;
      }),
      field("Invite lead", site.header.invite?.lead ?? "", {
        onInput: (v) => {
          site.header.invite = site.header.invite || { lead: "", label: "", href: "" };
          site.header.invite.lead = v;
        },
      }),
      field("Invite label", site.header.invite?.label ?? "", {
        onInput: (v) => {
          site.header.invite = site.header.invite || { lead: "", label: "", href: "" };
          site.header.invite.label = v;
        },
      }),
      field("Invite href", site.header.invite?.href ?? "", {
        onInput: (v) => {
          site.header.invite = site.header.invite || { lead: "", label: "", href: "" };
          site.header.invite.href = v;
        },
      })
    );
    block.append(card);
    app.append(block);
  }

  // Education (homepage order: first after header)
  app.append(
    section("Education", {
      onAdd: () =>
        site.education.push({ title: "New school", date: "", body: "", sub: "" }),
      listBuilder: (list) => {
        site.education.forEach((item, i) => {
          list.append(
            makeCard({
              sortable: true,
              onRemove: () => site.education.splice(i, 1),
              buildFields: (card) => {
                card.append(
                  field("Title", item.title, { onInput: (v) => (item.title = v) }),
                  field("Date", item.date, { onInput: (v) => (item.date = v) }),
                  field("Body", item.body, {
                    multiline: true,
                    onInput: (v) => (item.body = v),
                  }),
                  field("Sub line", item.sub ?? "", {
                    multiline: true,
                    onInput: (v) => (item.sub = v),
                  })
                );
              },
            })
          );
        });
        bindSortable(list, site.education, render);
      },
    })
  );

  // Experience
  app.append(
    section("Experience", {
      onAdd: () =>
        site.experience.push({ title: "New role", date: "", links: [], body: "" }),
      listBuilder: (list) => {
        site.experience.forEach((item, i) => {
          list.append(
            makeCard({
              sortable: true,
              onRemove: () => site.experience.splice(i, 1),
              buildFields: (card) => {
                card.append(
                  field("Title", item.title, { onInput: (v) => (item.title = v) }),
                  field("Date", item.date, { onInput: (v) => (item.date = v) }),
                  linksEditor(item.links, (v) => (item.links = v)),
                  field("Body", item.body, {
                    multiline: true,
                    onInput: (v) => (item.body = v),
                  })
                );
              },
            })
          );
        });
        bindSortable(list, site.experience, render);
      },
    })
  );

  // Projects
  app.append(
    section("Projects", {
      onAdd: () =>
        site.projects.push({
          title: "New project",
          link: { label: "", href: "" },
          body: "",
        }),
      listBuilder: (list) => {
        site.projects.forEach((item, i) => {
          list.append(
            makeCard({
              sortable: true,
              onRemove: () => site.projects.splice(i, 1),
              buildFields: (card) => {
                card.append(
                  field("Title", item.title, { onInput: (v) => (item.title = v) }),
                  optionalLinkEditor(item.link, (v) => (item.link = v)),
                  field("Body", item.body, {
                    multiline: true,
                    onInput: (v) => (item.body = v),
                  })
                );
              },
            })
          );
        });
        bindSortable(list, site.projects, render);
      },
    })
  );

  // Writing
  app.append(
    section("Writing", {
      onAdd: () =>
        site.writing.items.push({ title: "New post", url: "", date: "", about: "" }),
      listBuilder: (list) => {
        site.writing.items.forEach((item, i) => {
          list.append(
            makeCard({
              sortable: true,
              onRemove: () => site.writing.items.splice(i, 1),
              buildFields: (card) => {
                card.append(
                  field("Title", item.title, { onInput: (v) => (item.title = v) }),
                  field("URL", item.url, { onInput: (v) => (item.url = v) }),
                  field("Date", item.date, { onInput: (v) => (item.date = v) }),
                  field("About", item.about, {
                    multiline: true,
                    onInput: (v) => (item.about = v),
                  })
                );
              },
            })
          );
        });
        bindSortable(list, site.writing.items, render);

        const more = document.createElement("div");
        more.className = "card";
        more.append(
          field("More link label", (site.writing.more && site.writing.more.label) || "", {
            onInput: (v) => {
              if (!site.writing.more) site.writing.more = { label: "", href: "" };
              site.writing.more.label = v;
            },
          }),
          field("More link url", (site.writing.more && site.writing.more.href) || "", {
            onInput: (v) => {
              if (!site.writing.more) site.writing.more = { label: "", href: "" };
              site.writing.more.href = v;
            },
          })
        );
        list.append(more);
      },
    })
  );

  // Hackathons
  app.append(
    section("Hackathons", {
      onAdd: () =>
        site.hackathons.push({ name: "New hackathon", date: "", link: null, about: "" }),
      listBuilder: (list) => {
        site.hackathons.forEach((item, i) => {
          list.append(
            makeCard({
              sortable: true,
              onRemove: () => site.hackathons.splice(i, 1),
              buildFields: (card) => {
                card.append(
                  field("Name", item.name, { onInput: (v) => (item.name = v) }),
                  field("Date", item.date, { onInput: (v) => (item.date = v) }),
                  optionalLinkEditor(item.link, (v) => (item.link = v)),
                  field("About", item.about, {
                    multiline: true,
                    onInput: (v) => (item.about = v),
                  })
                );
              },
            })
          );
        });
        bindSortable(list, site.hackathons, render);
      },
    })
  );

  // Footer
  {
    const block = document.createElement("section");
    block.className = "section-block";
    const head = document.createElement("div");
    head.className = "section-head";
    const h2 = document.createElement("h2");
    h2.textContent = "Footer";
    head.append(h2);
    block.append(head);
    const card = document.createElement("div");
    card.className = "card";
    card.append(
      field("Line", site.footer.line, { onInput: (v) => (site.footer.line = v) }),
      linksEditor(site.footer.links, (v) => (site.footer.links = v))
    );
    block.append(card);
    app.append(block);
  }
}

function validate(data) {
  if (!data || typeof data !== "object") return "body must be a JSON object";
  for (const key of ["meta", "header", "writing", "footer"]) {
    if (!data[key] || typeof data[key] !== "object") return `missing ${key}`;
  }
  for (const key of ["experience", "projects", "hackathons", "education"]) {
    if (!Array.isArray(data[key])) return `${key} must be an array`;
  }
  if (!Array.isArray(data.writing.items)) return "writing.items must be an array";
  return null;
}

function fetchWithTimeout(url, ms = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: "no-store", signal: ctrl.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function fetchSite() {
  // Static JSON first — always served by the file server. /api/content is
  // only needed for save; trying it first used to hang forever when a proxy
  // or stale preview swallowed the request (no timeout → no fallback).
  const urls = ["/content/site.json", "/api/content"];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        lastErr = new Error(`${url}: ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr =
        e?.name === "AbortError"
          ? new Error(`${url}: timed out`)
          : e;
    }
  }
  throw lastErr || new Error("failed to load content");
}

function normalize(data) {
  data.meta = data.meta || {};
  data.header = data.header || { name: "", blurb: "", links: [] };
  data.header.links = data.header.links || [];
  data.header.invite = data.header.invite || { lead: "", label: "", href: "" };
  data.experience = data.experience || [];
  data.projects = data.projects || [];
  data.hackathons = data.hackathons || [];
  data.education = data.education || [];
  data.writing = data.writing || { items: [], more: { label: "", href: "" } };
  data.writing.items = data.writing.items || [];
  data.footer = data.footer || { line: "", links: [] };
  data.footer.links = data.footer.links || [];
  return data;
}

async function load() {
  setStatus("loading…");
  app.textContent = "Loading…";
  try {
    site = normalize(await fetchSite());
    dirty = false;
    setStatus("");
    try {
      render();
    } catch (renderErr) {
      console.error(renderErr);
      throw new Error("render failed: " + (renderErr.message || renderErr));
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || "failed to load", "err");
    app.innerHTML =
      "Could not load content. Run <code>npm run dev</code> and open " +
      '<a href="http://localhost:3000/admin/">http://localhost:3000/admin/</a> ' +
      "(not a <code>file://</code> URL).";
  }
}

async function save() {
  if (!site) return;
  const err = validate(site);
  if (err) {
    setStatus(err, "err");
    return;
  }
  saveBtn.disabled = true;
  setStatus("saving…");
  try {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(site),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `${res.status}`);
    dirty = false;
    setStatus("saved", "ok");
  } catch (e) {
    setStatus(e.message || "save failed", "err");
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn.addEventListener("click", save);
addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

load();
