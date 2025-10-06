// calendar.js - Handles Calendar View for Org Mode (with full Unicode + keyword support)

const vscode = require("vscode");   // VSCode API access
const fs = require("fs");           // File system module to read/write org files
const path = require("path");       // For cross-platform path handling
const moment = require("moment");   // Date formatting library

let calendarPanel = null; // Keeps reference to the Webview panel (singleton instance)

// Generate a nonce for CSP
function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Retrieves the directory path where `.org` files are stored.
 * Falls back to ~/OrgFiles if no custom path is set in settings.
 */
function setMainDir() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" 
    ? folderPath 
    : path.join(require("os").homedir(), "OrgFiles");
}

/**
 * If the calendar view is already open, this forces a refresh by re-sending task data.
 * This is useful after making changes (e.g. keyword updates, reschedules).
 */
function refreshCalendarView() {
  if (calendarPanel) {
    sendTasksToCalendar(calendarPanel); // Resends all task data to the Webview
  }
}
/**
 * Reads all `.org` files and extracts scheduled tasks with valid status keywords.
 * Filters out `CurrentTasks.org`, parses metadata (date, tags, file), and sends task data to the calendar webview.
 */
function sendTasksToCalendar(panel) {
  let tasks = [];
  let dirPath = setMainDir();

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
      return;
    }

  files.forEach(file => {
      // Ignore non-.org files and the special CurrentTasks.org export file
      if (file.endsWith(".org") && file !== "CurrentTasks.org") {
        let filePath = path.join(dirPath, file);
        let content = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

        content.forEach((line, lineIndex) => {
          // Must be a scheduled task with a proper status keyword and start with a task symbol
          const scheduledMatch = line.match(/\bSCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/);
          const keywordMatch = line.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
          const startsWithSymbol = /^[⊙⊖⊘⊜⊗]/.test(line.trim()); 

          if (scheduledMatch && startsWithSymbol && keywordMatch) {
            // Extract inline tags if they exist: [+TAG:foo,bar]
            const tagMatch = line.match(/\[\+TAG:([^\]]+)\]/);
            const tags = tagMatch
              ? tagMatch[1].split(",").map(t => t.trim().toUpperCase())
              : [];

            const fullLine = line.trim();

            const cleanedText = fullLine
              .replace(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/, '') // Remove keyword
              .replace(/:?\s*\[\+TAG:[^\]]+\]\s*-?/, '')                  // Remove inline tag structure
              .replace(/SCHEDULED:.*/, '')                                     // Strip scheduled portion
              .replace(/[⊙⊖⊘⊜⊗]/g, '')                                         // Remove the leading Unicode symbol
              .trim();

            tasks.push({
              text: cleanedText, // For display in calendar
              fullText: fullLine, // For backend matching (reschedule logic)
              date: moment(scheduledMatch[1], "MM-DD-YYYY").format("YYYY-MM-DD"),
              file: file,
              tags: tags,
              id: file + '#' + lineIndex // stable id for rescheduling
            });
          }
        });
      }
    });

    // Send task data to calendar webview if the panel is open
    if (panel) {
      panel.webview.postMessage({ tasks });
    }
  });
}
/**
 * Updates a specific task's scheduled date inside the specified .org file.
 * Matches based on original task text and the old scheduled date.
 */
function rescheduleTask(file, oldDate, newDate, taskText) {
  let filePath = path.join(setMainDir(), file);
  let fileContents = fs.readFileSync(filePath, "utf-8");
  let fileLines = fileContents.split(/\r?\n/);

  // Try to parse the new date using known formats (ISO or MM-DD-YYYY)
  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
    return;
  }

  // Format both old and new dates into standard [MM-DD-YYYY] org format
  let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format("MM-DD-YYYY");
  let formattedNewDate = parsedNewDate.format("MM-DD-YYYY");

  // Build a regex pattern that matches the original scheduled date
  let scheduledRegex = new RegExp(`SCHEDULED:\\s*\\[${formattedOldDate}\\]`);

  let updated = false;

  // Step through every line and look for a match with the task text and scheduled date
  let updatedLines = fileLines.map(line => {
    const fullLine = line.trim();

    if (fullLine === taskText && scheduledRegex.test(line)) {
      updated = true;
      return line.replace(scheduledRegex, `SCHEDULED: [${formattedNewDate}]`);
    }

    return line;
  });
  if (updated) {
    // If we successfully found and updated the task, write the new content back to disk
    fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");

    // Let the user know it succeeded and trigger a refresh of the calendar
    vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
    refreshCalendarView();
  } else {
    // If we couldn't find a match, notify the user
    vscode.window.showErrorMessage(`Could not find scheduled task to update.`);
  }
}

/**
 * Reschedule by stable id formatted as "<file>#<lineIndex>" with newDate in MM-DD-YYYY or ISO format.
 */
function rescheduleTaskById(taskId, newDate) {
  const parts = String(taskId).split('#');
  if (parts.length !== 2) {
    vscode.window.showErrorMessage('Invalid task id for reschedule.');
    return;
  }
  const file = parts[0];
  const lineIndex = parseInt(parts[1], 10);
  if (!file || Number.isNaN(lineIndex)) {
    vscode.window.showErrorMessage('Invalid task id components.');
    return;
  }

  const filePath = path.join(setMainDir(), file);
  if (!fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`File not found: ${file}`);
    return;
  }

  const fileContents = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContents.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) {
    vscode.window.showErrorMessage('Task line index out of range.');
    return;
  }

  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage('Invalid date format for reschedule.');
    return;
  }
  const formattedNewDate = parsedNewDate.format('MM-DD-YYYY');

  // Replace or insert SCHEDULED: [MM-DD-YYYY] on that line
  const scheduledRegex = /(SCHEDULED:\s*\[)(\d{2}-\d{2}-\d{4})(\])/;
  if (scheduledRegex.test(lines[lineIndex])) {
    lines[lineIndex] = lines[lineIndex].replace(scheduledRegex, `$1${formattedNewDate}$3`);
  } else {
    // Append SCHEDULED at end with a spacing dash if not present
    lines[lineIndex] = lines[lineIndex].replace(/\s*$/, '') + `  SCHEDULED: [${formattedNewDate}]`;
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
  refreshCalendarView();
}


/**
 * Opens the Calendar View as a Webview panel in VSCode.
 * If already open, brings the panel into focus.
 * Sets up event listeners for messaging between the webview and extension.
 */
function openCalendarView() {
  // If the panel is already open, just reveal it (focus it)
  if (calendarPanel) {
    calendarPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Create a new Webview Panel beside the editor
  calendarPanel = vscode.window.createWebviewPanel(
    "calendarView",           // Internal ID
    "Calendar View",          // Display title
    vscode.ViewColumn.Beside, // Show beside current editor
    { enableScripts: true }   // Allow scripts to run in the Webview
  );

  // Prepare CSP nonce and set Webview HTML
  const webview = calendarPanel.webview;
  const nonce = getNonce();

  // Set the initial HTML content for the calendar (CSP + CDN assets)
  calendarPanel.webview.html = getCalendarWebviewContent({ webview, nonce });

  // When the user closes the panel, release the reference so it can be recreated later
  calendarPanel.onDidDispose(() => {
    calendarPanel = null;
  });

  // Handle messages coming from the calendar webview (i.e., user interactions)
  calendarPanel.webview.onDidReceiveMessage(message => {
    if (message.command === "requestTasks") {
      // Webview is asking for fresh task data
      sendTasksToCalendar(calendarPanel);

    } else if (message.command === "openFile") {
      // Open a specific org file in the editor
      let filePath = path.join(setMainDir(), message.file);
      vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
        vscode.window.showTextDocument(doc);
      });

    } else if (message.command === "rescheduleTask") {
      // Webview user dragged/dropped a task to a new date
      if (message.id) {
        rescheduleTaskById(message.id, message.newDate);
      } else {
        rescheduleTask(message.file, message.oldDate, message.newDate, message.text);
      }
    }
  });
}

/**
 * Returns the full HTML content for the Calendar View Webview panel.
 * Integrates FullCalendar, styles, and sets up message passing to/from the extension.
 */
function getCalendarWebviewContent({ webview, nonce }) {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}' https:; script-src ${webview.cspSource} 'nonce-${nonce}' https:; font-src ${webview.cspSource} https: data:`;
  const fullCalendarCss = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css';
  const fullCalendarJs = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js';
  const momentJs = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js';

  // Utility JS (injected inline with nonce) kept compact to stay readable.
  const script = `(()=>{
    const vscode=acquireVsCodeApi();
    let cal; let all=[]; let activeTags=[];
    function tagSlug(t){return (t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
    function ensureTagColor(tag){
      const id='tag-color-'+tagSlug(tag);
      if(document.getElementById(id)) return id;
      const palette=['#d97706','#2563eb','#059669','#dc2626','#7c3aed','#db2777','#0d9488','#b45309','#1d4ed8','#10b981','#9333ea','#f87171'];
      // Deterministic-ish index: hash via char codes
      let hash=0; for(let i=0;i<tag.length;i++){hash=(hash*31 + tag.charCodeAt(i))>>>0;} const color=palette[hash % palette.length];
      const st=document.createElement('style'); st.id=id; st.setAttribute('nonce','${nonce}');
      st.textContent='.'+id+'{background:'+color+';border:1px solid '+color+';}'; document.head.appendChild(st); return id; }
    function renderTagChips(tasks){
      const container=document.getElementById('tag-bubbles'); if(!container) return;
      const tags=new Set(); tasks.forEach(t=> (t.tags||[]).forEach(tag=>tags.add(tag)));
      const sorted=[...tags].sort();
      container.innerHTML=sorted.map(tag=>{ const colorClass=ensureTagColor(tag); let cls='tag-chip '+colorClass; if(activeTags.length){cls+=activeTags.includes(tag)?' selected':' inactive';} return '<span class="'+cls+'" data-tag="'+tag+'">'+tag+'</span>'; }).join('');
      container.querySelectorAll('.tag-chip').forEach(el=>{
        el.addEventListener('click',e=>{
          const tg=el.dataset.tag;
            if(e.ctrlKey||e.metaKey){ if(activeTags.includes(tg)){ activeTags=activeTags.filter(x=>x!==tg);} else { activeTags.push(tg);} }
            else { activeTags = activeTags.includes(tg)?[]:[tg]; }
          syncEvents(); renderTagChips(all);
        });
      });
    }
    function syncEvents(){
      if(!cal) return; cal.removeAllEvents();
      let tasks=all; if(activeTags.length){ tasks = tasks.filter(t=> (t.tags||[]).some(tag=>activeTags.includes(tag))); }
      cal.addEventSource(tasks.map(t=>({id:t.id,title:t.text,start:t.date,file:t.file,originalDate:t.date,fullText:t.fullText,extendedProps:{file:t.file,originalDate:t.date,fullText:t.fullText}})));
      document.getElementById('status').textContent=tasks.length+' task(s)'+(activeTags.length?' (filtered)':'');
    }
    function init(){
      if(!window.FullCalendar||!window.moment){ document.getElementById('status').textContent='Deps failed'; return; }
      cal=new FullCalendar.Calendar(document.getElementById('calendar'),{
        initialView:'dayGridMonth',
        headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'},
        editable:true,
        eventClick:i=>vscode.postMessage({command:'openFile',file:i.event.extendedProps.file}),
        eventDrop:i=>{ const nd=moment(i.event.start).format('MM-DD-YYYY'); vscode.postMessage({command:'rescheduleTask',id:i.event.id,file:i.event.extendedProps.file,oldDate:i.event.extendedProps.originalDate,newDate:nd,text:i.event.extendedProps.fullText}); }
      });
      cal.render();
      vscode.postMessage({command:'requestTasks'});
      window.addEventListener('message',ev=>{ if(!ev.data||!ev.data.tasks) return; all=ev.data.tasks; renderTagChips(all); syncEvents(); });
    }
    let tries=0; const poll=setInterval(()=>{ if(window.FullCalendar&&window.moment){ clearInterval(poll); init(); } else if(++tries>50){ clearInterval(poll); document.getElementById('status').textContent='Failed to load calendar'; } },120);
  })();`;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta http-equiv="Content-Security-Policy" content="'+csp+'">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Calendar View</title>',
    '<link rel="stylesheet" href="'+fullCalendarCss+'">',
    '<style nonce="'+nonce+'">body{font-family:Arial, sans-serif;margin:0;padding:12px;background:#1e1e1e;color:#fff;}h1{font-size:18px;margin:0 0 8px}#toolbar{max-width:960px;margin:0 auto 6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;}#tag-bubbles{display:flex;flex-wrap:wrap;gap:6px;}#calendar{max-width:960px;margin:0 auto;background:#fff;color:#000;padding:8px;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,.4);}#status{font-size:11px;margin:6px auto 0;max-width:960px;text-align:center;opacity:.75}.tag-chip{display:inline-block;padding:2px 8px;font-size:10px;font-weight:600;letter-spacing:.5px;border-radius:12px;background:#555;color:#fff;cursor:pointer;user-select:none;transition:all .15s}.tag-chip.inactive{opacity:.25;filter:grayscale(70%)}.tag-chip.selected{outline:2px solid #fff;box-shadow:0 0 0 2px rgba(255,255,255,.3)}</style>',
    '<script nonce="'+nonce+'" src="'+momentJs+'"></script>',
    '<script nonce="'+nonce+'" src="'+fullCalendarJs+'"></script>',
    '<script nonce="'+nonce+'">'+script+'</script>',
    '</head>',
    '<body>',
    '<h1>Calendar View</h1>',
    '<div id="toolbar"><div id="tag-bubbles" aria-label="Tag filters"></div></div>',
    '<div id="calendar"></div>',
    '<div id="status">Loading…</div>',
    '</body>',
    '</html>'
  ].join('');
}

module.exports = {
  openCalendarView
};