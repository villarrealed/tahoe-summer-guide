const CSV_URL = "data/events.csv";
const TODAY = new Date("2026-07-07T00:00:00");
const MONTH_END = new Date("2026-07-31T23:59:59");

const state = {
  events: [],
  activeWeek: 0,
  filters: new Set(),
  userLocation: null,
};

const venueCoordinates = [
  [/alibi ale works|alibi amphitheater/i, 39.2497, -119.9521],
  [/boatworks|tahoe wine collective/i, 39.1709, -120.1426],
  [/commons beach|tahoe gal|various venues, tahoe city/i, 39.1678, -120.1427],
  [/crystal bay club/i, 39.2274, -120.0057],
  [/donner memorial state park/i, 39.3256, -120.2328],
  [/donner summit/i, 39.3166, -120.3269],
  [/emerald bay state park/i, 38.9546, -120.1108],
  [/highlands community center/i, 39.1863, -120.1249],
  [/historic downtown truckee/i, 39.3278, -120.1833],
  [/kings beach state recreation area/i, 39.2374, -120.0262],
  [/north tahoe hebrew congregation/i, 39.2503, -119.9517],
  [/north tahoe regional park/i, 39.2414, -120.0509],
  [/northstar california/i, 39.2746, -120.1202],
  [/palisades|aerial tram|high camp|village at palisades/i, 39.1969, -120.2357],
  [/pizza on the hill|lodge pavilion at tahoe donner/i, 39.3538, -120.2422],
  [/private residence, incline village|various venues, incline village/i, 39.2497, -119.9521],
  [/savoie/i, 39.1697, -120.1468],
  [/sugar pine point state park/i, 39.0493, -120.1154],
  [/tahoe national brewing/i, 39.3258, -120.1834],
  [/tahoe vista recreation area/i, 39.2428, -120.0519],
  [/truckee regional park/i, 39.3269, -120.1687],
  [/university of nevada reno at lake tahoe/i, 39.2469, -119.9399],
  [/west end beach/i, 39.3182, -120.2829],
  [/william b\. layton park/i, 39.1719, -120.1394],
];

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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeEvent(row, id) {
  const date = eventDate(row);
  return {
    id: `${date.toISOString().slice(0, 10)}-${slugify(row["Event Name"])}`,
    date,
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

function mapUrlForEvent(event) {
  const query = `${event.location}, Lake Tahoe, CA`;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function eventUrl(eventId) {
  const url = new URL(window.location.href);
  url.searchParams.set("event", eventId);
  url.hash = "";
  return url.toString();
}

function setEventUrl(eventId) {
  window.history.replaceState(null, "", eventUrl(eventId));
}

function clearEventUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("event");
  window.history.replaceState(null, "", url.toString());
}

function coordinatesForEvent(event) {
  const match = venueCoordinates.find(([pattern]) => pattern.test(event.location));
  if (!match) return null;
  return { latitude: match[1], longitude: match[2] };
}

function milesBetween(start, end) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function distanceTextForEvent(event) {
  const eventCoordinates = coordinatesForEvent(event);
  if (!eventCoordinates) return "Venue distance unavailable";
  if (!state.userLocation) {
    return `<button class="distance-button" type="button" data-use-location="${event.id}">Use my location</button>`;
  }

  const miles = milesBetween(state.userLocation, eventCoordinates);
  const rounded = miles < 10 ? miles.toFixed(1) : Math.round(miles).toString();
  return `About ${rounded} mi away`;
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

function weekIndexForEvent(event) {
  const index = weeks.findIndex((week) => event.date >= week.start && event.date <= week.end);
  return index === -1 ? state.activeWeek : index;
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

function isReservation(event) {
  return /reservation/i.test(`${event.name} ${event.category} ${event.cost} ${event.context}`);
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
  const reservation = isReservation(event);
  const reservationBadge = reservation ? `<span class="reservation-badge">Reservation</span>` : "";

  return `
    <button class="event-row${reservation ? " reservation-event" : ""}" type="button" data-event-id="${event.id}">
      <time class="event-time">${splitTime(escapeHtml(event.time))}</time>
      <span class="event-copy">
        ${reservationBadge}
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

function openEventDetail(eventId, options = {}) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  if (options.updateUrl !== false) setEventUrl(eventId);
  eventList.hidden = true;
  mapView.hidden = true;
  eventDetail.hidden = false;
  const reservation = isReservation(event);
  eventDetail.innerHTML = `
    <button class="back-button" type="button" data-back-to-events>← Back to events</button>
    <article class="detail-card${reservation ? " reservation-detail" : ""}">
      <div class="detail-hero">
        <img src="${imageForEvent(event)}" alt="" />
      </div>
      <div class="detail-body">
        ${reservation ? `<div class="reservation-callout">Reserved plan</div>` : ""}
        <span class="category-tag ${categoryTone(event.category)}">${escapeHtml(shortCategory(event.category))}</span>
        <h2 class="detail-title">${escapeHtml(event.name)}</h2>
        <button class="share-event-button" type="button" data-share-event="${event.id}">
          <span>Share event</span>
        </button>
        <p class="share-status" data-share-status aria-live="polite"></p>
        <ul class="detail-meta">
          <li><strong>Date</strong><span>${formatDay(event.date)}</span></li>
          <li><strong>Time</strong><span>${escapeHtml(compactTime(event.time))}</span></li>
          <li><strong>Place</strong><span>${escapeHtml(event.location)}</span></li>
          <li><strong>Kids</strong><span>${escapeHtml(event.kid)}</span></li>
          <li><strong>Activity</strong><span>${escapeHtml(event.physical)}</span></li>
          <li><strong>Cost</strong><span>${escapeHtml(event.cost)}</span></li>
          <li><strong>Drinks</strong><span>${escapeHtml(alcoholLabel(event.alcohol))}</span></li>
          <li><strong>Distance</strong><span class="distance-value" data-distance-value>${distanceTextForEvent(event)}</span></li>
        </ul>
        <p class="detail-context">${escapeHtml(event.context)}</p>
        <div class="detail-map" aria-label="Map for ${escapeHtml(event.location)}">
          <iframe
            title="Map for ${escapeHtml(event.name)}"
            src="${mapUrlForEvent(event)}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>
        <a class="source-button" href="${event.link}" target="_blank" rel="noreferrer">Open website</a>
      </div>
    </article>
  `;
  if (options.scroll !== false) {
    requestAnimationFrame(() => {
      eventDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

async function shareEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  const status = eventDetail.querySelector("[data-share-status]");
  if (!event) return;

  const link = eventUrl(eventId);
  const shareData = {
    title: event.name,
    text: `${event.name} | ${formatDay(event.date)} at ${compactTime(event.time)} | ${event.location}`,
    url: link,
  };

  if (!navigator.share) {
    if (status) status.textContent = `Sharing unavailable. Link: ${link}`;
    return;
  }

  try {
    await navigator.share(shareData);
    if (status) status.textContent = "Ready to share";
  } catch (error) {
    if (error.name !== "AbortError" && status) {
      status.textContent = `Sharing unavailable. Link: ${link}`;
    }
  }
}

function openLinkedEvent() {
  const eventId = new URLSearchParams(window.location.search).get("event");
  const linkedEvent = state.events.find((event) => event.id === eventId);
  if (!linkedEvent) return false;
  state.activeWeek = weekIndexForEvent(linkedEvent);
  renderWeeks();
  openEventDetail(eventId, { updateUrl: false, scroll: false });
  requestAnimationFrame(() => {
    eventDetail.scrollIntoView({ block: "start" });
  });
  return true;
}

function setDistanceStatus(message) {
  const distanceValue = eventDetail.querySelector("[data-distance-value]");
  if (distanceValue) distanceValue.textContent = message;
}

function useLocationForDistance(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  if (!("geolocation" in navigator)) {
    setDistanceStatus("Location is not available on this device");
    return;
  }

  setDistanceStatus("Checking your location...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setDistanceStatus(distanceTextForEvent(event));
    },
    () => {
      setDistanceStatus("Location permission needed");
    },
    { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
  );
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
    clearEventUrl();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  eventList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-id]");
    if (!button) return;
    openEventDetail(button.dataset.eventId);
  });

  eventDetail.addEventListener("click", (event) => {
    const shareButton = event.target.closest("[data-share-event]");
    if (shareButton) {
      shareEvent(shareButton.dataset.shareEvent);
      return;
    }

    const distanceButton = event.target.closest("[data-use-location]");
    if (distanceButton) {
      useLocationForDistance(distanceButton.dataset.useLocation);
      return;
    }

    if (!event.target.closest("[data-back-to-events]")) return;
    clearEventUrl();
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
      clearEventUrl();
      renderEvents();
    });
  });

  document.querySelector(".filter-settings").addEventListener("click", () => {
    state.filters.clear();
    document.querySelectorAll(".filter-chip").forEach((button) => button.classList.remove("active"));
    clearEventUrl();
    renderEvents();
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
    openLinkedEvent();
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
