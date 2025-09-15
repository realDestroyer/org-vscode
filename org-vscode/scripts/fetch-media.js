// Downloads official FullCalendar and Moment minified assets into the extension media folder.
// This avoids committing third-party minified code while enabling offline webviews.

const fs = require('fs');
const path = require('path');
const https = require('https');

const mediaDir = path.join(__dirname, '..', 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

const assets = [
  {
    url: 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css',
    file: 'fullcalendar.min.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js',
    file: 'fullcalendar.min.js'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js',
    file: 'moment.min.js'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(dest, () => {}));
        return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      file.close(() => fs.unlink(dest, () => {}));
      reject(err);
    });
  });
}

(async () => {
  for (const a of assets) {
    const dest = path.join(mediaDir, a.file);
    try {
      // Skip if already present and non-empty
      if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
        continue;
      }
      await download(a.url, dest);
    } catch (e) {
      // Non-fatal; webview will fallback to CDN
      // eslint-disable-next-line no-console
      console.warn(`Media fetch warning for ${a.file}: ${e.message}`);
    }
  }
})();
