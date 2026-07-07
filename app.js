const CSV_URL = "data/events.csv";
const TODAY = new Date("2026-07-07T00:00:00");
const MONTH_END = new Date("2026-07-31T23:59:59");

const state = {
  events: [],
  activeWeek: 0,
  filters: new Set(),
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
const eventDetail = document.getElementById("eventDetail");
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

function normalizeEvent(row, id) {
  return {
    id: String(id),
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

function eventRowTemplate(event) {
  const icons = eventIcons(event)
    .map(([icon, label]) => `<span class="meta-icon" title="${label}">${icon}</span>`)
    .join("");

  return `
    <button class="event-row" type="button" data-event-id="${event.id}">
      <time class="event-time">${splitTime(escapeHtml(event.time))}</time>
      <span class="event-copy">
        <span class="event-title">${escapeHtml(event.name)}</span>
        <span class="event-location">
          <span class="pin-icon">●</span>${escapeHtml(event.location)}
        </span>
        <span class="category-tag ${categoryTone(event.category)}">${escapeHtml(shortCategory(event.category))}</span>
        <span class="fact-row" aria-label="Planning details">
          ${icons}
          <span class="sr-only">${escapeHtml(event.kid)}. ${escapeHtml(event.physical)}. ${escapeHtml(alcoholLabel(event.alcohol))}. ${escapeHtml(costLabel(event.cost))}.</span>
        </span>
      </span>
      <span class="event-media" aria-hidden="true">
        <img src="${imageForEvent(event)}" alt="" loading="lazy" />
      </span>
      <span class="row-arrow" aria-hidden="true">›</span>
    </button>
  `;
}

function renderEventGroups(events) {
  const groups = groupByDay(events);
  eventList.innerHTML = [...groups.entries()]
    .map(([, dayEvents]) => {
      const day = dayEvents[0].date;
      return `
        <section class="day-group">
          <div class="day-heading">
            <h2>${formatDay(day)}</h2>
          </div>
          <div class="day-card">
            ${dayEvents.map(eventRowTemplate).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderEvents() {
  const events = weekEvents();
  const week = weeks[state.activeWeek];

  dateContext.textContent = `▣ ${week.range}, 2026`;
  renderMap(events);
  eventList.hidden = false;
  mapView.hidden = true;
  eventDetail.hidden = true;

  if (!events.length) {
    eventList.innerHTML = `
      <div class="empty-state">
        No events match this week and filter mix. Try clearing a filter or jumping to a later week.
      </div>
    `;
    return;
  }

  renderEventGroups(events);
}

function openEventDetail(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  eventList.hidden = true;
  mapView.hidden = true;
  eventDetail.hidden = false;
  eventDetail.innerHTML = `
    <button class="back-button" type="button" data-back-to-events>← Back to events</button>
    <article class="detail-card">
      <div class="detail-hero">
        <img src="${imageForEvent(event)}" alt="" />
      </div>
      <div class="detail-body">
        <span class="category-tag ${categoryTone(event.category)}">${escapeHtml(shortCategory(event.category))}</span>
        <h2 class="detail-title">${escapeHtml(event.name)}</h2>
        <ul class="detail-meta">
          <li><strong>Date</strong><span>${formatDay(event.date)}</span></li>
          <li><strong>Time</strong><span>${escapeHtml(compactTime(event.time))}</span></li>
          <li><strong>Place</strong><span>${escapeHtml(event.location)}</span></li>
          <li><strong>Kids</strong><span>${escapeHtml(event.kid)}</span></li>
          <li><strong>Activity</strong><span>${escapeHtml(event.physical)}</span></li>
          <li><strong>Cost</strong><span>${escapeHtml(event.cost)}</span></li>
          <li><strong>Drinks</strong><span>${escapeHtml(alcoholLabel(event.alcohol))}</span></li>
        </ul>
        <p class="detail-context">${escapeHtml(event.context)}</p>
        <a class="source-button" href="${event.link}" target="_blank" rel="noreferrer">Open source details</a>
      </div>
    </article>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });
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

  eventList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-id]");
    if (!button) return;
    openEventDetail(button.dataset.eventId);
  });

  eventDetail.addEventListener("click", (event) => {
    if (!event.target.closest("[data-back-to-events]")) return;
    renderEvents();
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
    eventList.hidden = false;
    mapView.hidden = true;
    eventDetail.hidden = true;
    if (!matches.length) {
      eventList.innerHTML = `<div class="empty-state">No matches for "${escapeHtml(query)}" this week.</div>`;
      return;
    }
    renderEventGroups(matches);
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
