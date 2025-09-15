Place bundled web assets here for use in webviews.
These are fetched automatically on `npm install` via `scripts/fetch-media.js`.
Expected filenames used by calendar/tagged agenda views:
- fullcalendar.min.css
- fullcalendar.min.js
- moment.min.js

If these files are not present, the webviews will attempt a CDN fallback.
You can also fetch them manually: `npm run fetch-media`.
