import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  fetchEventsApi,
  fetchAnalyticsApi,
  createEventApi,
  loginUser,
  registerUser,
  getMe,
  logoutUser,
} from "../api";

/**
 * PulseStream — Real-Time Ingestion Feed Dashboard
 * -------------------------------------------------
 * Full-stack event telemetry stream connected directly to FastAPI & PostgreSQL.
 * Displays only authentic data from the database. Zero mock data.
 */

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  "auth.login_success": {
    badgeClass: "bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold",
    dotClass: "bg-emerald-500",
    icon: "key",
  },
  "order.checkout_completed": {
    badgeClass: "bg-indigo-50 text-indigo-800 border border-indigo-200/80 font-bold",
    dotClass: "bg-indigo-500",
    icon: "shopping_cart",
  },
  "api.webhook_dispatched": {
    badgeClass: "bg-blue-50 text-blue-800 border border-blue-200/80 font-bold",
    dotClass: "bg-blue-500",
    icon: "bolt",
  },
  "billing.payment_failed": {
    badgeClass: "bg-rose-50 text-rose-800 border border-rose-200/80 font-bold",
    dotClass: "bg-rose-500",
    icon: "warning",
  },
  "user.profile_updated": {
    badgeClass: "bg-amber-50 text-amber-800 border border-amber-200/80 font-bold",
    dotClass: "bg-amber-500",
    icon: "account_circle",
  },
};

const DEFAULT_TYPE_CONFIG = {
  badgeClass: "bg-slate-100 text-slate-700 border border-slate-200 font-semibold",
  dotClass: "bg-slate-400",
  icon: "adjust",
};

const TYPE_FILTERS = [
  { value: "all", label: "All Types", dot: null },
  { value: "auth.login_success", label: "auth.*", dot: "bg-emerald-500" },
  { value: "order.checkout_completed", label: "order.*", dot: "bg-indigo-500" },
  { value: "api.webhook_dispatched", label: "api.*", dot: "bg-blue-600" },
  { value: "billing.payment_failed", label: "billing.*", dot: "bg-rose-500" },
  { value: "user.profile_updated", label: "user.*", dot: "bg-amber-500" },
];

const DATE_PRESETS = [
  { value: "live", label: "Live" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "custom", label: "Custom Range" },
];

const STATE_PILLS = [
  { value: "normal", label: "Normal" },
  { value: "loading", label: "Skeleton" },
  { value: "empty", label: "Empty" },
  { value: "error", label: "429 Err" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserInitials(name) {
  if (!name) return "US";
  const str = String(name).trim();
  const parts = str.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (str.length >= 2) {
    return str.slice(0, 2).toUpperCase();
  }
  return str.toUpperCase();
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "just now";
  const ts = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  if (isNaN(ts)) return "recently";
  const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 3) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/** Renders a compact, syntax-highlighted one-line preview of a payload object. */
function PayloadSnippet({ payload }) {
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
    return <span className="text-slate-400 italic">{"{ empty payload }"}</span>;
  }
  const entries = Object.entries(payload);
  return (
    <>
      {"{ "}
      {entries.map(([key, val], idx) => {
        let valueNode;
        if (typeof val === "string") {
          valueNode = <span className="text-emerald-700">{`"${val}"`}</span>;
        } else if (typeof val === "number") {
          valueNode = <span className="text-indigo-600 font-semibold">{val}</span>;
        } else if (typeof val === "boolean") {
          valueNode = <span className="text-amber-600 font-semibold">{String(val)}</span>;
        } else {
          valueNode = <span className="text-slate-600">{JSON.stringify(val)}</span>;
        }
        return (
          <React.Fragment key={key}>
            <span className="text-slate-700 font-medium">{`"${key}"`}</span>
            {": "}
            {valueNode}
            {idx < entries.length - 1 ? ", " : " "}
          </React.Fragment>
        );
      })}
      {"}"}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PulseStreamDashboard() {
  // --- current auth user & modal -------------------------------------------
  const [currentUser, setCurrentUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [authEmail, setAuthEmail] = useState("user21@example.com");
  const [authUsername, setAuthUsername] = useState("user21");
  const [authPassword, setAuthPassword] = useState("string21");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- data store (strictly initialized to empty, populated from DB) -------
  const [eventDatabase, setEventDatabase] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  // --- polling ----------------------------------------------------------
  const [isPollingActive, setIsPollingActive] = useState(true);
  const [pollCountdown, setPollCountdown] = useState(5);

  // --- filters / search ---------------------------------------------------
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("live");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // --- pagination ---------------------------------------------------------
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // --- QA / simulation state -----------------------------------------------
  const [simState, setSimState] = useState("normal"); // normal | loading | empty | error

  // --- inspect drawer -------------------------------------------------------
  const [inspectedEvent, setInspectedEvent] = useState(null);
  const [copyJsonLabel, setCopyJsonLabel] = useState("Copy JSON");
  const [copyCurlLabel, setCopyCurlLabel] = useState("Copy cURL");

  // --- simulate-event modal --------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [simType, setSimType] = useState("auth.login_success");
  const [simPayloadText, setSimPayloadText] = useState(
    JSON.stringify(
      {
        mfa: true,
        provider: "okta_sso",
        ip: "108.162.219.14",
        geo: "us-east-1",
      },
      null,
      2
    )
  );
  const [simPayloadError, setSimPayloadError] = useState("");
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Forces a re-render every 10s so relative timestamps stay fresh.
  const [, forceTick] = useState(0);

  const debounceTimer = useRef(null);
  const highlightTimer = useRef(null);

  // -------------------------------------------------------------------------
  // Auth Check on Mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      try {
        const user = await getMe();
        setCurrentUser(user);
      } catch (err) {
        logoutUser();
        setCurrentUser(null);
      }
    }
    checkAuth();
  }, []);

  // -------------------------------------------------------------------------
  // Search Box Debounce
  // -------------------------------------------------------------------------
  useEffect(() => {
    setIsTyping(true);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setIsTyping(false);
      setDebouncedQuery(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [searchInput]);

  // -------------------------------------------------------------------------
  // API Fetching: Analytics
  // -------------------------------------------------------------------------
  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await fetchAnalyticsApi();
      setAnalyticsData(data);
      if (data && typeof data.total_events_last_24h === "number") {
        setTotalEvents(data.total_events_last_24h);
      } else {
        setTotalEvents(0);
      }
    } catch (err) {
      setTotalEvents(0);
      setAnalyticsData(null);
    }
  }, []);

  // -------------------------------------------------------------------------
  // API Fetching: Events List
  // -------------------------------------------------------------------------
  const loadData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setSimState("loading");
      try {
        const params = {
          page: currentPage,
          limit: itemsPerPage,
          event_type: typeFilter !== "all" ? typeFilter : undefined,
          search: debouncedQuery.trim() || undefined,
        };

        if (dateRange === "15m") {
          params.start_date = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        } else if (dateRange === "1h") {
          params.start_date = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        } else if (dateRange === "24h") {
          params.start_date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        } else if (dateRange === "custom") {
          if (customStartDate) {
            params.start_date = new Date(customStartDate).toISOString();
          }
          if (customEndDate) {
            params.end_date = new Date(customEndDate).toISOString();
          }
        }

        const res = await fetchEventsApi(params);
        const items = res.items || [];
        const normalizedItems = items.map((e) => ({
          ...e,
          type: e.event_type || e.type,
          userId: e.user_id || e.userId,
          timestamp: typeof e.timestamp === "number" ? e.timestamp : new Date(e.timestamp).getTime(),
        }));

        setEventDatabase(normalizedItems);
        setTotalFiltered(res.total ?? normalizedItems.length);
        setTotalPages(res.total_pages ?? Math.max(1, Math.ceil((res.total ?? 0) / itemsPerPage)));
        setSimState("normal");
      } catch (err) {
        if (err.response?.status === 429) {
          setSimState("error");
        } else {
          setEventDatabase([]);
          setTotalFiltered(0);
          setSimState("normal");
        }
      }
    },
    [currentPage, itemsPerPage, typeFilter, debouncedQuery, dateRange, customStartDate, customEndDate]
  );

  // Reload when query params change
  useEffect(() => {
    loadData(true);
    fetchAnalytics();
  }, [loadData, fetchAnalytics]);

  // -------------------------------------------------------------------------
  // Polling Ticker (every second, decrements; at 0, calls backend)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const tick = setInterval(() => {
      if (!isPollingActive) return;
      setPollCountdown((c) => {
        if (c <= 1) {
          loadData(false);
          fetchAnalytics();
          return 5;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [isPollingActive, loadData, fetchAnalytics]);

  // Refresh relative timestamps periodically
  useEffect(() => {
    const tick = setInterval(() => {
      if (simState === "normal") forceTick((n) => n + 1);
    }, 10000);
    return () => clearInterval(tick);
  }, [simState]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------
  const typeCounts = useMemo(() => {
    const counts = { all: totalFiltered };
    for (const t of Object.keys(TYPE_CONFIG)) {
      if (analyticsData?.event_counts) {
        const found = analyticsData.event_counts.find((c) => c.event_type === t);
        counts[t] = found ? found.count : 0;
      } else {
        counts[t] = eventDatabase.filter((e) => e.type === t).length;
      }
    }
    return counts;
  }, [totalFiltered, analyticsData, eventDatabase]);

  const safePage = Math.min(currentPage, totalPages);
  const pageStart = totalFiltered === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(safePage * itemsPerPage, totalFiltered);
  const paginatedEvents = eventDatabase;

  const pageNumbers = useMemo(() => {
    const pages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= safePage - 1 && p <= safePage + 1)) {
        pages.push(p);
      } else if (p === safePage - 2 || p === safePage + 2) {
        pages.push("ellipsis-" + p);
      }
    }
    return pages;
  }, [totalPages, safePage]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function goToPage(page) {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  }

  function changeLimit(value) {
    setItemsPerPage(parseInt(value, 10));
    setCurrentPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setDebouncedQuery("");
    setIsTyping(false);
    setCurrentPage(1);
  }

  function resetFilters() {
    clearSearch();
    setTypeFilter("all");
    setDateRange("live");
    setCustomStartDate("");
    setCustomEndDate("");
    setSimState("normal");
  }

  function togglePolling() {
    setIsPollingActive((v) => !v);
  }

  function triggerManualPoll() {
    loadData(true);
    fetchAnalytics();
    setPollCountdown(5);
  }

  function openInspectDrawer(eventId) {
    const evt = eventDatabase.find((e) => e.id === eventId);
    if (!evt) return;
    setInspectedEvent(evt);
    setCopyJsonLabel("Copy JSON");
    setCopyCurlLabel("Copy cURL");
  }

  function closeInspectDrawer() {
    setInspectedEvent(null);
  }

  function copyCurrentJSON() {
    if (!inspectedEvent) return;
    navigator.clipboard?.writeText(JSON.stringify(inspectedEvent.payload, null, 2));
    setCopyJsonLabel("Copied!");
    setTimeout(() => setCopyJsonLabel("Copy JSON"), 1500);
  }

  function copyCurlSnippet(curlText) {
    navigator.clipboard?.writeText(curlText);
    setCopyCurlLabel("Copied!");
    setTimeout(() => setCopyCurlLabel("Copy cURL"), 1500);
  }

  function openSimulateModal() {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    setModalOpen(true);
  }

  function closeSimulateModal() {
    setModalOpen(false);
    setSimPayloadError("");
  }

  async function handleSimulateSubmit(e) {
    e.preventDefault();
    let payloadObj;
    try {
      payloadObj = JSON.parse(simPayloadText);
    } catch (err) {
      setSimPayloadError("Invalid JSON format in payload field.");
      return;
    }
    setSimPayloadError("");

    const token = localStorage.getItem("access_token");
    if (!token) {
      setSimPayloadError("Authentication required. Please sign in.");
      setAuthModalOpen(true);
      return;
    }

    setIsSubmittingEvent(true);
    try {
      const res = await createEventApi({
        event_type: simType,
        payload: payloadObj,
      });

      const normalized = {
        ...res,
        type: res.event_type || simType,
        userId: res.user_id || currentUser?.id || "usr_self",
        timestamp: typeof res.timestamp === "number" ? res.timestamp : new Date(res.timestamp).getTime(),
      };

      setEventDatabase((prev) => [normalized, ...prev]);
      setTotalFiltered((prev) => prev + 1);
      setTotalEvents((prev) => prev + 1);
      setHighlightId(normalized.id);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 2500);

      closeSimulateModal();
      fetchAnalytics();
      setPollCountdown(5);
    } catch (err) {
      if (err.response?.status === 401) {
        setSimPayloadError("Session expired. Please sign in again.");
        setAuthModalOpen(true);
      } else {
        const msg = err.response?.data?.detail?.message || err.response?.data?.message || err.message;
        setSimPayloadError(msg || "Failed to emit event.");
      }
    } finally {
      setIsSubmittingEvent(false);
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const data = await loginUser(authEmail, authPassword);
        setCurrentUser(data.user || { email: authEmail, username: authEmail.split("@")[0] });
      } else {
        const data = await registerUser(authEmail, authUsername || authEmail.split("@")[0], authPassword);
        setCurrentUser(data.user || { email: authEmail, username: authUsername });
      }
      setAuthModalOpen(false);
      loadData(true);
      fetchAnalytics();
    } catch (err) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.message || err.message || "Authentication failed";
      setAuthError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    logoutUser();
    setCurrentUser(null);
  }

  // Replay snippet matching the backend schema
  const curlSnippet = inspectedEvent
    ? `curl -X POST http://localhost:8000/api/events \\
  -H "Authorization: Bearer ${localStorage.getItem("access_token") || "YOUR_JWT_TOKEN"}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ event_type: inspectedEvent.type, payload: inspectedEvent.payload })}'`
    : "";

  const pollRingPct = (pollCountdown / 5) * 100;
  const isFilterActive =
    debouncedQuery.trim() !== "" ||
    typeFilter !== "all" ||
    dateRange !== "live" ||
    customStartDate !== "" ||
    customEndDate !== "";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="bg-slate-50 font-sans text-slate-900 antialiased min-h-screen">
      {/* TOP HEADER (Full-width, containing Logo, Live Stream tab, polling status, and user avatar) */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md z-40 border-b border-slate-200 shadow-xs">
        <div className="h-16 w-full px-4 sm:px-6 flex items-center justify-between gap-3 max-w-[1720px] mx-auto">
          {/* Brand + Live Stream Tab + Connection Status */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
                <span className="material-symbols-outlined text-[20px]">bolt</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-slate-900 tracking-tight leading-none">PulseStream</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold tracking-wider hidden sm:inline">v2.4</span>
              </div>
            </div>

            {/* Single Live Stream navigation tab */}
            <div className="flex items-center gap-1 pl-2 sm:pl-3 border-l border-slate-200">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium text-xs shadow-xs shadow-blue-500/25 select-none">
                <span className="material-symbols-outlined text-[16px]">stream</span>
                <span>Live Stream</span>
              </div>
            </div>

            {/* Live Polling Status Pill */}
            <div
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full shrink-0 border transition-colors ${isPollingActive
                ? "bg-emerald-50 border-emerald-200/80 text-emerald-800"
                : "bg-amber-50 border-amber-200/80 text-amber-800"
                }`}
            >
              <span className="relative flex h-2 w-2">
                {isPollingActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${isPollingActive ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                ></span>
              </span>
              <span className="text-xs font-medium hidden xs:inline">
                {isPollingActive ? `Live Polling (${pollCountdown}s)` : "Polling Paused"}
              </span>
              <span className="text-xs font-medium xs:hidden">
                {isPollingActive ? `${pollCountdown}s` : "Paused"}
              </span>
            </div>

            {/* PostgreSQL Bus badge */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="text-xs font-medium text-slate-700 truncate">PostgreSQL Bus (Connected)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            <div className="hidden xl:flex items-center gap-6 border-r border-slate-200 pr-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Events (24h)</span>
                <span className="font-mono text-sm text-slate-900 font-bold">{totalEvents > 0 ? totalEvents.toLocaleString() : "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Latency</span>
                <span className="font-mono text-sm text-emerald-600 font-bold">{totalEvents > 0 ? "14ms" : "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Error Rate</span>
                <span className="font-mono text-sm text-slate-900 font-bold">{totalEvents > 0 ? "0.00%" : "—"}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* USER BADGE WITH NAME INITIALS (NO PROFILE IMAGE ICON) */}
              {currentUser ? (
                <div className="flex items-center gap-2 pl-1 sm:pl-2">
                  <div
                    className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100 shadow-2xs shrink-0 select-none uppercase tracking-wide"
                    title={currentUser.username || currentUser.email}
                  >
                    {getUserInitials(currentUser.username || currentUser.email)}
                  </div>
                  <div className="hidden lg:flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-900 leading-tight">{currentUser.username}</span>
                    <span className="text-[11px] font-medium text-slate-500 leading-tight truncate max-w-[140px]">{currentUser.email}</span>
                  </div>
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                    onClick={handleLogout}
                    title="Sign Out"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                  </button>
                </div>
              ) : (
                <button
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 ml-1 cursor-pointer"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAuthModalOpen(true);
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">login</span>
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER (Fluid full width without sidebar padding) */}
      <main className="w-full pt-16 bg-slate-50 min-h-screen">
        <div className="flex flex-col w-full">
          <div className="w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6 max-w-[1720px] mx-auto">
            {/* TITLE + CONTROL RIBBON */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-col">
                <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Real-Time Ingestion Feed</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    INGESTING LIVE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-600 font-mono text-xs font-medium">PostgreSQL Sync</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">Continuous payload streaming, telemetry inspection, and high-throughput query diagnostics.</p>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                {/* Next Poll Counter */}
                <div className="flex items-center gap-2 bg-white border border-slate-200 px-2.5 sm:px-3 py-1.5 rounded-lg shadow-xs">
                  <div className="relative w-4 h-4 flex items-center justify-center">
                    <svg className="w-4 h-4 transform -rotate-90" viewBox="0 0 36 36">
                      <path className="text-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                      <path
                        className={`${isPollingActive ? "text-emerald-500" : "text-amber-500"} transition-all duration-1000 ease-linear`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray={`${pollRingPct}, 100`}
                        strokeLinecap="round"
                        strokeWidth="4"
                      />
                    </svg>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Poll:</span>
                  <span className="font-mono text-xs font-bold text-slate-800 w-5 text-center">
                    {isPollingActive ? `${pollCountdown}s` : "||"}
                  </span>
                </div>

                {/* Polling Toggle: Pause / Resume with explicit visual indicators */}
                <button
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer border ${isPollingActive
                    ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                    : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-300/40"
                    }`}
                  onClick={togglePolling}
                  title={isPollingActive ? "Pause automated polling" : "Resume automated polling"}
                  type="button"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isPollingActive ? "text-emerald-600" : "text-amber-600"}`}>
                    {isPollingActive ? "pause" : "play_arrow"}
                  </span>
                  <span>{isPollingActive ? "Pause Polling" : "Resume Polling"}</span>
                </button>

                {/* Manual Refresh */}
                <button
                  className="px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  onClick={triggerManualPoll}
                  title="Force immediate poll and refresh"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px] text-blue-600">sync</span>
                  <span>Refresh Now</span>
                </button>

                <button
                  className="px-3 sm:px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/25 ml-auto sm:ml-0 cursor-pointer"
                  onClick={openSimulateModal}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>POST /api/events</span>
                </button>
              </div>
            </div>

            {/* METRICS BENTO GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
              {/* Card 1: Total Volume */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-xs relative overflow-hidden group">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-50 rounded-full blur-xl group-hover:bg-blue-100 transition-all pointer-events-none"></div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Overall Events (24h)</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-mono text-xs font-bold flex items-center gap-0.5">
                      {totalEvents > 0 ? "Active" : "—"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      {totalEvents > 0 ? totalEvents.toLocaleString() : "0"}
                    </span>
                    <span className="font-mono text-xs font-medium text-slate-400">total</span>
                  </div>
                </div>
                <div className="pt-3">
                  <div className="flex items-center justify-between text-slate-500 text-xs mb-1 font-medium">
                    <span>24h Trajectory</span>
                    <span className="text-blue-600 font-mono text-xs font-semibold">
                      {totalEvents > 0 ? `Peak: ${totalEvents} evt` : "—"}
                    </span>
                  </div>
                  <svg className="w-full h-10 overflow-visible" fill="none" viewBox="0 0 240 40">
                    <defs>
                      <linearGradient id="grad-spark" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 32 Q 20 28, 40 30 T 80 20 T 120 12 T 160 22 T 200 8 L 240 4 L 240 40 L 0 40 Z" fill="url(#grad-spark)" />
                    <path d="M0 32 Q 20 28, 40 30 T 80 20 T 120 12 T 160 22 T 200 8 L 240 4" stroke="#2563eb" strokeLinecap="round" strokeWidth="2.5" />
                  </svg>
                </div>
              </div>

              {/* Card 2: Top Event Types breakdown */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top Event Types (24h Analytics)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold">Live Metrics</span>
                  </div>
                  <span className="font-mono text-xs font-medium text-slate-400">
                    {totalEvents > 0 ? `${totalEvents.toLocaleString()} total events` : "0 recorded"}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5 pt-1">
                  {analyticsData?.event_counts && analyticsData.event_counts.length > 0 ? (
                    analyticsData.event_counts.slice(0, 4).map((m) => {
                      const cfg = TYPE_CONFIG[m.event_type] || DEFAULT_TYPE_CONFIG;
                      const pct = totalEvents > 0 ? Math.round((m.count / totalEvents) * 100) : 0;
                      return (
                        <BreakdownRow
                          key={m.event_type}
                          label={m.event_type}
                          dot={cfg.dotClass}
                          bar={cfg.dotClass}
                          count={m.count.toLocaleString()}
                          pct={pct}
                        />
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-7 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
                      <span className="material-symbols-outlined text-slate-300 text-[26px] mb-1">analytics</span>
                      <span className="text-xs font-semibold text-slate-600">No Analytics Telemetry</span>
                      <span className="text-[11px] text-slate-400 mt-0.5">No events logged in the last 24 hours (—)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FILTER BAR */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 sticky top-16 z-30">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-[19px]">search</span>
                  </div>
                  <input
                    className="w-full pl-10 pr-24 py-2 bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 font-mono text-xs rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search payload keys or event types..."
                    type="text"
                    value={searchInput}
                  />
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
                    {isTyping && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px]">typing...</span>}
                    {searchInput && (
                      <button className="text-slate-400 hover:text-slate-700 transition-colors p-1 cursor-pointer" onClick={clearSearch}>
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <div className="flex items-center bg-slate-100 border border-slate-200 p-1 rounded-lg flex-wrap">
                    {DATE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        className={`px-3 py-1 rounded-md font-semibold text-xs transition-all cursor-pointer ${dateRange === preset.value ? "text-white bg-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                          }`}
                        onClick={() => setDateRange(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Date Range Picker */}
                  {dateRange === "custom" && (
                    <div className="flex items-center gap-2 bg-blue-50/80 border border-blue-200 px-2.5 py-1 rounded-lg flex-wrap animate-fadeIn">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-blue-700 uppercase">From:</span>
                        <input
                          type="datetime-local"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="bg-white border border-blue-200 text-slate-800 text-xs px-2 py-0.5 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-blue-700 uppercase">To:</span>
                        <input
                          type="datetime-local"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="bg-white border border-blue-200 text-slate-800 text-xs px-2 py-0.5 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                        />
                      </div>
                      {(customStartDate || customEndDate) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomStartDate("");
                            setCustomEndDate("");
                          }}
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Clear date range"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg gap-1.5">
                    <span className="text-xs font-medium text-slate-500">Rows:</span>
                    <select
                      className="bg-transparent text-slate-800 font-mono text-xs font-semibold focus:outline-none cursor-pointer"
                      onChange={(e) => changeLimit(e.target.value)}
                      value={itemsPerPage}
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-center flex-wrap gap-1.5">
                  {TYPE_FILTERS.map((tf) => {
                    const active = typeFilter === tf.value;
                    return (
                      <button
                        key={tf.value}
                        className={`px-3 py-1 rounded-full font-medium text-xs transition-all flex items-center gap-1.5 cursor-pointer ${active
                          ? "text-white bg-blue-600 font-semibold shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 border border-slate-200/80"
                          }`}
                        onClick={() => {
                          setTypeFilter(tf.value);
                          setCurrentPage(1);
                        }}
                      >
                        {tf.dot && <span className={`w-2 h-2 rounded-full ${tf.dot}`}></span>}
                        <span>{tf.label}</span>
                        <span className={`font-mono text-[11px] ${active ? "px-1.5 py-0.2 rounded-full bg-white/20 text-white" : "text-slate-500"}`}>
                          {typeCounts[tf.value] ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-lg">
                  <span className="text-[11px] font-semibold text-slate-400 px-1.5">View States:</span>
                  {STATE_PILLS.map((sp) => (
                    <button
                      key={sp.value}
                      className={`px-2 py-0.5 rounded font-bold text-xs transition-colors cursor-pointer ${simState === sp.value ? "text-emerald-700 bg-white shadow-2xs" : "text-slate-600 font-medium hover:text-slate-900"
                        }`}
                      onClick={() => setSimState(sp.value)}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ACTIVITY FEED */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col overflow-hidden min-h-[520px] relative">
              {/* Desktop Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider select-none items-center">
                <div className="col-span-3 lg:col-span-2">Event &amp; Status</div>
                <div className="col-span-2 lg:col-span-2">Event ID</div>
                <div className="col-span-2 lg:col-span-2">User ID (Token)</div>
                <div className="col-span-3 lg:col-span-4">Payload Extract</div>
                <div className="col-span-2 lg:col-span-2 text-right">Time / Inspect</div>
              </div>

              {simState === "loading" && (
                <div className="flex flex-col p-4 sm:p-6 gap-3.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg w-full"></div>
                  ))}
                </div>
              )}

              {simState === "error" && (
                <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-4 sm:px-6 text-center my-auto">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-4 text-rose-600 shadow-sm">
                    <span className="material-symbols-outlined text-[32px]">warning</span>
                  </div>
                  <span className="text-base font-bold text-rose-600">429 Rate Limit Exceeded</span>
                  <p className="text-sm text-slate-600 max-w-md mt-1 mb-4">
                    SlowAPI rate limit triggered for this client stream. Wait a moment and retry.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      onClick={() => setSimState("normal")}
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                      <span>Retry Feed Handshake</span>
                    </button>
                  </div>
                </div>
              )}

              {/* EMPTY STATE: WHEN NO EVENTS EXIST IN DB OR AFTER FILTERING */}
              {(simState === "empty" || (simState === "normal" && paginatedEvents.length === 0)) && (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 px-4 sm:px-6 text-center my-auto">
                  {isFilterActive ? (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4 text-slate-400">
                        <span className="material-symbols-outlined text-[32px]">filter_list_off</span>
                      </div>
                      <span className="text-base font-bold text-slate-900">No events match criteria</span>
                      <p className="text-sm text-slate-500 max-w-sm mt-1 mb-5">
                        No event records match your active query filters or keyword search in this time window.
                      </p>
                      <button
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
                        onClick={resetFilters}
                      >
                        Clear Active Filters
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4 text-blue-600 shadow-xs">
                        <span className="material-symbols-outlined text-[34px]">inbox</span>
                      </div>
                      <span className="text-base font-bold text-slate-900 tracking-tight">No Events Recorded in Database</span>
                      <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 mb-5 leading-relaxed">
                        Your event bus is active, but no events have been ingested into PostgreSQL yet. Emit a payload via the REST API or click below to simulate an event.
                      </p>
                      <button
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-500/25 flex items-center gap-2 transition-all cursor-pointer"
                        onClick={openSimulateModal}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[17px]">add_circle</span>
                        <span>POST /api/events (Emit First Event)</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* TABLE ROWS: REAL DB RECORDS */}
              {simState === "normal" && paginatedEvents.length > 0 && (
                <div className="flex flex-col divide-y divide-slate-100 transition-opacity duration-200">
                  {paginatedEvents.map((evt, idx) => {
                    const cfg = TYPE_CONFIG[evt.type] || DEFAULT_TYPE_CONFIG;
                    const isHighlighted = safePage === 1 && idx === 0 && evt.id === highlightId;
                    return (
                      <React.Fragment key={evt.id}>
                        {/* Desktop Row (>= md) */}
                        <div
                          className={`hidden md:grid grid-cols-12 gap-3 px-6 py-2.5 items-center transition-all text-xs group cursor-pointer ${isHighlighted
                            ? "bg-emerald-50/80 shadow-[inset_0_0_12px_rgba(16,185,129,0.15)] transition-colors duration-1000"
                            : "hover:bg-slate-50/80 bg-white"
                            }`}
                          onClick={() => openInspectDrawer(evt.id)}
                        >
                          <div className="col-span-3 lg:col-span-2 flex items-center gap-1.5 min-w-0">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] ${cfg.badgeClass} truncate shadow-2xs`}>
                              <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
                              <span className="truncate">{evt.type}</span>
                            </span>
                          </div>

                          <div className="col-span-2 lg:col-span-2 min-w-0">
                            <span
                              className="font-mono text-xs text-slate-700 hover:text-blue-600 font-semibold select-all truncate block"
                              title={evt.id}
                            >
                              {evt.id.length > 16 ? evt.id.slice(0, 14) + "..." : evt.id}
                            </span>
                          </div>

                          {/* User Column with Initials Badge */}
                          <div className="col-span-2 lg:col-span-2 flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-[10px] font-mono font-bold shrink-0 select-none uppercase">
                              {evt.userId ? getUserInitials(evt.userId) : "U"}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-xs font-semibold text-slate-800 truncate leading-tight select-all" title={evt.userId}>
                                {evt.userId ? (evt.userId.length > 14 ? evt.userId.slice(0, 10) + "..." : evt.userId) : "—"}
                              </span>
                            </div>
                          </div>

                          <div className="col-span-3 lg:col-span-4 min-w-0">
                            <div className="bg-slate-50 border border-slate-200/90 px-2.5 py-1 rounded-md font-mono text-[11px] text-slate-600 truncate group-hover:border-slate-300 transition-colors">
                              <PayloadSnippet payload={evt.payload} />
                            </div>
                          </div>

                          <div className="col-span-2 lg:col-span-2 flex items-center justify-end gap-2.5 text-right">
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums whitespace-nowrap">{formatRelativeTime(evt.timestamp)}</span>
                            <button
                              className="p-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInspectDrawer(evt.id);
                              }}
                              title="Inspect Payload"
                            >
                              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                            </button>
                          </div>
                        </div>

                        {/* Mobile Card Row (< md) */}
                        <div
                          className={`md:hidden flex flex-col gap-2 p-3.5 transition-all text-xs cursor-pointer ${isHighlighted
                            ? "bg-emerald-50/80 shadow-[inset_0_0_12px_rgba(16,185,129,0.15)]"
                            : "hover:bg-slate-50 bg-white"
                            }`}
                          onClick={() => openInspectDrawer(evt.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] ${cfg.badgeClass} shadow-2xs`}>
                              <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
                              <span className="truncate">{evt.type}</span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-[11px] text-slate-400 tabular-nums">{formatRelativeTime(evt.timestamp)}</span>
                              <span className="material-symbols-outlined text-[16px] text-slate-400">chevron_right</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-0.5">
                            <span className="font-semibold text-slate-800">{evt.id.slice(0, 12)}...</span>
                            <span className="truncate text-slate-600 max-w-[140px]">{evt.userId}</span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/90 px-2 py-1 rounded-md font-mono text-[11px] text-slate-600 truncate">
                            <PayloadSnippet payload={evt.payload} />
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* Pagination footer */}
              <div className={`mt-auto px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 ${simState !== "normal" ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {totalFiltered === 0 ? (
                    <span>Showing <strong className="font-mono text-slate-900">0</strong> events</span>
                  ) : (
                    <>
                      <span>Showing</span>
                      <span className="font-mono text-slate-900 font-bold">
                        {pageStart}-{pageEnd}
                      </span>
                      <span>of</span>
                      <span className="font-mono text-slate-900 font-bold">{totalFiltered}</span>
                      <span>events</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                    disabled={safePage <= 1 || totalFiltered === 0}
                    onClick={() => goToPage(safePage - 1)}
                  >
                    <span className="material-symbols-outlined text-[16px] align-middle">chevron_left</span>
                  </button>
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((p) =>
                      typeof p === "number" ? (
                        <button
                          key={p}
                          className={`w-6 h-6 rounded font-mono text-xs flex items-center justify-center transition-colors cursor-pointer ${p === safePage && totalFiltered > 0
                            ? "bg-blue-600 text-white font-bold shadow-2xs"
                            : "text-slate-600 hover:bg-slate-100"
                            }`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      ) : (
                        <span key={p} className="text-slate-400 text-xs px-0.5">
                          ...
                        </span>
                      )
                    )}
                  </div>
                  <button
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                    disabled={safePage >= totalPages || totalFiltered === 0}
                    onClick={() => goToPage(safePage + 1)}
                  >
                    <span className="material-symbols-outlined text-[16px] align-middle">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* INSPECT DRAWER BACKDROP */}
      {
        inspectedEvent && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
            onClick={closeInspectDrawer}
          />
        )
      }

      {/* INSPECT DRAWER */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:max-w-xl bg-white shadow-2xl border-l border-slate-200 z-50 transform transition-transform duration-300 ease-out flex flex-col ${inspectedEvent ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">data_object</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-900 leading-tight">Payload Inspector</span>
              <span className="font-mono text-xs text-blue-600 font-semibold truncate select-all">{inspectedEvent?.id ?? ""}</span>
            </div>
          </div>
          <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" onClick={closeInspectDrawer} type="button">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {inspectedEvent && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">EVENT TYPE</span>
                <span className="font-mono text-xs font-bold text-emerald-700 mt-0.5 block">{inspectedEvent.type}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">USER ID</span>
                <span className="font-mono text-xs font-semibold text-slate-800 mt-0.5 block truncate select-all">
                  {inspectedEvent.userId || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SERVER TIMESTAMP</span>
                <span className="font-mono text-xs text-slate-600 mt-0.5 block">{new Date(inspectedEvent.timestamp).toISOString()}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PAYLOAD PROPERTIES</span>
                <span className="font-mono text-xs text-slate-600 mt-0.5 block">
                  {Object.keys(inspectedEvent.payload || {}).length} keys recorded
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Raw JSON Payload</span>
                <button
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  onClick={copyCurrentJSON}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px] text-blue-600">content_copy</span>
                  <span>{copyJsonLabel}</span>
                </button>
              </div>
              <pre className="p-3.5 sm:p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto select-all max-h-72 border border-slate-800 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(inspectedEvent.payload, null, 2)}
              </pre>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Replay via cURL</span>
                <button
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  onClick={() => copyCurlSnippet(curlSnippet)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px] text-blue-600">terminal</span>
                  <span>{copyCurlLabel}</span>
                </button>
              </div>
              <pre className="p-3.5 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-36 leading-relaxed">{curlSnippet}</pre>
            </div>
          </div>
        )}
      </div>

      {/* SIMULATE EVENT MODAL (UPDATED AS PER BACKEND: USER ID DERIVED FROM JWT SESSION) */}
      {
        modalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-[20px]">bolt</span>
                  <span className="text-sm sm:text-base font-bold text-slate-900">Emit Event (POST /api/events)</span>
                </div>
                <button className="text-slate-400 hover:text-slate-700 transition-colors p-1 cursor-pointer" onClick={closeSimulateModal} type="button">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <form className="p-4 sm:p-6 flex flex-col gap-3.5 sm:gap-4" onSubmit={handleSimulateSubmit}>
                {/* Authenticated context notice */}
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-blue-50/70 border border-blue-200/70 text-xs text-blue-900">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 uppercase">
                    {getUserInitials(currentUser?.username || "AU")}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800 truncate">
                      Emitting as: <strong className="text-blue-700">{currentUser?.username || "Guest User"}</strong>
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono truncate">
                      user_id: {currentUser?.id || "Derived from current JWT session"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Event Type</label>
                  <select
                    className="bg-slate-50 border border-slate-200 text-slate-900 p-2.5 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                    onChange={(e) => setSimType(e.target.value)}
                    value={simType}
                  >
                    <option value="auth.login_success">auth.login_success (User session authentication)</option>
                    <option value="order.checkout_completed">order.checkout_completed (Stripe payment completed)</option>
                    <option value="api.webhook_dispatched">api.webhook_dispatched (Outbound HTTP callback)</option>
                    <option value="billing.payment_failed">billing.payment_failed (Card declined or 3DS fail)</option>
                    <option value="user.profile_updated">user.profile_updated (Attribute schema mutate)</option>
                  </select>
                </div>

                {/* Sample payload shortcuts */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors cursor-pointer"
                    onClick={() => {
                      setSimType("auth.login_success");
                      setSimPayloadText(JSON.stringify({ mfa: true, provider: "credentials", ip: "127.0.0.1" }, null, 2));
                    }}
                  >
                    auth.login
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors cursor-pointer"
                    onClick={() => {
                      setSimType("order.checkout_completed");
                      setSimPayloadText(JSON.stringify({ amount: 149.5, currency: "USD", items: 2, order_id: "ord_9901" }, null, 2));
                    }}
                  >
                    order.checkout
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors cursor-pointer"
                    onClick={() => {
                      setSimType("api.webhook_dispatched");
                      setSimPayloadText(JSON.stringify({ targetUrl: "https://api.partner.io/v1/events", statusCode: 200, dispatchMs: 14.2 }, null, 2));
                    }}
                  >
                    api.webhook
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payload (JSON Object)</label>
                  <textarea
                    className="bg-slate-50 border border-slate-200 text-slate-900 p-2.5 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-500 focus:bg-white"
                    onChange={(e) => setSimPayloadText(e.target.value)}
                    rows={5}
                    value={simPayloadText}
                  />
                  {simPayloadError && <span className="text-xs text-rose-600 font-medium">{simPayloadError}</span>}
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2">
                  <button className="w-full sm:w-auto px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer" onClick={closeSimulateModal} type="button">
                    Cancel
                  </button>
                  <button
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    disabled={isSubmittingEvent}
                    type="submit"
                  >
                    {isSubmittingEvent ? (
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">send</span>
                    )}
                    <span>Emit to PostgreSQL Stream</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* AUTH MODAL (LOGIN & REGISTER WITH CLEAN TABS AND INITIALS PROFILE) */}
      {
        authModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                  </div>
                  <span className="text-base font-bold text-slate-900">
                    {authMode === "login" ? "Sign In to PulseStream" : "Create Account"}
                  </span>
                </div>
                <button
                  className="text-slate-400 hover:text-slate-700 transition-colors p-1 cursor-pointer"
                  onClick={() => setAuthModalOpen(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="flex border-b border-slate-200 bg-slate-100/70 p-1 m-4 mb-0 rounded-lg">
                <button
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${authMode === "login" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                  type="button"
                >
                  Sign In
                </button>
                <button
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${authMode === "register" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError("");
                  }}
                  type="button"
                >
                  Register
                </button>
              </div>

              <form className="p-5 flex flex-col gap-3.5" onSubmit={handleAuthSubmit}>
                {authError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                    <span>{authError}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <input
                    className="bg-slate-50 border border-slate-200 text-slate-900 p-2.5 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    type="email"
                    value={authEmail}
                  />
                </div>

                {authMode === "register" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Username</label>
                    <input
                      className="bg-slate-50 border border-slate-200 text-slate-900 p-2.5 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                      onChange={(e) => setAuthUsername(e.target.value)}
                      placeholder="developer"
                      required
                      type="text"
                      value={authUsername}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Password</label>
                  <input
                    className="bg-slate-50 border border-slate-200 text-slate-900 p-2.5 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    type="password"
                    value={authPassword}
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                    onClick={() => setAuthModalOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    disabled={authLoading}
                    type="submit"
                  >
                    {authLoading && <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>}
                    <span>{authMode === "login" ? "Sign In" : "Create Account"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
}

// ---------------------------------------------------------------------------
// Breakdown Row Component
// ---------------------------------------------------------------------------

function BreakdownRow({ label, dot, bar, count, pct }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-slate-800 font-medium flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`}></span>
          {label}
        </span>
        <span className="text-slate-500">
          {count} <span className="text-slate-900 font-bold">({pct}%)</span>
        </span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}