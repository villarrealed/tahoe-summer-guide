# Tahoe Summer Guide

Mobile-first event guide for Tahoe City / North Lake Tahoe July 2026 events.

## Run locally

```sh
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

## Project layout

- `index.html` - app shell
- `styles.css` - visual design and responsive layout
- `app.js` - CSV parsing, week navigation, filters, map view, and rendering
- `data/events.csv` - enriched July 2026 event data
- `assets/events/` - event thumbnail images

The app filters out events before July 7, 2026 and groups upcoming events into `This week`, `Next week`, and `Later July`.
