const SHEET_ID = "1kVhHgGniXLDvcvAbAK_XFrVWa_bQWg_NBSJd8tuzKdI";
const MAIN_GID = "0";
const DETAIL_GID = "39509448";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7dvT2ZBVZTHRvB3czQO4w9sIXMB7Vgkn6fplLqeY4BQxedp1FfwqdmhnGfTSOxGEjmg/exec?mode=dashboard";

const REQUIRED_MAIN_COLUMNS = ["STATUS", "Location", "OWNER"];
const OUT_DETAIL_COLUMNS = ["low power", "RF1", "RF2", "FW"];
const IN_DETAIL_COLUMNS = ["FW"];
const EQUIPMENT_ID_COLUMNS = [
  "Equipment ID",
  "EquipmentID",
  "Tool ID",
  "ToolID",
  "Device ID",
  "DeviceID",
  "EQP ID",
  "EQPID",
  "EQ ID",
  "EQID",
  "BMS ID",
  "BMSID",
  "ID",
  "Serial",
  "S/N",
  "SN",
  "Barcode",
  "Asset",
  "장비 ID",
  "장비ID",
  "설비 ID",
  "설비ID",
  "자산번호",
  "호기",
];

const state = {
  cards: [],
  filteredStatus: "all",
  search: "",
  timer: null,
};

const fallbackMainRows = [
  { Equipment: "BMS-4000-C1", STATUS: "OUT", Location: "R&D LAB", OWNER: "서종근" },
  { Equipment: "BMS-4000-C2", STATUS: "IN", Location: "PRODUCTION", OWNER: "생산팀" },
  { Equipment: "BMS-5000-A1", STATUS: "OUT", Location: "QA ROOM", OWNER: "품질팀" },
];

const fallbackDetailRows = [
  { Equipment: "BMS-4000-C1", "low power": "REPAIR", RF1: "CHECK", RF2: "PASS", FW: "1.0.8" },
  { Equipment: "BMS-4000-C2", "low power": "", RF1: "", RF2: "", FW: "1.1.2" },
  { Equipment: "BMS-5000-A1", "low power": "LOW", RF1: "FAIL", RF2: "CHECK", FW: "0.9.7" },
];

const els = {
  totalCount: document.querySelector("#totalCount"),
  readyCount: document.querySelector("#readyCount"),
  outCount: document.querySelector("#outCount"),
  repairCount: document.querySelector("#repairCount"),
  updatedAt: document.querySelector("#updatedAt"),
  cardGrid: document.querySelector("#cardGrid"),
  statusFilters: document.querySelector("#statusFilters"),
  searchInput: document.querySelector("#searchInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  fullscreenBtn: document.querySelector("#fullscreenBtn"),
  intervalSelect: document.querySelector("#intervalSelect"),
  notice: document.querySelector("#notice"),
};

function normalizeKey(value) {
  return String(value || "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

function getStatus(value) {
  return String(value || "").trim().toUpperCase() || "-";
}

function statusGroup(status) {
  const normalized = normalizeKey(status);
  if (normalized === "ok" || normalized === "in") return "READY";
  return status;
}

function statusClass(status) {
  const normalized = normalizeKey(statusGroup(status));
  if (normalized === "out") return "status-out";
  if (normalized === "repair") return "status-repair";
  if (normalized === "ready") return "status-ok";
  return "status-other";
}

function displayStatus(status) {
  return statusGroup(status);
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "object" && "v" in value) return String(value.f ?? value.v ?? "").trim();
  return String(value).trim();
}

function rowsFromGviz(payload) {
  const headers = payload.table.cols.map((col, index) => col.label || `Column ${index + 1}`);
  return payload.table.rows
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = asText(row.c[index]);
      });
      return item;
    })
    .filter((row) => Object.values(row).some(Boolean));
}

function loadSheet(gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `handleSheet_${gid}_${Date.now()}`;
    const script = document.createElement("script");
    const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
    url.searchParams.set("gid", gid);
    url.searchParams.set("tqx", `out:json;responseHandler:${callbackName}`);

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("시트 응답 시간이 초과되었습니다."));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (payload.status === "error") {
        reject(new Error(payload.errors?.[0]?.detailed_message || "시트를 읽을 수 없습니다."));
        return;
      }
      resolve(rowsFromGviz(payload));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("구글시트 연결에 실패했습니다."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function loadAppsScriptDashboard() {
  return new Promise((resolve, reject) => {
    const callbackName = `handleDashboard_${Date.now()}`;
    const script = document.createElement("script");
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("callback", callbackName);

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script 응답 시간이 초과되었습니다."));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.ok === false) {
        reject(new Error(payload?.error || "Apps Script 데이터를 읽을 수 없습니다."));
        return;
      }

      resolve({
        mainRows: payload.mainRows || payload.main || [],
        detailRows: payload.detailRows || payload.detail || [],
      });
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Apps Script 연결에 실패했습니다."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function loadDashboardRows() {
  if (APPS_SCRIPT_URL) return loadAppsScriptDashboard();
  const [mainRows, detailRows] = await Promise.all([loadSheet(MAIN_GID), loadSheet(DETAIL_GID)]);
  return { mainRows, detailRows };
}

function findColumn(row, candidates) {
  const keys = Object.keys(row || {});
  const normalizedCandidates = candidates.map(normalizeKey);
  return (
    keys.find((key) => normalizedCandidates.includes(normalizeKey(key))) ||
    keys.find((key) => normalizedCandidates.some((candidate) => normalizeKey(key).includes(candidate))) ||
    ""
  );
}

function pickValue(row, candidates) {
  const column = findColumn(row, candidates);
  return column ? row[column] : "";
}

function pickFields(row, columns) {
  return columns.reduce((acc, column) => {
    acc[column] = pickValue(row, [column]);
    return acc;
  }, {});
}

function pickEquipmentId(row, index) {
  const idValue = pickValue(row, EQUIPMENT_ID_COLUMNS);
  if (idValue) return idValue;

  const excluded = new Set(REQUIRED_MAIN_COLUMNS.map(normalizeKey));
  const fallbackKeys = Object.keys(row || {}).filter((key) => !excluded.has(normalizeKey(key)) && row[key]);
  const idLikeColumn = fallbackKeys.find((key) => /[a-z]{2,}[-_]?\d|bms|eqp|tool|device/i.test(row[key]));
  if (idLikeColumn) return row[idLikeColumn];

  const fallbackColumn = fallbackKeys[0];
  return fallbackColumn ? row[fallbackColumn] : `EQUIPMENT ${index + 1}`;
}

function findJoinColumn(mainRows, detailRows) {
  const preferred = EQUIPMENT_ID_COLUMNS;

  for (const candidate of preferred) {
    const mainColumn = findColumn(mainRows[0], [candidate]);
    const detailColumn = findColumn(detailRows[0], [candidate]);
    if (mainColumn && detailColumn) return { mainColumn, detailColumn };
  }

  return null;
}

function buildCards(mainRows, detailRows) {
  const join = findJoinColumn(mainRows, detailRows);
  const detailByKey = new Map();

  if (join) {
    detailRows.forEach((row) => {
      const key = normalizeKey(row[join.detailColumn]);
      if (key) detailByKey.set(key, row);
    });
  }

  return mainRows.map((row, index) => {
    const status = getStatus(pickValue(row, ["STATUS", "상태"]));
    const isOut = status === "OUT";
    const detailRow = join ? detailByKey.get(normalizeKey(row[join.mainColumn])) || detailRows[index] || {} : detailRows[index] || {};
    const fields = pickFields(row, REQUIRED_MAIN_COLUMNS);
    const equipmentId = pickEquipmentId(row, index);
    const detailColumns = isOut ? OUT_DETAIL_COLUMNS : IN_DETAIL_COLUMNS;

    return {
      id: `${equipmentId}-${index}`,
      title: equipmentId,
      status,
      isOut,
      location: fields.Location,
      owner: fields.OWNER,
      details: pickFields(detailRow, detailColumns),
    };
  });
}

function getFilteredCards() {
  return state.cards.filter((card) => {
    const statusMatch = state.filteredStatus === "all" || statusGroup(card.status) === state.filteredStatus;
    const searchPool = [
      card.title,
      card.status,
      card.location,
      card.owner,
      ...Object.values(card.details),
    ]
      .join(" ")
      .toLowerCase();
    const searchMatch = !state.search || searchPool.includes(state.search.toLowerCase());
    return statusMatch && searchMatch;
  });
}

function getEquipmentGroup(title) {
  const value = String(title || "").trim();
  return value.replace(/-[A-Z]?\d+$/i, "") || "ETC";
}

function compareEquipment(a, b) {
  return String(a.title).localeCompare(String(b.title), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function groupCards(cards) {
  const groups = new Map();
  cards.slice().sort(compareEquipment).forEach((card) => {
    const groupName = getEquipmentGroup(card.title);
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(card);
  });

  return Array.from(groups.entries()).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function updateMetrics() {
  const counts = state.cards.reduce((acc, card) => {
    const key = normalizeKey(statusGroup(card.status));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  els.totalCount.textContent = state.cards.length;
  els.readyCount.textContent = counts.ready || 0;
  els.outCount.textContent = counts.out || 0;
  els.repairCount.textContent = counts.repair || 0;
  els.updatedAt.textContent = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderFilters() {
  const statusCounts = state.cards.reduce((acc, card) => {
    const label = statusGroup(card.status);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const filters = [
    { key: "all", label: `ALL ${state.cards.length}` },
    ...Object.entries(statusCounts).map(([status, count]) => ({ key: status, label: `${displayStatus(status)} ${count}` })),
  ];

  els.statusFilters.innerHTML = filters
.map((filter) => `<button class="segment ${state.filteredStatus === filter.key ? "active" : ""}" data-status="${filter.key}" type="button">${filter.label}</button>`)
    .join("");
}

function renderCards() {
  const cards = getFilteredCards();
  els.cardGrid.innerHTML = groupCards(cards)
    .map(([groupName, groupCards]) => `
      <section class="equipment-group">
        <h2 class="group-title">${escapeHtml(groupName)}</h2>
        <div class="equipment-board">
          ${groupCards.map(renderCard).join("")}
        </div>
      </section>
    `)
    .join("");
}

function renderCard(card) {
  const detailItems = Object.entries(card.details)
    .filter(([, value]) => value)
    .map(([label, value]) => `<span class="detail-chip"><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>`)
    .join("");

  return `
    <article class="equipment-card ${statusClass(card.status)}">
      <div class="card-head">
        <h3>${escapeHtml(card.title)}</h3>
        <span class="status-pill">${escapeHtml(displayStatus(card.status))}</span>
      </div>
      <dl class="basic-info">
        <div><dt>STATUS</dt><dd>${escapeHtml(displayStatus(card.status))}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(card.location || "-")}</dd></div>
        <div><dt>OWNER</dt><dd>${escapeHtml(card.owner || "-")}</dd></div>
      </dl>
      <div class="detail-list">${detailItems || `<span class="detail-chip muted">FW -</span>`}</div>
    </article>
  `;
}

function render() {
  updateMetrics();
  renderFilters();
  renderCards();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setNotice(message, isVisible = true) {
  els.notice.textContent = message;
  els.notice.classList.toggle("hidden", !isVisible);
}

async function refreshData() {
  try {
    setNotice("", false);
    const { mainRows, detailRows } = await loadDashboardRows();
    state.cards = buildCards(mainRows, detailRows);
    if (!state.cards.length) {
      state.cards = buildCards(fallbackMainRows, fallbackDetailRows);
      setNotice("시트에 표시할 행이 없어 예시 데이터로 표시 중입니다.");
    }
  } catch (error) {
    state.cards = buildCards(fallbackMainRows, fallbackDetailRows);
    setNotice(`시트를 바로 읽지 못해 예시 데이터로 표시 중입니다. Apps Script URL이나 구글시트 공유/배포 설정을 확인해주세요. (${error.message})`);
  }
  render();
}

function scheduleRefresh() {
  window.clearInterval(state.timer);
  state.timer = window.setInterval(refreshData, Number(els.intervalSelect.value));
}

els.refreshBtn.addEventListener("click", refreshData);
els.intervalSelect.addEventListener("change", scheduleRefresh);
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  renderCards();
});
els.statusFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  state.filteredStatus = button.dataset.status;
  renderFilters();
  renderCards();
});
els.fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  document.documentElement.requestFullscreen();
});

refreshData();
scheduleRefresh();
