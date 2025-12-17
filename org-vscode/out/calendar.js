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
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

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
          const startsWithSymbol = /^([⊙⊖⊘⊜⊗]|\*+)/.test(line.trim()); 

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
              .replace(/^\*+\s+/, '')                                         // Remove the leading org '*' heading marker(s)
              .trim();

            tasks.push({
              text: cleanedText, // For display in calendar
              fullText: fullLine, // For backend matching (reschedule logic)
              date: moment(scheduledMatch[1], [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true).format("YYYY-MM-DD"),
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

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

  // Try to parse the new date using known formats (ISO or configured format)
  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
    return;
  }

  // Format both old and new dates into the user's configured org format
  let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format(dateFormat);
  let formattedNewDate = parsedNewDate.format(dateFormat);

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

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage('Invalid date format for reschedule.');
    return;
  }
  const formattedNewDate = parsedNewDate.format(dateFormat);

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
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}' https:; script-src ${webview.cspSource} 'nonce-${nonce}' https:; font-src ${webview.cspSource} https: data:`;
  const fullCalendarCss = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css';
  const fullCalendarJs = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js';
  const momentJs = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js';

  // Utility JS (injected inline with nonce) kept compact to stay readable.
  const script = `(()=>{
    const vscode=acquireVsCodeApi();
    const orgDateFormat=${JSON.stringify(dateFormat)};
    let cal; let all=[]; let activeTags=[]; let activeFile=''; let lastRange=null;
    const palette=['#f97316','#facc15','#0ea5e9','#22c55e','#a855f7','#ec4899','#14b8a6','#f87171','#6366f1','#eab308','#84cc16','#fb7185'];
    const tagColors={};

    function tagSlug(t){return (t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');}
    function getTagColor(tag){
      const key=tag||'__default__';
      if(tagColors[key]) return tagColors[key];
      if(!tag){ tagColors[key]='#2563eb'; return tagColors[key]; }
      let hash=0; for(let i=0;i<tag.length;i++){hash=(hash*31 + tag.charCodeAt(i))>>>0;}
      tagColors[key]=palette[hash % palette.length];
      return tagColors[key];
    }
    function ensureTagColor(tag){
      const id='tag-color-'+tagSlug(tag||'default');
      if(document.getElementById(id)) return id;
      const color=getTagColor(tag);
      const st=document.createElement('style'); st.id=id; st.setAttribute('nonce','${nonce}');
      st.textContent='.'+id+'{background:'+color+';border:1px solid '+color+';}';
      document.head.appendChild(st);
      return id;
    }

    const isWithinRange=(task,range)=>{
      if(!range) return true;
      const start=moment(range.start);
      const end=moment(range.end);
      const taskDate=moment(task.date);
      return taskDate.isSameOrAfter(start,'day') && taskDate.isBefore(end,'day');
    };

    function renderFileChips(tasks){
      const container=document.getElementById('file-bubbles');
      if(!container) return;
      const files=new Set();
      (tasks||[]).forEach(t=>{ if(t && t.file) files.add(t.file); });
      const sorted=[...files].sort((a,b)=>String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
      if(activeFile && !files.has(activeFile)) activeFile='';
      if(sorted.length===0){
        container.innerHTML='<div class="no-tags">No files in view</div>';
        return;
      }
      container.innerHTML=sorted.map(f=>{
        let cls='file-chip';
        if(activeFile){ cls+= (activeFile===f)?' selected':' inactive'; }
        return '<span class="'+cls+'" data-file="'+String(f).replace(/"/g,'&quot;')+'" title="'+String(f).replace(/"/g,'&quot;')+'">'+String(f)+'</span>';
      }).join('');
      container.querySelectorAll('.file-chip').forEach(el=>{
        el.addEventListener('click',()=>{
          const f=el.dataset.file;
          activeFile = (activeFile===f) ? '' : f;
          renderCurrentRange(lastRange);
        });
      });
    }

    function renderTagChips(tasks){
      const container=document.getElementById('tag-bubbles'); if(!container) return;
      const tags=new Set(); tasks.forEach(t=>(t.tags||[]).forEach(tag=>tags.add(tag)));
      const sorted=[...tags].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
      if(sorted.length===0){
        container.innerHTML='<div class="no-tags">No tags in view</div>';
        return;
      }
      container.innerHTML=sorted.map(tag=>{
        const colorClass=ensureTagColor(tag);
        let cls='tag-chip '+colorClass;
        if(activeTags.length){cls+=activeTags.includes(tag)?' selected':' inactive';}
        return '<span class="'+cls+'" data-tag="'+tag+'" title="'+tag+'">'+tag+'</span>';
      }).join('');
      container.querySelectorAll('.tag-chip').forEach(el=>{
        el.addEventListener('click',e=>{
          const tg=el.dataset.tag;
          if(e.ctrlKey||e.metaKey){
            activeTags = activeTags.includes(tg)
              ? activeTags.filter(x=>x!==tg)
              : [...activeTags,tg];
          } else {
            activeTags = activeTags.includes(tg) ? [] : [tg];
          }
          renderCurrentRange(lastRange);
        });
      });
    }

    function syncEvents(visible){
      if(!cal) return;
      cal.removeAllEvents();
      let tasks=visible||[];
      if(activeFile){
        tasks = tasks.filter(t=>t.file===activeFile);
      }
      if(activeTags.length){
        tasks = tasks.filter(t=>(t.tags||[]).some(tag=>activeTags.includes(tag)));
      }
      cal.addEventSource(tasks.map(t=>{
        const primary=(t.tags||[])[0] || '';
        const color=getTagColor(primary);
        return {
          id:t.id,
          title:t.text,
          start:t.date,
          file:t.file,
          originalDate:t.date,
          fullText:t.fullText,
          backgroundColor:color,
          borderColor:color,
          textColor:'#ffffff',
          extendedProps:{file:t.file,originalDate:t.date,fullText:t.fullText}
        };
      }));
      const status=document.getElementById('status');
      if(status){
        const rangeNote=lastRange?moment(lastRange.start).format('MMM D')+' – '+moment(lastRange.end).subtract(1,'day').format('MMM D'):'';
        status.textContent=tasks.length+' task(s) in view'
          +(rangeNote?' · '+rangeNote:'')
          +(activeFile?' · '+activeFile:'')
          +(activeTags.length?' · filtered':'' );
      }
    }

    function renderCurrentRange(range){
      if(!range){
        if(cal && cal.view){ range={start:cal.view.activeStart,end:cal.view.activeEnd}; } else { return; }
      }
      lastRange=range;
      const inRange=all.filter(task=>isWithinRange(task,range));
      renderFileChips(inRange);
      const afterFile = activeFile ? inRange.filter(t=>t.file===activeFile) : inRange;
      renderTagChips(afterFile);
      syncEvents(afterFile);
    }

    function init(){
      if(!window.FullCalendar||!window.moment){ document.getElementById('status').textContent='Deps failed'; return; }
      cal=new FullCalendar.Calendar(document.getElementById('calendar'),{
        initialView:'dayGridMonth',
        headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'},
        editable:true,
        datesSet:info=>renderCurrentRange({start:info.start,end:info.end}),
        eventClick:i=>vscode.postMessage({command:'openFile',file:i.event.extendedProps.file}),
        eventDrop:i=>{
          const nd=moment(i.event.start).format(orgDateFormat);
          vscode.postMessage({command:'rescheduleTask',id:i.event.id,file:i.event.extendedProps.file,oldDate:i.event.extendedProps.originalDate,newDate:nd,text:i.event.extendedProps.fullText});
        }
      });
      cal.render();
      vscode.postMessage({command:'requestTasks'});
      window.addEventListener('message',ev=>{
        if(!ev.data||!ev.data.tasks) return;
        all=ev.data.tasks;
        if(cal){
          renderCurrentRange({start:cal.view.activeStart,end:cal.view.activeEnd});
        }
      });
    }
    let tries=0; const poll=setInterval(()=>{
      if(window.FullCalendar&&window.moment){ clearInterval(poll); init(); }
      else if(++tries>50){ clearInterval(poll); document.getElementById('status').textContent='Failed to load calendar'; }
    },120);
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
    '<style nonce="'+nonce+'">',
    'body{font-family:"Segoe UI",Arial,sans-serif;margin:0;padding:0;background:#1f1f24;color:#f4f4f5;height:100vh;overflow:hidden;}',
    '#app-container{display:flex;height:100vh;overflow:hidden;}',
    '#sidebar{width:200px;min-width:160px;max-width:280px;background:#2a2a30;border-right:1px solid #3a3a42;display:flex;flex-direction:column;overflow:hidden;}',
    '#sidebar-header{padding:12px 14px;border-bottom:1px solid #3a3a42;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;flex-shrink:0;}',
    '#file-bubbles{flex:0 0 auto;max-height:170px;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid #3a3a42;}',
    '#tag-bubbles{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;}',
    '#file-bubbles::-webkit-scrollbar{width:6px;}',
    '#file-bubbles::-webkit-scrollbar-track{background:#2a2a30;}',
    '#file-bubbles::-webkit-scrollbar-thumb{background:#4a4a52;border-radius:3px;}',
    '#file-bubbles::-webkit-scrollbar-thumb:hover{background:#5a5a62;}',
    '#tag-bubbles::-webkit-scrollbar{width:6px;}',
    '#tag-bubbles::-webkit-scrollbar-track{background:#2a2a30;}',
    '#tag-bubbles::-webkit-scrollbar-thumb{background:#4a4a52;border-radius:3px;}',
    '#tag-bubbles::-webkit-scrollbar-thumb:hover{background:#5a5a62;}',
    '#main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:16px;}',
    'h1{font-size:18px;font-weight:600;margin:0 0 10px;flex-shrink:0;}',
    '#calendar-wrapper{flex:1;overflow:auto;max-width:980px;}',
    '#calendar{background:#fff;color:#000;padding:10px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);}',
    '#status{font-size:12px;margin-top:10px;text-align:center;opacity:.8;flex-shrink:0;}',
    '.tag-chip{display:flex;align-items:center;padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-radius:6px;color:#fff;cursor:pointer;user-select:none;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .1s ease,opacity .1s ease;border:1px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.tag-chip:hover{transform:translateX(2px);opacity:.95;box-shadow:0 3px 8px rgba(0,0,0,.3);}',
    '.tag-chip.inactive{opacity:.35;filter:saturate(20%);}',
    '.tag-chip.selected{outline:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(255,255,255,.25);}',
    '.file-chip{display:flex;align-items:center;padding:6px 12px;font-size:11px;font-weight:600;border-radius:6px;color:#fff;cursor:pointer;user-select:none;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .1s ease,opacity .1s ease;border:1px solid #4a4a52;background:#4a4a52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.file-chip:hover{transform:translateX(2px);opacity:.95;box-shadow:0 3px 8px rgba(0,0,0,.3);}',
    '.file-chip.inactive{opacity:.35;}',
    '.file-chip.selected{outline:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(255,255,255,.25);}',
    '.no-tags{font-size:11px;color:#6b7280;padding:12px;text-align:center;font-style:italic;}',
    '</style>',
    '<script nonce="'+nonce+'" src="'+momentJs+'"></script>',
    '<script nonce="'+nonce+'" src="'+fullCalendarJs+'"></script>',
    '<script nonce="'+nonce+'">'+script+'</script>',
    '</head>',
    '<body>',
    '<div id="app-container">',
    '<aside id="sidebar">',
    '<div id="sidebar-header">Files</div>',
    '<div id="file-bubbles" aria-label="File filters"></div>',
    '<div id="sidebar-header">Tag Filters</div>',
    '<div id="tag-bubbles" aria-label="Tag filters"></div>',
    '</aside>',
    '<main id="main-content">',
    '<h1>Calendar View</h1>',
    '<div id="calendar-wrapper"><div id="calendar"></div></div>',
    '<div id="status">Loading…</div>',
    '</main>',
    '</div>',
    '</body>',
    '</html>'
  ].join('');
}

module.exports = {
  openCalendarView
};