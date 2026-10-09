"use client";

import { useState, useEffect, useMemo, createContext, useContext } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CalendarDayButton } from "@/components/ui/calendar";
import HangingBanners from "@/components/HangingBanners";
import LoginForm from "@/components/LoginForm";
import { ApiError, getMe, logout, getUpdates, saveUpdate, deleteUpdate, getResources, createResource, deleteResource, deleteMedia, uploadMedia, toDateStr, type DailyUpdate, type Resource } from "@/lib/api";

const Calendar = dynamic(
  () => import("@/components/ui/calendar").then((m) => m.Calendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-72">
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "#F0B8CF", borderTopColor: "transparent" }} />
      </div>
    ),
  }
);

const VideoRecorder = dynamic(() => import("@/components/VideoRecorder"), { ssr: false });
const VoiceRecorder = dynamic(() => import("@/components/VoiceRecorder"), { ssr: false });

type Tab = "tracklist" | "resources";

// Saved entries by YYYY-MM-DD, shared with the calendar's day cells.
const EntriesContext = createContext<Record<string, DailyUpdate>>({});

const NOTE_GRADS = [
  "linear-gradient(145deg, #FFF4F9 0%, #FFD6E7 100%)",
  "linear-gradient(145deg, #F5F0FF 0%, #E8D5FF 100%)",
  "linear-gradient(145deg, #FFF8F0 0%, #FFE8CC 100%)",
  "linear-gradient(145deg, #F0FAFF 0%, #CCF0FF 100%)",
  "linear-gradient(145deg, #F5FFF0 0%, #CCFFDD 100%)",
];
const NOTE_BORDERS = ["#F5B5CF", "#C8A0E8", "#FFB870", "#80D0E0", "#80E0A0"];
const NOTE_SHADOWS = [
  "rgba(232,71,138,0.18)", "rgba(147,100,200,0.18)", "rgba(255,140,60,0.18)",
  "rgba(60,180,200,0.18)", "rgba(60,180,100,0.18)",
];
const NOTE_TEXT_COLORS = ["#7A1F4A", "#4A1A7A", "#7A3A0A", "#0A4A6A", "#0A5A2A"];
const WASHI_PATTERNS = [
  "repeating-linear-gradient(135deg, rgba(232,71,138,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(147,100,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(255,160,80,0.5) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(80,180,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(60,180,100,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
];
const TILTS = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-3", "rotate-3"];

/** Day cell: the normal date button plus a sticky note showing what was learned that day. */
function DayWithNote(props: React.ComponentProps<typeof CalendarDayButton>) {
  const entries = useContext(EntriesContext);
  const key = toDateStr(props.day.date);
  const entry = entries[key];
  const text = entry?.what_i_learned.trim();
  const d = props.day.date.getDate();
  const ci = d % 5;
  const tilt = TILTS[d % TILTS.length];

  return (
    <>
      <CalendarDayButton {...props} />
      {entry && text && (
        <div
          className="hidden md:block absolute inset-x-1 bottom-1 z-20 cursor-pointer"
          style={{ top: "3.2rem" }}
          title={text}
          onClick={(e) => (e.currentTarget.previousElementSibling as HTMLButtonElement | null)?.click()}
        >
          <div
            className={`relative h-full overflow-hidden rounded-xl px-2 pt-2.5 pb-1 transition-all duration-200 hover:rotate-0 hover:scale-105 hover:shadow-lg ${tilt}`}
            style={{
              background: NOTE_GRADS[ci],
              border: `1px solid ${NOTE_BORDERS[ci]}`,
              boxShadow: `0 3px 10px ${NOTE_SHADOWS[ci]}`,
            }}
          >
            {/* washi tape */}
            <span
              aria-hidden
              className="absolute -top-0.5 left-1/2 h-2 w-8 -translate-x-1/2 rotate-2 rounded-sm"
              style={{ background: WASHI_PATTERNS[ci] }}
            />
            <p
              className="font-playfair italic font-semibold leading-snug line-clamp-3"
              style={{ fontSize: "0.68rem", color: NOTE_TEXT_COLORS[ci], wordBreak: "break-word" }}
            >
              {text}
            </p>
            <span className="absolute bottom-0.5 right-1.5 text-[0.7rem] leading-none" aria-hidden>
              {entry.video_url ? "🎬" : ""}{entry.voice_note_url ? "🎙️" : ""}{!entry.video_url && !entry.voice_note_url ? "✨" : ""}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/** Turns something typed in "Resources Used" into a library entry (a link if it looks like one, else just a title). */
function resourceFromItem(item: string) {
  const text = item.trim();
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
  if (!looksLikeUrl) return { title: text, url: "", category: "Other", emoji: "📚" };
  const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let host = text;
  try { const u = new URL(url); host = (u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname)).slice(0, 50); } catch {}
  const l = url.toLowerCase();
  const [category, emoji] =
    /youtube\.com|youtu\.be|vimeo\./.test(l) ? ["Video", "🎬"] :
    /udemy|coursera|edx|skillshare/.test(l) ? ["Course", "🎓"] :
    /docs\.|documentation|\.dev|developer\./.test(l) ? ["Documentation", "📖"] :
    /podcast|spotify|anchor\.fm/.test(l) ? ["Podcast", "🎧"] :
    ["Article", "📰"];
  return { title: host, url, category, emoji };
}

const sameResource = (r: Resource, item: ReturnType<typeof resourceFromItem>) =>
  item.url ? r.url.toLowerCase() === item.url.toLowerCase() : r.title.toLowerCase() === item.title.toLowerCase();

const RESOURCE_CATEGORIES = ["All", "Video", "Course", "Documentation", "Article", "Podcast"];


export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("tracklist");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]); // resources used that day
  const [resourceInput, setResourceInput] = useState("");
  const [learnedText, setLearnedText] = useState("");
  const [newResource, setNewResource] = useState({ title: "", url: "", category: "Documentation", emoji: "📚" });
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'update' | 'resource'; id: string } | null>(null);

  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [existingMedia, setExistingMedia] = useState<{ video: string | null; audio: string | null }>({ video: null, audio: null });
  const [today, setToday] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3500); };

  // undefined = checking session, null = signed out
  const [user, setUser] = useState<string | null | undefined>(undefined);

  const handleError = (e: unknown, fallback: string) => {
    if (e instanceof ApiError && e.status === 401) setUser(null); // session expired
    else setError(e instanceof Error ? e.message : fallback);
  };

  useEffect(() => {
    const now = new Date();
    setToday(now);
    setDate(now);
    getMe().then((r) => setUser(r.username)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    getUpdates().then(setUpdates).catch((e) => handleError(e, "Could not load entries"));
    getResources().then(setResources).catch((e) => handleError(e, "Could not load resources"));
  }, [user]);

  const handleLogout = async () => {
    await logout().catch(() => {});
    setUser(null);
    setUpdates([]);
    setResources([]);
    setError(null);
  };

  const entriesByDate = useMemo(() => Object.fromEntries(updates.map((u) => [u.date, u])), [updates]);
  const loggedDates = useMemo(() => new Set(updates.map((u) => u.date)), [updates]);
  const loggedDays = useMemo(() => updates.map((u) => { const [y, m, d] = u.date.split("-").map(Number); return new Date(y, m - 1, d); }), [updates]);

  const monthPrefix = date ? toDateStr(date).slice(0, 7) : null;
  const monthCount = monthPrefix ? updates.filter((u) => u.date.startsWith(monthPrefix)).length : 0;

  const streak = useMemo(() => {
    if (!today) return 0;
    const cur = new Date(today);
    if (!loggedDates.has(toDateStr(cur))) cur.setDate(cur.getDate() - 1); // today not logged yet doesn't break the streak
    let n = 0;
    while (loggedDates.has(toDateStr(cur))) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }, [loggedDates, today]);

  const openDay = (d: Date) => {
    const existing = updates.find((u) => u.date === toDateStr(d));
    setSelectedDay(d);
    setLearnedText(existing?.what_i_learned ?? "");
    setSelectedPlatforms(existing?.resources ?? []);
    setExistingMedia({ video: existing?.video_url ?? null, audio: existing?.voice_note_url ?? null });
    setVideoBlob(null);
    setAudioBlob(null);
    setIsDialogOpen(true);
  };

  const addResourceItem = () => {
    const v = resourceInput.trim();
    if (!v) return;
    setSelectedPlatforms((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setResourceInput("");
  };

  const handleSaveUpdate = async () => {
    if (!selectedDay) return;
    const typed = resourceInput.trim();
    const used = typed && !selectedPlatforms.some((x) => x.toLowerCase() === typed.toLowerCase()) ? [...selectedPlatforms, typed] : selectedPlatforms;
    if (!learnedText.trim()) { setError("Please fill in what you learned today. ✏️"); return; }
    if (used.length === 0) { setError("Please add at least one resource used. 🔗"); return; }
    setSaving(true);
    setError(null);
    try {
      const [video_url, voice_note_url] = await Promise.all([
        videoBlob ? uploadMedia("video", videoBlob) : existingMedia.video,
        audioBlob ? uploadMedia("audio", audioBlob) : existingMedia.audio,
      ]);
      const saved = await saveUpdate({
        date: toDateStr(selectedDay),
        what_i_learned: learnedText,
        resources: used,
        video_url,
        voice_note_url,
      });
      setUpdates((prev) => [...prev.filter((u) => u.date !== saved.date), saved]);
      setIsDialogOpen(false);
      setResourceInput("");

      // add anything new to the global Resource Library
      const fresh = used.map(resourceFromItem).filter((it, i, all) =>
        !resources.some((r) => sameResource(r, it)) &&
        all.findIndex((o) => (o.url || o.title).toLowerCase() === (it.url || it.title).toLowerCase()) === i
      );

      if (fresh.length) {
        const created = await Promise.all(fresh.map((it) => createResource(it)));
        setResources((prev) => [...created.reverse(), ...prev]);
      }
      flash(fresh.length ? `Entry saved, ${fresh.length} resource${fresh.length === 1 ? "" : "s"} added to your library ✨` : "Entry saved ✨");
    } catch (e) {
      handleError(e, "Could not save entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUpdate = () => {
    if (!selectedDay) return;
    setDeleteConfirm({ type: 'update', id: toDateStr(selectedDay) });
  };

  const handleSaveResource = async () => {
    if (!newResource.title.trim() || !newResource.url.trim()) { setError("Title and link are required."); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await createResource(newResource);
      setResources((prev) => [saved, ...prev]);
      setIsResourceDialogOpen(false);
      flash("Resource saved ✨");
    } catch (e) {
      handleError(e, "Could not save resource");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResource = (id: string) => {
    setDeleteConfirm({ type: 'resource', id });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      if (deleteConfirm.type === 'update') {
        const updateToDelete = updates.find((u) => u.date === deleteConfirm.id);
        await deleteUpdate(deleteConfirm.id);

        if (updateToDelete) {
          const otherUpdates = updates.filter((u) => u.date !== deleteConfirm.id);
          const usedElsewhere = new Set(otherUpdates.flatMap((u) => u.resources.map((r) => r.toLowerCase())));
          const toDeleteResources = updateToDelete.resources.filter((r) => !usedElsewhere.has(r.toLowerCase()));

          const resourcesToDeleteIds: string[] = [];
          toDeleteResources.forEach((resStr) => {
            const item = resourceFromItem(resStr);
            const matchedRes = resources.find((r) => sameResource(r, item));
            if (matchedRes) {
              resourcesToDeleteIds.push(matchedRes.id);
            }
          });

          if (resourcesToDeleteIds.length > 0) {
            await Promise.all(resourcesToDeleteIds.map((id) => deleteResource(id)));
            setResources((prev) => prev.filter((r) => !resourcesToDeleteIds.includes(r.id)));
          }
        }

        setUpdates((prev) => prev.filter((u) => u.date !== deleteConfirm.id));
        setIsDialogOpen(false);
        flash("Entry deleted ✨");
      } else {
        if (deleteConfirm.id.startsWith("vid-")) {
          const updateId = deleteConfirm.id.replace("vid-", "");
          await deleteMedia(updateId, "video");
          setUpdates((prev) => prev.map(u => u.id === updateId ? { ...u, video_url: null } : u));
        } else if (deleteConfirm.id.startsWith("aud-")) {
          const updateId = deleteConfirm.id.replace("aud-", "");
          await deleteMedia(updateId, "audio");
          setUpdates((prev) => prev.map(u => u.id === updateId ? { ...u, voice_note_url: null } : u));
        } else {
          await deleteResource(deleteConfirm.id);
          setResources((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
        }
        flash("Resource deleted ✨");
      }
    } catch (e) {
      handleError(e, "Could not delete");
    } finally {
      setSaving(false);
      setDeleteConfirm(null);
    }
  };

  const allResources = useMemo(() => {
    const combined = [...resources];
    updates.forEach(u => {
      if (u.video_url && !combined.some(r => r.url === u.video_url)) {
        combined.push({
          id: `vid-${u.id}`,
          title: `Video Summary - ${u.date}`,
          url: u.video_url,
          category: "Video",
          emoji: "🎬",
          notes: null,
          created_at: u.created_at,
        });
      }
      if (u.voice_note_url && !combined.some(r => r.url === u.voice_note_url)) {
        combined.push({
          id: `aud-${u.id}`,
          title: `Voice Note - ${u.date}`,
          url: u.voice_note_url,
          category: "Podcast",
          emoji: "🎙️",
          notes: null,
          created_at: u.created_at,
        });
      }
    });
    return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [resources, updates]);

  const q = searchQuery.trim().toLowerCase();
  const filteredResources = allResources.filter((r) =>
    (activeCategory === "All" || r.category === activeCategory) &&
    (!q || [r.title, r.url, r.category ?? ""].some((f) => f.toLowerCase().includes(q)))
  );
  const timeAgo = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  };

  const monthName = date?.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (user === undefined) return <div style={{ minHeight: "100vh", background: "#FDF7F9" }} />;
  if (user === null) return <LoginForm onLogin={setUser} />;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #FDF7F9 0%, #FBF0F4 40%, #F9EEF4 100%)" }}>

      {/* ── Top Navigation ─────────────────────────── */}
      <header style={{ borderBottom: "1px solid #F0DDE8", background: "rgba(255,255,255,0.75)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style={{ background: "linear-gradient(135deg, #F9B8D5, #E8478A)" }}>
              🌸
            </div>
            <div>
              <h1 className="font-playfair text-xl font-bold leading-none" style={{ color: "#2D1B2A" }}>Petal</h1>
              <p className="text-xs leading-none mt-0.5" style={{ color: "#B890A8", fontFamily: "var(--font-jakarta)" }}>your learning journal</p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 p-1 rounded-2xl" style={{ background: "#FFF5F8", border: "1px solid #F0DDE8" }}>
            {(["tracklist", "resources"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{
                  background: activeTab === tab ? "#E8478A" : "transparent",
                  color: activeTab === tab ? "#fff" : "#7A4E6A",
                  boxShadow: activeTab === tab ? "0 2px 10px rgba(232,71,138,0.3)" : "none",
                  letterSpacing: "0.01em",
                }}
              >
                {tab === "tracklist" ? "🎀 Tracklist" : "📚 Resources"}
              </button>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:bg-white"
              style={{ color: "#B890A8" }}
              title={`Signed in as ${user}`}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-8 py-10">

        {notice && (
          <div className="mb-6 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: "#F0FBF4", border: "1px solid #BFE5CC", color: "#1E7A43" }}>
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-2xl px-5 py-3 text-sm" style={{ background: "#FFF0F0", border: "1px solid #F5C2C2", color: "#B42318" }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="font-bold">✕</button>
          </div>
        )}

        {/* ══ TRACKLIST TAB ══════════════════════════ */}
        {activeTab === "tracklist" && (
          <div className="flex flex-col gap-8">

            {/* Page Header */}
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-playfair text-3xl font-bold" style={{ color: "#2D1B2A" }}>
                  Learning Tracker
                </h2>
                <p className="mt-1.5 text-sm" style={{ color: "#7A4E6A" }}>
                  Click any date below to log your learning for that day.
                </p>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#B890A8" }}>Currently viewing</p>
                <p className="font-playfair text-lg font-bold" style={{ color: "#E8478A" }}>{monthName}</p>
              </div>
            </div>

            {/* Stats Strip */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Days Logged", value: String(updates.length), icon: "📅" },
                { label: "This Month", value: monthName ?? "", icon: "🗓️" },
                { label: "Streak", value: `${streak} day${streak === 1 ? "" : "s"}${streak > 0 ? " 🔥" : ""}`, icon: "⚡" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#FFFFFF", border: "1px solid #F0DDE8", boxShadow: "0 1px 8px rgba(232,71,138,0.06)" }}>
                  <div className="text-2xl">{s.icon}</div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#B890A8" }}>{s.label}</p>
                    <p className="text-base font-bold mt-0.5" style={{ color: "#2D1B2A" }}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Calendar Card (wrapper anchors the hanging banners to the calendar's top edge) */}
            <div className="relative">
            <HangingBanners />
            <div className="rounded-3xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0DDE8", boxShadow: "0 4px 24px rgba(232,71,138,0.08)" }}>

              {/* Calendar header bar */}
              <div className="px-8 py-5" style={{ borderBottom: "1px solid #F8EDF3" }}>
                <p className="text-sm font-semibold" style={{ color: "#7A4E6A" }}>
                  ✨ <span style={{ color: "#E8478A" }}>{monthCount} {monthCount === 1 ? "entry" : "entries"}</span> logged this month. Keep going!
                </p>
              </div>

              {/* Calendar */}
              <div className="px-6 py-6">
                <style>{`
                  .rdp-month { width: 100% !important; }
                  .rdp-months { width: 100% !important; }
                  .rdp-month_grid { width: 100% !important; }
                  .rdp-weeks { width: 100% !important; }
                  .rdp-week { width: 100% !important; display: flex !important; justify-content: space-around !important; }
                  .rdp-weekdays { display: flex !important; justify-content: space-around !important; width: 100% !important; }
                  .rdp-weekday { flex: 1 !important; text-align: center !important; font-size: 0.7rem !important; font-weight: 600 !important; letter-spacing: 0.08em !important; text-transform: uppercase !important; color: #B890A8 !important; padding: 4px 0 12px !important; }
                  .rdp-day { flex: 1 !important; display: flex !important; justify-content: center !important; padding: 4px 0 !important; }
                  .rdp-day_button { width: 2.75rem !important; height: 2.75rem !important; border-radius: 14px !important; font-size: 0.875rem !important; font-weight: 500 !important; cursor: pointer !important; transition: all 0.15s ease !important; color: #2D1B2A !important; }
                  .rdp-day_button:hover { background: #FFF5F8 !important; color: #E8478A !important; }
                  [data-selected-single="true"] { background: linear-gradient(135deg, #F0B8CF, #E8478A) !important; color: white !important; border-radius: 14px !important; box-shadow: 0 4px 12px rgba(232,71,138,0.3) !important; }
                  .rdp-today .rdp-day_button { color: #E8478A !important; font-weight: 700 !important; border: 2px solid #F0B8CF !important; }
                  .logged-day .rdp-day_button { background: #FFE3EE !important; color: #E8478A !important; font-weight: 700 !important; }
                  .rdp-today { background: transparent !important; }
                  .rdp-outside .rdp-day_button { color: #D4BAC9 !important; }
                  .rdp-caption_label { color: #2D1B2A !important; font-weight: 700 !important; font-size: 1.1rem !important; font-family: var(--font-playfair) !important; }
                  .rdp-nav button { color: #7A4E6A !important; border-radius: 10px !important; transition: background 0.15s !important; }
                  .rdp-nav button:hover { background: #FFF5F8 !important; }
                  .rdp-month_caption { padding-bottom: 16px !important; }
                `}</style>
                <EntriesContext.Provider value={entriesByDate}>
                <Calendar
                  mode="single"
                  components={{ DayButton: DayWithNote }}
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    if (d) openDay(d);
                  }}
                  modifiers={{ logged: loggedDays }}
                  modifiersClassNames={{ logged: "logged-day" }}
                  className="w-full"
                />
                </EntriesContext.Provider>
              </div>

              {/* Legend */}
              <div className="px-8 py-4 flex items-center gap-6" style={{ borderTop: "1px solid #F8EDF3" }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg" style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)" }} />
                  <span className="text-xs font-medium" style={{ color: "#7A4E6A" }}>Selected / Logged</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-bold" style={{ borderColor: "#F0B8CF", color: "#E8478A" }}>7</div>
                  <span className="text-xs font-medium" style={{ color: "#7A4E6A" }}>Today</span>
                </div>
              </div>
            </div>
            </div>

          </div>
        )}

        {/* ══ RESOURCES TAB ══════════════════════════ */}
        {activeTab === "resources" && (
          <div className="flex flex-col gap-8">

            {/* Page Header */}
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-playfair text-3xl font-bold" style={{ color: "#2D1B2A" }}>
                  Resource Library
                </h2>
                <p className="mt-1.5 text-sm" style={{ color: "#7A4E6A" }}>
                  Everything you've saved to learn from. All in one place.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResourceDialogOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)", boxShadow: "0 4px 16px rgba(232,71,138,0.3)" }}
              >
                <span className="text-base">+</span> Add Resource
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base" style={{ color: "#B890A8" }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, URL, or category…"
                className="w-full pl-11 pr-5 py-3.5 rounded-2xl text-sm outline-none transition-all"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #F0DDE8",
                  color: "#2D1B2A",
                  boxShadow: "0 1px 8px rgba(232,71,138,0.05)",
                  fontFamily: "var(--font-jakarta)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#F0B8CF"; e.target.style.boxShadow = "0 0 0 3px rgba(240,184,207,0.25)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#F0DDE8"; e.target.style.boxShadow = "0 1px 8px rgba(232,71,138,0.05)"; }}
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {RESOURCE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                  style={{
                    background: activeCategory === cat ? "#E8478A" : "#FFFFFF",
                    color: activeCategory === cat ? "#fff" : "#7A4E6A",
                    border: `1px solid ${activeCategory === cat ? "#E8478A" : "#F0DDE8"}`,
                    boxShadow: activeCategory === cat ? "0 2px 8px rgba(232,71,138,0.25)" : "none",
                  }}
                >
                  {cat}
                </button>
              ))}
              <span className="ml-auto text-xs" style={{ color: "#B890A8" }}>{filteredResources.length} resources</span>
            </div>

            {/* Resource Sticky Notes Grid */}
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
              {filteredResources.map((res, i) => {
                const tilts = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-3", "rotate-3"];
                const tilt = tilts[i % tilts.length];
                const washiColors = [
                  "repeating-linear-gradient(135deg, rgba(232,71,138,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
                  "repeating-linear-gradient(135deg, rgba(147,100,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
                  "repeating-linear-gradient(135deg, rgba(255,160,80,0.5) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
                  "repeating-linear-gradient(135deg, rgba(80,180,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
                ];
                const noteGrads = [
                  "linear-gradient(145deg, #FFF4F9 0%, #FFD6E7 100%)",
                  "linear-gradient(145deg, #F5F0FF 0%, #E8D5FF 100%)",
                  "linear-gradient(145deg, #FFF8F0 0%, #FFE8CC 100%)",
                  "linear-gradient(145deg, #F0FAFF 0%, #CCF0FF 100%)",
                  "linear-gradient(145deg, #F5FFF0 0%, #CCFFDD 100%)",
                ];
                const noteBorders = ["#F5B5CF", "#C8A0E8", "#FFB870", "#80D0E0", "#80E0A0"];
                const shadowColors = [
                  "rgba(232,71,138,0.18)", "rgba(147,100,200,0.18)", "rgba(255,140,60,0.18)",
                  "rgba(60,180,200,0.18)", "rgba(60,180,100,0.18)"
                ];
                const ci = i % 5;
                const href = res.url ? (/^https?:\/\//.test(res.url) ? res.url : `https://${res.url}`) : undefined;
                return (
                  <a
                    key={res.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group break-inside-avoid block relative rounded-2xl px-4 pt-5 pb-4 transition-all duration-200 hover:rotate-0 hover:scale-105 hover:shadow-xl ${tilt}`}
                    style={{
                      background: noteGrads[ci],
                      border: `1px solid ${noteBorders[ci]}`,
                      boxShadow: `0 4px 16px ${shadowColors[ci]}, 0 1px 4px rgba(0,0,0,0.06)`,
                      textDecoration: "none",
                      cursor: href ? "pointer" : "default",
                    }}
                  >
                    {/* Washi tape */}
                    <span
                      aria-hidden
                      className="absolute -top-1 left-1/2 h-2.5 w-10 -translate-x-1/2 rotate-2 rounded-sm"
                      style={{ background: washiColors[i % washiColors.length] }}
                    />

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteResource(res.id); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(255,255,255,0.6)", color: "#B42318" }}
                      aria-label="Delete resource"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F5C2C2"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.6)"; }}
                    >
                      ✕
                    </button>

                    {/* Emoji */}
                    <div className="text-3xl mb-3 mt-1">{res.emoji ?? "📚"}</div>

                    {/* Title */}
                    <p
                      className="font-playfair italic font-bold leading-snug mb-2"
                      style={{ fontSize: "0.95rem", color: "#3D1A32", wordBreak: "break-word" }}
                    >
                      {res.title}
                    </p>

                    {/* URL */}
                    {res.url && (
                      <p
                        className="text-xs mb-3 truncate"
                        style={{ color: "#A06080", fontFamily: "var(--font-jakarta)" }}
                      >
                        {res.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 45)}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-auto pt-1" style={{ borderTop: `1px dashed ${noteBorders[ci]}` }}>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: "rgba(255,255,255,0.7)", color: "#7A3A5A", fontSize: "0.68rem" }}
                      >
                        {res.category ?? "Other"}
                      </span>
                      <span className="text-xs" style={{ color: "#C090A8", fontSize: "0.65rem", fontFamily: "var(--font-jakarta)" }}>
                        {timeAgo(res.created_at)}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Empty state hint */}
            {allResources.length === 0 && <div className="rounded-2xl p-8 flex flex-col items-center gap-3 text-center" style={{ background: "#FFF5F8", border: "1px dashed #F0DDE8" }}>
              <span className="text-3xl">📌</span>
              <p className="text-sm font-semibold" style={{ color: "#7A4E6A" }}>Save resources as you learn</p>
              <p className="text-xs" style={{ color: "#B890A8" }}>Add links, books, videos, podcasts — anything you want to revisit.</p>
            </div>}

          </div>
        )}
      </main>

      {/* ── Daily Update Dialog ─────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setSelectedPlatforms([]); setResourceInput(""); setLearnedText(""); } }}>
        <DialogContent
          className="max-w-lg rounded-3xl border-0 p-0 overflow-hidden flex flex-col"
          style={{ boxShadow: "0 32px 80px rgba(45,27,42,0.18)", maxHeight: "90vh" }}
        >

          {/* Dialog Header */}
          <div className="px-7 pt-7 pb-5 shrink-0" style={{ background: "linear-gradient(135deg, #FFF5F8 0%, #FDF0F5 100%)", borderBottom: "1px solid #F0DDE8" }}>
            <DialogHeader>
              <DialogTitle className="font-playfair text-2xl font-bold" style={{ color: "#2D1B2A" }}>
                {selectedDay?.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
              </DialogTitle>
              <DialogDescription className="text-sm mt-1" style={{ color: "#7A4E6A" }}>
                What did you learn today? Capture it before it fades 🌷
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Dialog Body — scrollable */}
          <div className="px-7 py-6 flex flex-col gap-6 overflow-y-auto flex-1">

            {/* What I learned */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>✏️ What I Learned <span style={{ color: "#E8478A" }}>*</span></Label>
              <Textarea
                value={learnedText}
                onChange={(e) => setLearnedText(e.target.value)}
                placeholder="Today I explored how to use React Server Components to reduce client bundle size…"
                rows={4}
                className="rounded-2xl text-sm resize-none outline-none transition-all"
                style={{ border: "1px solid #F0DDE8", background: "#FAFAFA", color: "#2D1B2A", padding: "14px 16px", fontFamily: "var(--font-jakarta)" }}
                onFocus={(e) => { e.target.style.borderColor = "#F0B8CF"; e.target.style.boxShadow = "0 0 0 3px rgba(240,184,207,0.2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#F0DDE8"; e.target.style.boxShadow = "none"; }}
              />
              <p className="text-xs text-right" style={{ color: "#D4BAC9" }}>{learnedText.length} chars</p>
            </div>

            {/* Resources used */}
            <div className="flex flex-col gap-2.5">
              <div>
                <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>🔗 Resources Used <span style={{ color: "#E8478A" }}>*</span></Label>
                <p className="text-xs mt-0.5" style={{ color: "#B890A8" }}>Type a link or a name and press Enter. New ones are also saved to your Resource Library.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resourceInput}
                  onChange={(e) => setResourceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addResourceItem(); } }}
                  placeholder="e.g. https://react.dev or “Clean Code (book)”"
                  maxLength={300}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{ border: "1px solid #F0DDE8", background: "#FAFAFA", color: "#2D1B2A", fontFamily: "var(--font-jakarta)" }}
                  onFocus={(e) => { e.target.style.borderColor = "#F0B8CF"; e.target.style.boxShadow = "0 0 0 3px rgba(240,184,207,0.2)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#F0DDE8"; e.target.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={addResourceItem}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#E8478A" }}
                >
                  Add
                </button>
              </div>
              {selectedPlatforms.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedPlatforms.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 max-w-full pl-3.5 pr-2 py-1.5 rounded-full text-xs font-semibold text-white"
                      style={{ background: "#E8478A", boxShadow: "0 2px 8px rgba(232,71,138,0.3)" }}
                    >
                      <span className="truncate">{p}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${p}`}
                        onClick={() => setSelectedPlatforms((prev) => prev.filter((x) => x !== p))}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[0.65rem] leading-none hover:bg-white/30"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #F0DDE8" }} />

            {/* Video recorder */}
            <div className="flex flex-col gap-2.5">
              <div>
                <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>🎬 Short Video Summary</Label>
                <p className="text-xs mt-0.5" style={{ color: "#B890A8" }}>Record a quick explanation — max 2 minutes</p>
              </div>
              <VideoRecorder 
                onRecorded={setVideoBlob} 
                onClear={() => setExistingMedia((prev) => ({ ...prev, video: null }))}
                existingUrl={existingMedia.video} 
              />
            </div>

            {/* Voice recorder */}
            <div className="flex flex-col gap-2.5">
              <div>
                <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>🎙️ Voice Note</Label>
                <p className="text-xs mt-0.5" style={{ color: "#B890A8" }}>Speak your mind — max 2 minutes</p>
              </div>
              <VoiceRecorder 
                onRecorded={setAudioBlob} 
                onClear={() => setExistingMedia((prev) => ({ ...prev, audio: null }))}
                existingUrl={existingMedia.audio} 
              />
            </div>

          </div>

          {/* Dialog Footer */}
          <div className="px-7 py-5 flex items-center justify-between shrink-0" style={{ borderTop: "1px solid #F0DDE8", background: "#FDFAFB" }}>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ color: "#7A4E6A", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FFF5F8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                Cancel
              </button>
              {selectedDay && updates.some((u) => u.date === toDateStr(selectedDay)) && (
                <button
                  type="button"
                  onClick={handleDeleteUpdate}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-[#F9D0E0] active:scale-95 disabled:opacity-60"
                  style={{ color: "#B42318", background: "#FFF0F0", border: "1px solid #F5C2C2" }}
                >
                  Delete
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSaveUpdate}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)", boxShadow: "0 4px 14px rgba(232,71,138,0.35)" }}
            >
              {saving ? "Saving…" : "Save Entry ✨"}
            </button>
          </div>

        </DialogContent>
      </Dialog>

      {/* ── Add Resource Dialog ─────────────────────── */}
      <Dialog open={isResourceDialogOpen} onOpenChange={(open) => { setIsResourceDialogOpen(open); if (!open) { setNewResource({ title: "", url: "", category: "Documentation", emoji: "📚" }); } }}>
        <DialogContent
          className="max-w-md rounded-3xl border-0 p-0 overflow-hidden flex flex-col"
          style={{ boxShadow: "0 32px 80px rgba(45,27,42,0.18)" }}
        >
          {/* Dialog Header */}
          <div className="px-7 pt-7 pb-5 shrink-0" style={{ background: "linear-gradient(135deg, #FFF5F8 0%, #FDF0F5 100%)", borderBottom: "1px solid #F0DDE8" }}>
            <DialogHeader>
              <DialogTitle className="font-playfair text-2xl font-bold" style={{ color: "#2D1B2A" }}>
                Add Resource
              </DialogTitle>
              <DialogDescription className="text-sm mt-1" style={{ color: "#7A4E6A" }}>
                Save a helpful link to your library 📚
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Dialog Body */}
          <div className="px-7 py-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
            
            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>Title</Label>
              <input
                type="text"
                value={newResource.title}
                onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                placeholder="e.g. React Documentation"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ border: "1px solid #F0DDE8", background: "#FAFAFA", color: "#2D1B2A", fontFamily: "var(--font-jakarta)" }}
                onFocus={(e) => { e.target.style.borderColor = "#F0B8CF"; e.target.style.boxShadow = "0 0 0 3px rgba(240,184,207,0.2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#F0DDE8"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* URL */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>Link (URL)</Label>
              <input
                type="url"
                value={newResource.url}
                onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ border: "1px solid #F0DDE8", background: "#FAFAFA", color: "#2D1B2A", fontFamily: "var(--font-jakarta)" }}
                onFocus={(e) => { e.target.style.borderColor = "#F0B8CF"; e.target.style.boxShadow = "0 0 0 3px rgba(240,184,207,0.2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#F0DDE8"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>Category</Label>
              <div className="flex flex-wrap gap-2">
                {RESOURCE_CATEGORIES.filter(c => c !== "All").map((cat) => {
                  const active = newResource.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewResource({ ...newResource, category: cat })}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150"
                      style={{
                        borderColor: active ? "#E8478A" : "#F0DDE8",
                        background: active ? "#E8478A" : "#FFFFFF",
                        color: active ? "white" : "#7A4E6A",
                        boxShadow: active ? "0 2px 8px rgba(232,71,138,0.3)" : "none",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Emoji picker simple */}
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-semibold" style={{ color: "#2D1B2A" }}>Icon</Label>
              <div className="flex flex-wrap gap-2 text-xl">
                {["📚", "⚛️", "🚀", "▲", "🔥", "💻", "🎬", "🎧"].map((emoji) => {
                  const active = newResource.emoji === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewResource({ ...newResource, emoji })}
                      className="w-10 h-10 flex items-center justify-center rounded-xl transition-all"
                      style={{
                        background: active ? "#FFF5F8" : "transparent",
                        border: `1px solid ${active ? "#F0B8CF" : "transparent"}`,
                        transform: active ? "scale(1.1)" : "scale(1)",
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Dialog Footer */}
          <div className="px-7 py-5 flex items-center justify-between shrink-0" style={{ borderTop: "1px solid #F0DDE8", background: "#FDFAFB" }}>
            <button
              type="button"
              onClick={() => setIsResourceDialogOpen(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ color: "#7A4E6A", background: "transparent" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FFF5F8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveResource}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)", boxShadow: "0 4px 14px rgba(232,71,138,0.35)" }}
            >
              {saving ? "Saving…" : "Save Resource ✨"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Dialog ────────────────────── */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent
          className="max-w-sm rounded-3xl border-0 p-0 overflow-hidden flex flex-col"
          style={{ boxShadow: "0 32px 80px rgba(45,27,42,0.18)" }}
        >
          <div className="px-7 pt-7 pb-5 shrink-0" style={{ background: "linear-gradient(135deg, #FFF5F8 0%, #FDF0F5 100%)", borderBottom: "1px solid #F0DDE8" }}>
            <DialogHeader>
              <DialogTitle className="font-playfair text-2xl font-bold" style={{ color: "#B42318" }}>
                Delete {deleteConfirm?.type === 'update' ? 'Entry' : 'Resource'}?
              </DialogTitle>
              <DialogDescription className="text-sm mt-1" style={{ color: "#7A4E6A" }}>
                Are you sure you want to delete this {deleteConfirm?.type === 'update' ? 'entry' : 'resource'}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-7 py-5 flex items-center justify-between shrink-0" style={{ background: "#FDFAFB" }}>
            <button
              type="button"
              onClick={() => setDeleteConfirm(null)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ color: "#7A4E6A", background: "transparent" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FFF5F8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeDelete}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:bg-[#B42318] active:scale-95 disabled:opacity-60"
              style={{ background: "#E8478A", boxShadow: "0 4px 14px rgba(232,71,138,0.35)" }}
            >
              {saving ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
