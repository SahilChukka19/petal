"use client";

import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

import { getNotes, createNote, updateNote, deleteNote, type Note } from "@/lib/api";

export default function NotesSidebar() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const data = await getNotes();
      setNotes(data);
    } catch (e) {
      console.error("Failed to load notes", e);
    }
  };

  const handleAddNote = async () => {
    try {
      const newNote = await createNote("");
      setNotes([newNote, ...notes]);
      setPage(1);
      startEditing(newNote);
    } catch (e) {
      console.error("Failed to create note", e);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes(notes.filter((n) => n.id !== id));
    } catch (e) {
      console.error("Failed to delete note", e);
    }
  };

  const startEditing = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const content = editText.trim();
    if (!content) {
      await handleDeleteNote(editingId);
      setEditingId(null);
      return;
    }
    try {
      const updated = await updateNote(editingId, content);
      setNotes(notes.map(n => n.id === editingId ? updated : n).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      setEditingId(null);
    } catch (e) {
      console.error("Failed to update note", e);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-playfair text-xl font-bold" style={{ color: "#2D1B2A" }}>Quick Notes</h3>
        <button
          onClick={handleAddNote}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)", boxShadow: "0 2px 8px rgba(232,71,138,0.3)" }}
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-4">
        {notes.length === 0 && (
          <div className="text-center p-6 rounded-2xl border-2 border-dashed" style={{ borderColor: "#F0DDE8", color: "#B890A8" }}>
            <p className="text-sm">No notes yet.</p>
            <p className="text-xs mt-1">Click the + to jot something down!</p>
          </div>
        )}

        {notes.slice((page - 1) * itemsPerPage, page * itemsPerPage).map((note, i) => {
          const isEditing = editingId === note.id;
          const bgColors = ["#FFF4F9", "#F5F0FF", "#FFF8F0"];
          const borderColors = ["#F5B5CF", "#C8A0E8", "#FFB870"];
          const ci = i % 3;

          return (
            <div
              key={note.id}
              className="relative rounded-2xl p-4 transition-all group"
              style={{
                background: bgColors[ci],
                border: `1px solid ${borderColors[ci]}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
              }}
            >
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Type your note here..."
                    className="min-h-[100px] text-sm bg-white/50 border-white focus-visible:ring-1"
                    style={{ borderColor: borderColors[ci], outlineColor: borderColors[ci], color: "#2D1B2A" }}
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold text-gray-500 hover:bg-black/5">Cancel</button>
                    <button onClick={handleSaveEdit} className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white shadow-sm" style={{ background: borderColors[ci] }}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3D1A32", fontFamily: "var(--font-jakarta)" }}>
                    {note.content}
                  </p>
                  <p className="text-[0.65rem] mt-3 opacity-60" style={{ color: "#7A4E6A" }}>
                    {new Date(note.updated_at).toLocaleDateString()}
                  </p>
                  
                  {/* Actions (visible on hover) */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={() => startEditing(note)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-white/60 hover:bg-white text-gray-600 transition-colors shadow-sm"
                      title="Edit note"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this note?")) handleDeleteNote(note.id); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-white/60 hover:bg-white text-red-500 transition-colors shadow-sm"
                      title="Delete note"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {Math.ceil(notes.length / itemsPerPage) > 1 && (
        <div className="flex items-center justify-between pt-2 px-2 shrink-0 mt-auto" style={{ borderTop: "1px dashed #F0DDE8" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:bg-[#FFF5F8] disabled:opacity-30 disabled:pointer-events-none"
            style={{ color: "#E8478A" }}
          >
            &larr; Prev
          </button>
          <span className="text-[0.7rem] font-semibold tracking-wider" style={{ color: "#B890A8" }}>
            {page} / {Math.ceil(notes.length / itemsPerPage)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(notes.length / itemsPerPage), p + 1))}
            disabled={page === Math.ceil(notes.length / itemsPerPage)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:bg-[#FFF5F8] disabled:opacity-30 disabled:pointer-events-none"
            style={{ color: "#E8478A" }}
          >
            Next &rarr;
          </button>
        </div>
      )}
    </div>
  );
}