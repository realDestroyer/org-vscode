(() => {
  const vscode = acquireVsCodeApi();
  const state = {
    payload: null,
    filters: { status: "ALL", tag: null, month: null, search: "" },
    activeView: "insights",
    rawCsv: "",
    csvRows: null,
    csvError: null,
    csvSort: { column: null, direction: "asc" },
    csvFilters: []
  };

  const elements = {
    statGrid: document.getElementById("stat-grid"),
    sourceName: document.getElementById("source-name"),
    generatedAt: document.getElementById("generated-at"),
    folderNote: document.getElementById("folder-note"),
    statusFilter: document.getElementById("status-filter"),
    heatmap: document.getElementById("heatmap"),
    heatmapHeader: document.getElementById("heatmap-header"),
    taskList: document.getElementById("task-list"),
    activeFilters: document.getElementById("active-filters"),
    timeline: document.getElementById("timeline"),
    searchInput: document.getElementById("search-input"),
    csvHead: document.getElementById("csv-head"),
    csvBody: document.getElementById("csv-body"),
    csvNote: document.getElementById("csv-note")
  };

  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const viewContainers = Array.from(document.querySelectorAll("[data-view]"));

  document.getElementById("open-source").addEventListener("click", () => vscode.postMessage({ command: "openSource" }));
  document.getElementById("download-csv").addEventListener("click", () => vscode.postMessage({ command: "openArtifact", artifact: "csv" }));
  document.getElementById("download-md").addEventListener("click", () => vscode.postMessage({ command: "openArtifact", artifact: "markdown" }));
  document.getElementById("download-html").addEventListener("click", () => vscode.postMessage({ command: "openArtifact", artifact: "html" }));
  document.getElementById("reveal-folder").addEventListener("click", () => vscode.postMessage({ command: "revealFolder" }));
  const openCsvButton = document.getElementById("open-csv-file");
  if (openCsvButton) {
    openCsvButton.addEventListener("click", () => vscode.postMessage({ command: "openArtifact", artifact: "csv" }));
  }
  document.getElementById("clear-filters").addEventListener("click", () => {
    state.filters = { status: "ALL", tag: null, month: null, search: "" };
    elements.searchInput.value = "";
    render();
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.tab));
  });
  switchView("insights");

  elements.statusFilter.addEventListener("change", () => {
    state.filters.status = elements.statusFilter.value;
    renderTimeline();
    renderTasks();
    renderActiveFilters();
  });

  elements.searchInput.addEventListener("input", () => {
    state.filters.search = elements.searchInput.value.toLowerCase();
    renderTasks();
  });

  window.addEventListener("message", (event) => {
    if (event.data?.command === "dashboardData") {
      state.payload = event.data.payload;
      state.rawCsv = event.data.payload?.csv || "";
      state.csvRows = null;
      state.csvError = null;
      state.csvSort = { column: null, direction: "asc" };
      state.csvFilters = [];
      render();
    }
  });

  vscode.postMessage({ command: "requestData" });

  function render() {
    if (!state.payload) {
      return;
    }
    renderMeta();
    renderStats();
    populateStatusOptions();
    renderTimeline();
    renderHeatmap();
    renderTasks();
    renderActiveFilters();
    toggleDownloads();
    if (state.activeView === "raw") {
      ensureCsvParsed();
      renderCsvTable();
    }
  }

  function renderMeta() {
    const { model, artifacts } = state.payload;
    elements.sourceName.textContent = `${model.sourceName} · ${model.year}`;
    const generated = model.generatedAtIso || model.generatedAt;
    if (generated) {
      const date = new Date(generated);
      elements.generatedAt.textContent = `Generated ${date.toLocaleString()}`;
    } else {
      elements.generatedAt.textContent = "Generated date unavailable";
    }
    elements.folderNote.textContent = artifacts.folder || "";
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function renderStats() {
    const { model } = state.payload;
    const cards = [
      { label: "Total Tasks", value: formatNumber(model.totals.total), hint: `${formatNumber(model.totals.done)} done` },
      { label: "Completion", value: `${model.totals.completionRate}%`, hint: "Done vs total" },
      { label: "Active Tags", value: formatNumber(model.totals.activeTags), hint: "Unique focus areas" },
      { label: "Active Months", value: formatNumber(model.totals.activeMonths), hint: "Scheduled activity" }
    ];
    elements.statGrid.innerHTML = cards
      .map(card => `<div class="stat"><span class="stat-label">${card.label}</span><span class="stat-value">${card.value}</span><span class="stat-hint">${card.hint}</span></div>`)
      .join("");
  }

  function populateStatusOptions() {
    const { model } = state.payload;
    const statuses = new Set(["ALL"]);
    model.statusBreakdown.forEach(item => statuses.add(item.label));
    model.monthlyStatus.forEach(bucket => {
      Object.keys(bucket.perStatus || {}).forEach(status => statuses.add(status));
    });
    const current = state.filters.status;
    elements.statusFilter.innerHTML = Array.from(statuses)
      .map(status => `<option value="${status}">${status === "ALL" ? "All statuses" : status}</option>`)
      .join("");
    elements.statusFilter.value = current && statuses.has(current) ? current : "ALL";
    state.filters.status = elements.statusFilter.value;
  }

  function renderTimeline() {
    const { model } = state.payload;
    const ctx = elements.timeline.getContext("2d");
    const width = elements.timeline.width;
    const height = elements.timeline.height;
    ctx.clearRect(0, 0, width, height);
    const padding = 30;
    const buckets = model.monthlyStatus || [];
    const values = buckets.map(bucket => {
      if (state.filters.status === "ALL") {
        return bucket.total;
      }
      return bucket.perStatus?.[state.filters.status] || 0;
    });
    const max = Math.max(...values, 1);
    const chartHeight = height - padding * 2;
    const chartWidth = width - padding * 2;
    const barWidth = chartWidth / values.length - 8;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding + 10, height - padding);
    ctx.stroke();
    values.forEach((value, index) => {
      const x = padding + index * (barWidth + 8);
      const barHeight = (value / max) * chartHeight;
      const y = height - padding - barHeight;
      const gradient = ctx.createLinearGradient(0, y, 0, height - padding);
      gradient.addColorStop(0, "#38bdf8");
      gradient.addColorStop(1, "rgba(56,189,248,0.1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px 'Space Grotesk'";
      ctx.fillText(buckets[index]?.label || "", x, height - padding + 12);
    });
  }

  function renderHeatmap() {
    const { model } = state.payload;
    const months = model.monthOrder || [];
    elements.heatmapHeader.innerHTML = ["<span></span>", ...months.map(month => `<span>${month.label}</span>`)].join("");
    if (!model.tagMatrix?.length) {
      elements.heatmap.innerHTML = '<p class="empty-state">No tag data captured.</p>';
      return;
    }
    const max = Math.max(...model.tagMatrix.flatMap(row => row.monthly.map(cell => cell.count)), 1);
    elements.heatmap.innerHTML = model.tagMatrix
      .map(row => {
        const cells = row.monthly
          .map(cell => {
            const intensity = cell.count / max;
            return `<span class="heat-cell" data-tag="${row.tag}" data-month="${cell.key}" style="--intensity:${intensity}">${cell.count || ""}</span>`;
          })
          .join("");
        return `<div class="heatmap-row"><span class="tag">${row.tag}</span>${cells}</div>`;
      })
      .join("");
    elements.heatmap.querySelectorAll(".heat-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        state.filters.tag = cell.dataset.tag || null;
        state.filters.month = cell.dataset.month || null;
        renderTasks();
        renderActiveFilters();
      });
    });
  }

  function applyTaskFilters(tasks) {
    return tasks.filter(task => {
      if (state.filters.status !== "ALL" && task.status !== state.filters.status) {
        return false;
      }
      if (state.filters.tag && !(task.tags || []).includes(state.filters.tag)) {
        return false;
      }
      if (state.filters.month && task.monthKey !== state.filters.month) {
        return false;
      }
      if (state.filters.search && !task.title.toLowerCase().includes(state.filters.search)) {
        return false;
      }
      return true;
    });
  }

  function renderTasks() {
    const { model } = state.payload;
    const filtered = applyTaskFilters(model.taskFeed || []);
    if (!filtered.length) {
      elements.taskList.innerHTML = '<div class="empty-state">No tasks match the current filters.</div>';
      return;
    }
    elements.taskList.innerHTML = filtered
      .map(task => {
        const tags = (task.tags || []).map(tag => `<span class="tag-chip">${tag}</span>`).join(" ");
        return `<button class="task-item" data-line="${task.lineNumber}"><span class="task-title">${task.title}</span><div class="task-meta"><span>${task.displayDate || task.date}</span><span>${task.status}</span><span>${task.monthLabel}</span></div><div>${tags}</div></button>`;
      })
      .join("");
    elements.taskList.querySelectorAll(".task-item").forEach(item => {
      item.addEventListener("click", () => {
        const line = Number(item.dataset.line);
        vscode.postMessage({ command: "openTask", lineNumber: Number.isNaN(line) ? undefined : line });
      });
    });
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.filters.status !== "ALL") {
      chips.push(filterChip(`Status · ${state.filters.status}`, () => {
        state.filters.status = "ALL";
        elements.statusFilter.value = "ALL";
        renderTimeline();
        renderTasks();
      }));
    }
    if (state.filters.tag) {
      chips.push(filterChip(`Tag · ${state.filters.tag}`, () => {
        state.filters.tag = null;
        renderTasks();
      }));
    }
    if (state.filters.month) {
      chips.push(filterChip(`Month · ${state.filters.month}`, () => {
        state.filters.month = null;
        renderTasks();
      }));
    }
    if (state.filters.search) {
      chips.push(filterChip(`Search`, () => {
        state.filters.search = "";
        elements.searchInput.value = "";
        renderTasks();
      }));
    }
    elements.activeFilters.innerHTML = chips.length ? chips.join("") : '<span class="muted">No filters active.</span>';
  }

  function filterChip(label, onRemove) {
    const id = `chip-${Math.random().toString(16).slice(2)}`;
    setTimeout(() => {
      const node = document.getElementById(id);
      if (node) {
        node.addEventListener("click", onRemove);
      }
    }, 0);
    return `<span class="filter-chip" id="${id}">${label}<svg viewBox="0 0 10 10"><path fill="currentColor" d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.2"/></svg></span>`;
  }

  function toggleDownloads() {
    const buttons = [
      { id: "download-csv", key: "csv" },
      { id: "open-csv-file", key: "csv" },
      { id: "download-md", key: "markdown" },
      { id: "download-html", key: "html" }
    ];
    buttons.forEach(btn => {
      const el = document.getElementById(btn.id);
      const available = Boolean(state.payload?.artifacts?.[btn.key]);
      if (el) {
        el.disabled = !available;
      }
    });
  }

  function switchView(target) {
    if (!target) {
      return;
    }
    state.activeView = target;
    tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === target));
    viewContainers.forEach(section => {
      section.classList.toggle("hidden", section.dataset.view !== target);
    });
    if (target === "raw") {
      ensureCsvParsed();
      renderCsvTable();
    }
  }

  function ensureCsvParsed() {
    if (state.csvRows || state.csvError) {
      return;
    }
    if (!state.rawCsv) {
      state.csvRows = [];
      state.csvError = "CSV artifact missing. Run the export again.";
      return;
    }
    try {
      state.csvRows = parseCsv(state.rawCsv);
      state.csvError = null;
    } catch (error) {
      state.csvRows = [];
      state.csvError = error.message || "Unable to parse CSV export.";
    }
  }

  function renderCsvTable() {
    if (!elements.csvHead || !elements.csvBody || !elements.csvNote) {
      return;
    }
    const activeElement = document.activeElement;
    const shouldRestoreFocus = activeElement?.classList?.contains("filter-input")
      ? {
          index: Number(activeElement.dataset.filter),
          selectionStart: activeElement.selectionStart,
          selectionEnd: activeElement.selectionEnd
        }
      : null;
    if (state.csvError) {
      elements.csvHead.innerHTML = "";
      elements.csvBody.innerHTML = '<tr><td class="empty" colspan="1">' + escapeHtml(state.csvError) + "</td></tr>";
      elements.csvNote.textContent = "CSV export unavailable.";
      return;
    }
    const { header, rows } = getFilteredCsvRows();
    if (!header.length) {
      elements.csvHead.innerHTML = "";
      elements.csvBody.innerHTML = '<tr><td class="empty" colspan="1">No rows were parsed from the CSV.</td></tr>';
      elements.csvNote.textContent = "CSV export contains no data.";
      return;
    }
    const colCount = Math.max(header.length, 1);
    elements.csvHead.innerHTML = buildCsvHeaderHtml(header);
    if (!rows.length) {
      elements.csvBody.innerHTML = `<tr><td class="empty" colspan="${colCount}">No tasks match the current column filters.</td></tr>`;
    } else {
      elements.csvBody.innerHTML = rows
        .map(row => `<tr>${header.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`)
        .join("");
    }
    wireCsvHeaderEvents();
    wireCsvFilterInputs();
    if (shouldRestoreFocus && Number.isInteger(shouldRestoreFocus.index)) {
      const target = elements.csvHead.querySelector(`.filter-input[data-filter="${shouldRestoreFocus.index}"]`);
      if (target) {
        target.focus();
        const start = shouldRestoreFocus.selectionStart ?? target.value.length;
        const end = shouldRestoreFocus.selectionEnd ?? target.value.length;
        target.setSelectionRange(start, end);
      }
    }
    const rowCount = Math.max(rows.length, 0).toLocaleString();
    const artifactLabel = state.payload?.artifacts?.csv || "Year summary";
    elements.csvNote.textContent = `${rowCount} rows · ${artifactLabel}`;
  }

  function buildCsvHeaderHtml(header) {
    const sort = state.csvSort;
    const headerRow = header
      .map((col, index) => {
        const isActive = sort.column === index;
        const indicator = isActive ? (sort.direction === "asc" ? "↑" : "↓") : "";
        return `<th><button class="header-button" data-col="${index}">${escapeHtml(col)}<span class="sort-indicator">${indicator}</span></button></th>`;
      })
      .join("");
    const filterRow = header
      .map((_, index) => {
        const value = state.csvFilters[index] || "";
        return `<th><input type="text" class="filter-input" data-filter="${index}" value="${escapeHtml(value)}" placeholder="Filter" /></th>`;
      })
      .join("");
    return `<tr>${headerRow}</tr><tr class="filter-row">${filterRow}</tr>`;
  }

  function wireCsvHeaderEvents() {
    if (!elements.csvHead) {
      return;
    }
    elements.csvHead.querySelectorAll(".header-button").forEach(button => {
      button.addEventListener("click", () => {
        const col = Number(button.dataset.col);
        if (Number.isNaN(col)) {
          return;
        }
        if (state.csvSort.column === col) {
          state.csvSort.direction = state.csvSort.direction === "asc" ? "desc" : "asc";
        } else {
          state.csvSort = { column: col, direction: "asc" };
        }
        renderCsvTable();
      });
    });
  }

  function wireCsvFilterInputs() {
    if (!elements.csvHead) {
      return;
    }
    elements.csvHead.querySelectorAll(".filter-input").forEach(input => {
      input.addEventListener("input", (event) => {
        const col = Number(event.target.dataset.filter);
        if (Number.isNaN(col)) {
          return;
        }
        state.csvFilters[col] = event.target.value;
        renderCsvTable();
      });
    });
  }

  function getFilteredCsvRows() {
    const rows = state.csvRows || [];
    if (!rows.length) {
      return { header: [], rows: [] };
    }
    const header = rows[0];
    let body = rows.slice(1);

    if (state.csvFilters.length) {
      body = body.filter(row => {
        return header.every((_, index) => {
          const filterValue = (state.csvFilters[index] || "").trim().toLowerCase();
          if (!filterValue) {
            return true;
          }
          return String(row[index] || "").toLowerCase().includes(filterValue);
        });
      });
    }

    if (state.csvSort.column !== null && state.csvSort.column < header.length) {
      const { column, direction } = state.csvSort;
      body = body.slice().sort((a, b) => {
        const aVal = a[column] || "";
        const bVal = b[column] || "";
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        let comparison;
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          comparison = aNum - bNum;
        } else {
          comparison = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
        }
        return direction === "asc" ? comparison : -comparison;
      });
    }

    return { header, rows: body };
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(current);
        current = "";
      } else if (char === "\n") {
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
      } else if (char === "\r") {
        continue;
      } else {
        current += char;
      }
    }
    if (current.length || row.length) {
      row.push(current);
      rows.push(row);
    }
    return rows.filter(entry => entry.length);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
