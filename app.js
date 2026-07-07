const CSV_URL = "data/events.csv";
const TODAY = new Date("2026-07-07T00:00:00");
const MONTH_END = new Date("2026-07-31T23:59:59");

const state = {
  events: [],
  activeWeek: 0,
  filters: new Set(),
  view: "week",
};

const weeks = [
  {
    key: "current",
    label: "This week",
    range: "Jul 7-12",
    start: new Date("2026-07-07T00:00:00"),
    end: new Date("2026-07-12T23:59:59"),
  },
  {
    key: "next",
    label: "Next week",
    range: "Jul 13-19",
    start: new Date("2026-07-13T00:00:00"),
    end: new Date("2026-07-19T23:59:59"),
  },
  {
    key: "later",
    label: "Later July",
    range: "Jul 20-31",
    start: new Date("2026-07-20T00:00:00"),
    end: MONTH_END,
  },
];

const weekTabs = document.getElementById("weekTabs");
const eventList = document.getElementById("eventList");
const mapView = document.getElementById("mapView");
const dateContext = document.getElementById("dateContext");

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

function eventDate(row) {
  return new Date(`${row.Date.replace(/^[^,]+, /, "")} 00:00:00`);
}

function normalizeEvent(row) {
  return {
    date: eventDate(row),
    name: row["Event Name"],
    location: row.Location,
    time: row.Time,
    link: row.Link,
    category: row.Category,
    kid: row["Kid Friendly"],
    physical: row["Physical Activity"],
    alcohol: row["Alcohol Served/Likely"],
    cost: row["Cost / Ticketing"],
    context: row["Planning Context"],
  };
}

function formatDay(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function compactTime(time) {
  return time
    .replace(/\s-\s/g, " — ")
    .replace("See source schedule", "See source")
    .replace("8:00 PM / dusk", "Dusk");
}

function splitTime(time) {
  const clean = compactTime(time);
  if (!clean.includes(" — ")) return clean;
  return clean.replace(" — ", "<span></span>");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function passesFilters(event) {
  if (state.filters.has("kid") && !/^yes|likely/i.test(event.kid)) return false;
  if (state.filters.has("free") && !/^free|likely free/i.test(event.cost)) return false;
  if (state.filters.has("active") && !/^yes/i.test(event.physical)) return false;
  if (state.filters.has("alcohol") && !/yes|available|beer|wine|drink|cocktail/i.test(event.alcohol)) return false;
  return true;
}

function weekEvents() {
  const week = weeks[state.activeWeek];
  return state.events.filter((event) => {
    return event.date >= week.start && event.date <= week.end && event.date >= TODAY && passesFilters(event);
  });
}

function groupByDay(events) {
  return events.reduce((groups, event) => {
    const key = event.date.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
    return groups;
  }, new Map());
}

function costLabel(cost) {
  if (/free/i.test(cost)) return `Free: ${cost}`;
  if (/ticket|paid|registration|reservation/i.test(cost)) return `Cost: ${cost}`;
  return `Cost: ${cost}`;
}

function alcoholLabel(alcohol) {
  if (/no \/ not central/i.test(alcohol)) return "No alcohol focus";
  if (/unknown/i.test(alcohol)) return "Drinks unknown";
  return alcohol;
}

function shortCategory(category) {
  if (/market/i.test(category)) return "Market";
  if (/outdoor|sports|race|recreation/i.test(category)) return "Outdoors";
  if (/music|concert|festival|brewery/i.test(category)) return "Music";
  if (/food|drink|wine|beer|brew/i.test(category)) return "Food";
  if (/dance|arts|movie|theater|spoken/i.test(category)) return "Arts";
  if (/educational|cultural|park/i.test(category)) return "Culture";
  return category.split("/")[0].trim();
}

function categoryTone(category) {
  if (/market/i.test(category)) return "market";
  if (/outdoor|sports|race|recreation/i.test(category)) return "outdoors";
  if (/food|drink|wine|beer|brew/i.test(category)) return "food";
  if (/music|concert|festival/i.test(category)) return "music";
  return "culture";
}

function imageForEvent(event) {
  const text = `${event.name} ${event.category} ${event.physical} ${event.alcohol}`.toLowerCase();
  if (/kayak|swim|water|beach|paddl/.test(text)) return "assets/events/kayak.png";
  if (/market|farmers|shopping/.test(text)) return "assets/events/market.png";
  if (/beer|brew|wine|drink|food/.test(text)) return "assets/events/drinks.png";
  if (/run|triathlon|trail|hike|outdoor|active|race/.test(text)) return "assets/events/hike.png";
  return "assets/events/concert.png";
}

function eventIcons(event) {
  const icons = [];
  if (/yes|likely|spectator/i.test(event.kid)) icons.push(["👥", "Kid friendly"]);
  if (/yes|paddling|strenuous|walking/i.test(event.physical)) icons.push(["🥾", "Physical"]);
  if (/free|likely free/i.test(event.cost)) icons.push(["🏷", "Free"]);
  else if (/ticket|paid|registration|reservation/i.test(event.cost)) icons.push(["$$", "Cost"]);
  if (/yes|available|beer|wine|drink|cocktail/i.test(event.alcohol)) icons.push(["🍷", "Alcohol likely"]);
  return icons.slice(0, 4);
}

function renderWeeks() {
  weekTabs.innerHTML = weeks
    .map((week, index) => {
      const active = index === state.activeWeek ? " active" : "";
      return `
        <button class="week-tab${active}" type="button" data-week="${index}">
          <strong>${week.label}</strong>
          <span>${week.range}</span>
        </button>
      `;
    })
    .join("");

}

function renderMap(events) {
  const areas = [
    ["Tahoe City", /tahoe city|commons beach|boatworks|layton/i],
    ["Palisades", /palisades|village at palisades/i],
    ["Truckee", /truckee|donner|tahoe donner/i],
    ["Kings Beach / North Shore", /kings beach|northstar|incline|crystal bay|tahoe vista/i],
  ];

  mapView.innerHTML = `
    <section class="map-card">
      <div class="map-visual" aria-hidden="true">
        <span class="pin pin-a"></span>
        <span class="pin pin-b"></span>
        <span class="pin pin-c"></span>
        <span class="pin pin-d"></span>
      </div>
      <div class="map-list">
        ${areas
          .map(([label, pattern]) => {
            const count = events.filter((event) => pattern.test(event.location)).length;
            return `<button type="button" class="map-area"><strong>${label}</strong><span>${count} upcoming</span></button>`;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderEvents() {
  const events = weekEvents();
  const week = weeks[state.activeWeek];

  dateContext.textContent = `▣ ${week.range}, 2026`;
  renderMap(events);
  eventList.hidden = state.view === "map";
  mapView.hidden = state.view !== "map";

  if (!events.length) {
    eventList.innerHTML = `
      <div class="empty-state">
        No events match this week and filter mix. Try clearing a filter or jumping to a later week.
      </div>
    `;
    return;
  }

  const groups = groupByDay(events);
  eventList.innerHTML = [...groups.entries()]
    .map(([, dayEvents]) => {
      const day = dayEvents[0].date;
      const rows = dayEvents
        .map((event) => {
          const icons = eventIcons(event)
            .map(([icon, label]) => `<span class="meta-icon" title="${label}">${icon}</span>`)
            .join("");
          return `
            <article class="event-row">
              <time class="event-time">${splitTime(escapeHtml(event.time))}</time>
              <div class="event-copy">
                <h3 class="event-title">${escapeHtml(event.name)}</h3>
                <p class="event-location">
                  <span class="pin-icon">●</span>${escapeHtml(event.location)}
                </p>
                <span class="category-tag ${categoryTone(event.category)}">${escapeHtml(shortCategory(event.category))}</span>
                <div class="fact-row" aria-label="Planning details">
                  ${icons}
                  <span class="sr-only">${escapeHtml(event.kid)}. ${escapeHtml(event.physical)}. ${escapeHtml(alcoholLabel(event.alcohol))}. ${escapeHtml(costLabel(event.cost))}.</span>
                </div>
              </div>
              <a class="event-media" href="${event.link}" target="_blank" rel="noreferrer" aria-label="Open source details for ${escapeHtml(event.name)}">
                <img src="${imageForEvent(event)}" alt="" loading="lazy" />
              </a>
              <a class="row-arrow" href="${event.link}" target="_blank" rel="noreferrer" aria-label="Open source details">›</a>
            </article>
          `;
        })
        .join("");

      return `
        <section class="day-group">
          <div class="day-heading">
            <h2>${formatDay(day)}</h2>
          </div>
          <div class="day-card">
            ${rows}
          </div>
        </section>
      `;
    })
    .join("");
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".bottom-nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "filters") {
    document.querySelector(".filters").scrollIntoView({ behavior: "smooth", block: "start" });
    state.view = "week";
    document.querySelector('[data-view="week"]').classList.add("active");
    document.querySelector('[data-view="filters"]').classList.remove("active");
    return;
  }
  renderEvents();
}

function render() {
  renderWeeks();
  renderEvents();
}

function bindControls() {
  weekTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-week]");
    if (!button) return;
    state.activeWeek = Number(button.dataset.week);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      if (state.filters.has(filter)) {
        state.filters.delete(filter);
      } else {
        state.filters.add(filter);
      }
      button.classList.toggle("active", state.filters.has(filter));
      renderEvents();
    });
  });

  document.querySelectorAll(".bottom-nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelector(".filter-settings").addEventListener("click", () => {
    state.filters.clear();
    document.querySelectorAll(".filter-chip").forEach((button) => button.classList.remove("active"));
    renderEvents();
  });

  document.querySelector(".search-button").addEventListener("click", () => {
    const query = window.prompt("Search this week");
    if (!query) return;
    const week = weeks[state.activeWeek];
    const matches = state.events.filter((event) => {
      const haystack = `${event.name} ${event.location} ${event.category}`.toLowerCase();
      return event.date >= week.start && event.date <= week.end && haystack.includes(query.toLowerCase());
    });
    state.view = "week";
    eventList.hidden = false;
    mapView.hidden = true;
    if (!matches.length) {
      eventList.innerHTML = `<div class="empty-state">No matches for "${escapeHtml(query)}" this week.</div>`;
      return;
    }
    const previousFilters = new Set(state.filters);
    state.filters.clear();
    eventList.innerHTML = "";
    const groups = groupByDay(matches);
    eventList.innerHTML = [...groups.entries()]
      .map(([, dayEvents]) => {
        const day = dayEvents[0].date;
        return `
          <section class="day-group">
            <div class="day-heading"><h2>${formatDay(day)}</h2></div>
            <div class="day-card">
              ${dayEvents
                .map((event) => {
                  const icons = eventIcons(event)
                    .map(([icon, label]) => `<span class="meta-icon" title="${label}">${icon}</span>`)
                    .join("");
                  return `
                    <article class="event-row">
                      <time class="event-time">${splitTime(escapeHtml(event.time))}</time>
                      <div class="event-copy">
                        <h3 class="event-title">${escapeHtml(event.name)}</h3>
                        <p class="event-location"><span class="pin-icon">●</span>${escapeHtml(event.location)}</p>
                        <span class="category-tag ${categoryTone(event.category)}">${escapeHtml(shortCategory(event.category))}</span>
                        <div class="fact-row">${icons}</div>
                      </div>
                      <a class="event-media" href="${event.link}" target="_blank" rel="noreferrer"><img src="${imageForEvent(event)}" alt="" loading="lazy" /></a>
                      <a class="row-arrow" href="${event.link}" target="_blank" rel="noreferrer" aria-label="Open source details">›</a>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");
    state.filters = previousFilters;
  });
}

async function init() {
  try {
    const response = await fetch(CSV_URL);
    const csv = await response.text();
    state.events = parseCsv(csv)
      .map(normalizeEvent)
      .filter((event) => event.date >= TODAY && event.date <= MONTH_END)
      .sort((a, b) => a.date - b.date || a.time.localeCompare(b.time) || a.name.localeCompare(b.name));

    bindControls();
    render();
  } catch (error) {
    eventList.innerHTML = `
      <div class="empty-state">
        The event data could not be loaded. Please try again from the local web server.
      </div>
    `;
    console.error(error);
  }
}

init();
