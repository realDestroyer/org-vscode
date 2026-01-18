// calendar.js - Handles Calendar View for Org Mode (with full Unicode + keyword support)

const vscode = require("vscode");   // VSCode API access
const fs = require("fs");           // File system module to read/write org files
const path = require("path");       // For cross-platform path handling
const moment = require("moment");   // Date formatting library
const taskKeywordManager = require("./taskKeywordManager");
const { getAllTagsFromLine, stripAllTagSyntax, parseFileTagsFromText, createInheritanceTracker, getPlanningForHeading, isPlanningLine, normalizeTagsAfterPlanning, getAcceptedDateFormats, buildScheduledReplacement, getMatchingScheduledOnLine, SCHEDULED_STRIP_RE, SCHEDULED_REGEX, DEADLINE_REGEX, momentFromTimestampContent, extractPlainTimestamps } = require("./orgTagUtils");
const { normalizeBodyIndentation } = require("./indentUtils");

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingStartRegex(registry) {
  const markers = (registry?.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const unique = Array.from(new Set(markers));
  const markerAlt = unique.map(escapeRegExp).join("|");
  const parts = ["\\*+"];
  if (markerAlt) parts.push(`(?:${markerAlt})`);
  return new RegExp(`^\\s*(?:${parts.join("|")})`);
}

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
 * Falls back to ~/VSOrgFiles if no custom path is set in settings.
 */
function setMainDir() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" 
    ? folderPath 
    : path.join(require("os").homedir(), "VSOrgFiles");
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
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const registry = taskKeywordManager.getWorkflowRegistry();
  const headingStartRegex = buildHeadingStartRegex(registry);

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
      return;
    }

  const skippedFiles = [];

  files.forEach(file => {
      // Ignore non-.org files and the special CurrentTasks.org export file
      if (file.endsWith(".org") && !file.startsWith(".") && file !== "CurrentTasks.org") {
        let filePath = path.join(dirPath, file);
        let fileText;
        try {
          fileText = fs.readFileSync(filePath, "utf-8");
        } catch (fileErr) {
          skippedFiles.push({ file, reason: fileErr.message });
          return;
        }
        let content = fileText.split(/\r?\n/);
        const tracker = createInheritanceTracker(parseFileTagsFromText(fileText));

        // Track current heading for plain timestamps in body text
        let currentHeadingText = null;
        let currentHeadingLine = 0;
        let seenFirstHeading = false;

        content.forEach((line, lineIndex) => {
          const tagState = tracker.handleLine(line);
          const startsWithSymbol = headingStartRegex.test(line.trim());

          // Track current heading for plain timestamp display
          if (startsWithSymbol) {
            seenFirstHeading = true;
            currentHeadingText = taskKeywordManager.cleanTaskText(stripAllTagSyntax(line.trim()));
            currentHeadingLine = lineIndex + 1;
          }

          const planning = getPlanningForHeading(content, lineIndex);
          const scheduledDate = planning && planning.scheduled ? planning.scheduled : null;

          const keyword = taskKeywordManager.findTaskKeyword(line);
          if (!scheduledDate || !startsWithSymbol || !keyword) {
            // Check for plain timestamps if after first heading
            if (seenFirstHeading) {
              const plainTimestamps = extractPlainTimestamps(line);
              for (const ts of plainTimestamps) {
                // Only active timestamps <...> appear in calendar
                if (ts.bracket !== '<') continue;

                let parsedDate = moment(ts.date, getAcceptedDateFormats(dateFormat), true);
                if (!parsedDate.isValid()) continue;

                tasks.push({
                  text: currentHeadingText || line.trim(),  // Display heading text
                  fullText: line.trim(),
                  date: parsedDate.format("YYYY-MM-DD"),
                  file: file,
                  tags: [],
                  id: file + '#' + lineIndex,  // Timestamp line for jumping
                  error: null,
                  originalDate: ts.date,
                  isPlainTimestamp: true
                });
              }
            }
            return;
          }

          const state = (registry.states || []).find((s) => s.keyword === keyword);
          const agendaVis = state && state.agendaVisibility ? state.agendaVisibility : "show";
          if (agendaVis === "hide") {
            return;
          }

          if (scheduledDate) {
            // Effective tags include inherited tags from parent headings and file-level #+FILETAGS.
            // For non-asterisk headings (unicode-only), fall back to per-line tag extraction.
            const tags = (tagState && tagState.isHeading)
              ? tagState.inheritedTags
              : getAllTagsFromLine(line);

            const fullLine = line.trim();

            const cleanedText = taskKeywordManager.cleanTaskText(
              stripAllTagSyntax(fullLine)
                .replace(SCHEDULED_STRIP_RE, "")
                .trim()
            );

            // Parse date with error detection
            // Try configured format with day abbreviation first, then without, then common fallbacks
            let parsedDate = momentFromTimestampContent(scheduledDate, getAcceptedDateFormats(dateFormat), true);
            let parseError = null;

            if (!parsedDate.isValid()) {
              parseError = `Invalid date: ${scheduledDate}`;
              parsedDate = moment(); // Fallback to today
            }

            tasks.push({
              text: cleanedText, // For display in calendar
              fullText: fullLine, // For backend matching (reschedule logic)
              date: parsedDate.format("YYYY-MM-DD"),
              file: file,
              tags: tags,
              id: file + '#' + lineIndex, // stable id for rescheduling
              error: parseError,
              originalDate: scheduledDate
            });
          }
        });
      }
    });

    // Send task data to calendar webview if the panel is open
    const errorCount = tasks.filter(t => t.error).length;
    const skippedCount = skippedFiles.length;

    let errorSummary = null;
    const skippedSummary = skippedFiles.map(s => `${s.file} (${s.reason})`).join("; ");
    if (errorCount > 0 && skippedCount > 0) {
      errorSummary = `${errorCount} task(s) with date errors. Skipped ${skippedCount} file(s): ${skippedSummary}`;
    } else if (errorCount > 0) {
      errorSummary = `${errorCount} task(s) with date errors`;
    } else if (skippedCount > 0) {
      errorSummary = `Skipped ${skippedCount} unreadable file(s): ${skippedSummary}`;
    }

    if (panel) {
      panel.webview.postMessage({
        tasks,
        errorCount: errorCount + skippedCount,
        errorSummary
      });
    }
  });
}
/**
 * Updates a specific task's scheduled date inside the specified .org file.
 * Matches based on original task text and the old scheduled date.
 * Handles SCHEDULED on both inline (same line) and planning line (next line).
 */
function rescheduleTask(file, oldDate, newDate, taskText) {
  let filePath = path.join(setMainDir(), file);
  let fileContents = fs.readFileSync(filePath, "utf-8");
  let fileLines = fileContents.split(/\r?\n/);

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

  // Try to parse the new date using known formats (ISO or configured format)
  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
    return;
  }

  // Parse the old date for comparison
  let parsedOldDate = moment(oldDate, "YYYY-MM-DD", true);
  if (!parsedOldDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid old date.`);
    return;
  }

  let formattedNewDate = parsedNewDate.format(dateFormat);
  let updated = false;

  // Find the task line, then check inline and next line for SCHEDULED
  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i];
    const fullLine = line.trim();

    if (fullLine === taskText) {
      // Check for inline SCHEDULED on this line
      let match = getMatchingScheduledOnLine(line, parsedOldDate, acceptedDateFormats);
      if (match) {
        fileLines[i] = line.replace(SCHEDULED_REGEX, buildScheduledReplacement(match, parsedNewDate, formattedNewDate));
        updated = true;
        break;
      }

      // Check for SCHEDULED on the next planning line
      if (i + 1 < fileLines.length && isPlanningLine(fileLines[i + 1])) {
        match = getMatchingScheduledOnLine(fileLines[i + 1], parsedOldDate, acceptedDateFormats);
        if (match) {
          fileLines[i + 1] = fileLines[i + 1].replace(SCHEDULED_REGEX, buildScheduledReplacement(match, parsedNewDate, formattedNewDate));
          updated = true;
          break;
        }
      }
    }
  }

  if (updated) {
    // If we successfully found and updated the task, write the new content back to disk
    fs.writeFileSync(filePath, fileLines.join("\n"), "utf-8");

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
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");

  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage('Invalid date format for reschedule.');
    return;
  }
  const formattedNewDate = parsedNewDate.format(dateFormat);

  // Replace or insert SCHEDULED: <MM-DD-YYYY> on that line (active timestamp for agenda)
  const headlineText = normalizeTagsAfterPlanning(lines[lineIndex])
    .replace(SCHEDULED_STRIP_RE, "")
    .trimRight();
  lines[lineIndex] = headlineText;

  const headlineIndent = headlineText.match(/^\s*/)?.[0] || "";
  const planningIndent = `${headlineIndent}${bodyIndent}`;
  const scheduledTag = `SCHEDULED: <${formattedNewDate}>`;

  const nextLine = (lineIndex + 1 < lines.length) ? lines[lineIndex + 1] : "";
  if (isPlanningLine(nextLine)) {
    const indent = nextLine.match(/^\s*/)?.[0] || planningIndent;
    let body = String(nextLine).trim()
      .replace(SCHEDULED_STRIP_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (DEADLINE_REGEX.test(body)) {
      body = body.replace(DEADLINE_REGEX, `${scheduledTag}  $&`);
    } else {
      body = body ? `${body}  ${scheduledTag}` : scheduledTag;
    }

    lines[lineIndex + 1] = `${indent}${body}`;
  } else {
    lines.splice(lineIndex + 1, 0, `${planningIndent}${scheduledTag}`);
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
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
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
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
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
        const noFiles=document.createElement('div');
        noFiles.className='no-tags';
        noFiles.textContent='No files in view';
        container.replaceChildren(noFiles);
        return;
      }
      container.replaceChildren(...sorted.map(f=>{
        const span=document.createElement('span');
        span.className='file-chip';
        if(activeFile){ span.classList.add(activeFile===f?'selected':'inactive'); }
        span.dataset.file=f;
        span.title=f;
        span.textContent=f;
        span.addEventListener('click',()=>{
          activeFile = (activeFile===f) ? '' : f;
          renderCurrentRange(lastRange);
        });
        return span;
      }));
    }

    function renderTagChips(tasks){
      const container=document.getElementById('tag-bubbles'); if(!container) return;
      const tags=new Set(); tasks.forEach(t=>(t.tags||[]).forEach(tag=>tags.add(tag)));
      const sorted=[...tags].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
      if(sorted.length===0){
        const noTags=document.createElement('div');
        noTags.className='no-tags';
        noTags.textContent='No tags in view';
        container.replaceChildren(noTags);
        return;
      }
      container.replaceChildren(...sorted.map(tag=>{
        const span=document.createElement('span');
        span.className='tag-chip '+ensureTagColor(tag);
        if(activeTags.length){ span.classList.add(activeTags.includes(tag)?'selected':'inactive'); }
        span.dataset.tag=tag;
        span.title=tag;
        span.textContent=tag;
        span.addEventListener('click',e=>{
          if(e.ctrlKey||e.metaKey){
            activeTags = activeTags.includes(tag)
              ? activeTags.filter(x=>x!==tag)
              : [...activeTags,tag];
          } else {
            activeTags = activeTags.includes(tag) ? [] : [tag];
          }
          renderCurrentRange(lastRange);
        });
        return span;
      }));
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
          originalDate:t.originalDate||t.date,
          fullText:t.fullText,
          backgroundColor:t.error?'':color,
          borderColor:t.error?'':color,
          textColor:'#ffffff',
          classNames:t.error?['event-error']:[],
          extendedProps:{file:t.file,originalDate:t.originalDate||t.date,fullText:t.fullText,error:t.error||null,isError:!!t.error}
        };
      }));
      const status=document.getElementById('status');
      if(status){
        const errorCount=all.filter(t=>t.error).length;
        const rangeNote=lastRange?moment(lastRange.start).format('MMM D')+' – '+moment(lastRange.end).subtract(1,'day').format('MMM D'):'';
        status.textContent=tasks.length+' task(s) in view'
          +(errorCount>0?' ⚠️ '+errorCount+' error(s)':'')
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
        },
        eventDidMount:info=>{
          if(info.event.extendedProps.error){
            const title=info.event.extendedProps.error+'\\nOriginal: '+info.event.extendedProps.originalDate+'\\nShowing at today\\'s date. Click to open file.';
            info.el.title=title;
            const titleEl=info.el.querySelector('.fc-event-title');
            if(titleEl){titleEl.textContent='⚠️ '+titleEl.textContent;}
          }else{
            const title=info.event.title+'\\nFile: '+info.event.extendedProps.file+'\\nDate: '+info.event.extendedProps.originalDate;
            info.el.title=title;
          }
        }
      });
      cal.render();
      vscode.postMessage({command:'requestTasks'});
      window.addEventListener('message',ev=>{
        if(!ev.data||!ev.data.tasks) return;
        all=ev.data.tasks;
        const banner=document.getElementById('error-banner');
        if(banner){
          if(ev.data.errorCount>0){
            banner.className='visible';
            banner.textContent=ev.data.errorSummary;
          }else{
            banner.className='';
          }
        }
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
    'body{font-family:var(--vscode-font-family);margin:0;padding:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);height:100vh;overflow:hidden;}',
    '#app-container{display:flex;height:100vh;overflow:hidden;}',
    '#sidebar{width:200px;min-width:160px;max-width:280px;background:var(--vscode-sideBar-background);border-right:1px solid var(--vscode-sideBar-border);display:flex;flex-direction:column;overflow:hidden;}',
    '#sidebar-header{padding:12px 14px;border-bottom:1px solid var(--vscode-sideBar-border);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);flex-shrink:0;}',
    '#file-bubbles{flex:0 0 auto;max-height:170px;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--vscode-sideBar-border);}',
    '#tag-bubbles{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;}',
    '#file-bubbles::-webkit-scrollbar{width:6px;}',
    '#file-bubbles::-webkit-scrollbar-track{background:var(--vscode-sideBar-background);}',
    '#file-bubbles::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:3px;}',
    '#file-bubbles::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground);}',
    '#tag-bubbles::-webkit-scrollbar{width:6px;}',
    '#tag-bubbles::-webkit-scrollbar-track{background:var(--vscode-sideBar-background);}',
    '#tag-bubbles::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:3px;}',
    '#tag-bubbles::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground);}',
    '#main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:16px;}',
    'h1{font-size:18px;font-weight:600;margin:0 0 10px;flex-shrink:0;}',
    '#calendar-wrapper{flex:1;overflow:auto;max-width:980px;}',
    '#calendar{background:#fff;color:#000;padding:10px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);}',
    '#status{font-size:12px;margin-top:10px;text-align:center;opacity:.8;flex-shrink:0;}',
    '.tag-chip{display:flex;align-items:center;padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-radius:6px;color:var(--vscode-button-foreground);cursor:pointer;user-select:none;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .1s ease,opacity .1s ease;border:1px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.tag-chip:hover{transform:translateX(2px);opacity:.95;box-shadow:0 3px 8px rgba(0,0,0,.3);}',
    '.tag-chip.inactive{opacity:.35;filter:saturate(20%);}',
    '.tag-chip.selected{outline:2px solid var(--vscode-focusBorder);box-shadow:0 0 0 2px var(--vscode-focusBorder);}',
    '.file-chip{display:flex;align-items:center;padding:6px 12px;font-size:11px;font-weight:600;border-radius:6px;color:var(--vscode-button-secondaryForeground);cursor:pointer;user-select:none;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .1s ease,opacity .1s ease;border:1px solid var(--vscode-button-border);background:var(--vscode-button-secondaryBackground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.file-chip:hover{transform:translateX(2px);opacity:.95;box-shadow:0 3px 8px rgba(0,0,0,.3);background:var(--vscode-button-secondaryHoverBackground);}',
    '.file-chip.inactive{opacity:.35;}',
    '.file-chip.selected{outline:2px solid var(--vscode-focusBorder);box-shadow:0 0 0 2px var(--vscode-focusBorder);}',
    '.no-tags{font-size:11px;color:var(--vscode-descriptionForeground);padding:12px;text-align:center;font-style:italic;}',
    '#error-banner{margin:0 0 12px;padding:10px 14px;background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);border-radius:6px;font-size:12px;color:var(--vscode-inputValidation-errorForeground);display:none;align-items:center;gap:8px;flex-shrink:0;}',
    '#error-banner.visible{display:flex;}',
    '#error-banner::before{content:"⚠️";font-size:16px;}',
    '.event-error{background-color:var(--vscode-inputValidation-errorBackground)!important;border:2px dashed var(--vscode-inputValidation-errorBorder)!important;color:var(--vscode-inputValidation-errorForeground)!important;}',
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
    '<div id="error-banner"></div>',
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
