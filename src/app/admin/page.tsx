// src/app/admin/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebaseClient";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  getIdTokenResult,
  signOut,
  User,
} from "firebase/auth";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  DocumentData,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { LogOut, Upload, Plus, Loader, Trash2, Edit2, X, Check } from "lucide-react";

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // upload state (optional gallery)
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [eventTitleForUpload, setEventTitleForUpload] = useState("");
  const [linkMode, setLinkMode] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkType, setLinkType] = useState<"image" | "video">("image");

  // events list
  const [recentEvents, setRecentEvents] = useState<DocumentData[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<DocumentData | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        setLoadingAuth(false);
        return;
      }
      const tokenRes = await getIdTokenResult(u, true).catch(() => null);
      setIsAdmin(!!tokenRes?.claims?.admin);
      setLoadingAuth(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    // subscribe to recent events (realtime)
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: DocumentData[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        setRecentEvents(arr);
        setLoadingEvents(false);
      },
      (err) => {
        console.error("events snapshot error", err);
        setLoadingEvents(false);
      }
    );
    return () => unsub();
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (err: any) {
      console.error("Login error:", err);
      setLoginError(err.message || "Login failed");
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isAdmin) {
      alert("Please sign in as admin before uploading or adding links.");
      return;
    }

    // LINK MODE: add a direct URL (Google Drive image or YouTube video)
    if (linkMode === "link") {
      if (!linkUrl.trim()) {
        alert("Please provide a link URL.");
        return;
      }
      setUploading(true);
      try {
        // Try to infer type from link if user left type as default
        let inferredType = linkType;
        const l = linkUrl.toLowerCase();
        if (l.includes("youtube.com") || l.includes("youtu.be")) inferredType = "video";
        else if (l.includes("drive.google.com") && (l.includes("/view") || l.includes("open?id="))) {
          // Could be image/pdf; keep as image by default for gallery photos
          inferredType = "image";
        }

        await addDoc(collection(db, "gallery"), {
          url: linkUrl.trim(),
          filename: null,
          title: eventTitleForUpload || null,
          uploadedBy: user.uid,
          type: inferredType,
          createdAt: serverTimestamp(),
          source: "external-link",
        });

        alert("Link added to gallery!");
        setLinkUrl("");
        setEventTitleForUpload("");
      } catch (err) {
        console.error("Error adding link to gallery:", err);
        alert("Failed to add link (see console)");
      } finally {
        setUploading(false);
      }

      return;
    }

    // FILE MODE: upload to Firebase Storage as before
    if (!file) {
      alert("Select a file or switch to 'Add link' mode.");
      return;
    }

    setUploading(true);
    try {
      const path = `gallery/${eventTitleForUpload || "general"}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      task.on(
        "state_changed",
        () => {
          // optional: progress UI
        },
        (err) => {
          console.error("Upload error:", err);
          alert("Upload failed: " + (err?.message || "unknown"));
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "gallery"), {
            url,
            filename: file.name,
            title: eventTitleForUpload || null,
            uploadedBy: user.uid,
            type: file.type.startsWith("image/") ? "image" : "video",
            createdAt: serverTimestamp(),
            source: "upload",
          });
          alert("Uploaded & metadata saved!");
          setFile(null);
          setEventTitleForUpload("");
          setUploading(false);
        }
      );
    } catch (err) {
      console.error("Upload exception:", err);
      alert("Upload failed");
      setUploading(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }
    setDeleting(eventId);
    try {
      await deleteDoc(doc(db, "events", eventId));
      alert("Event deleted successfully");
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Error deleting event");
    } finally {
      setDeleting(null);
    }
  }

  function startEditingEvent(event: DocumentData) {
    setEditingId(event.id);
    setEditData({ ...event });
  }

  async function handleSaveEdit(eventId: string) {
    if (!editData || !editData.title.trim() || !editData.date) {
      alert("Event title and date are required");
      return;
    }
    try {
      await updateDoc(doc(db, "events", eventId), {
        title: editData.title.trim(),
        description: editData.description || null,
        date: editData.date,
        startTime: editData.startTime || null,
        endTime: editData.endTime || null,
        location: editData.location || null,
        category: editData.category,
      });
      alert("Event updated successfully");
      setEditingId(null);
      setEditData(null);
    } catch (err) {
      console.error("Error updating event:", err);
      alert("Error updating event");
    }
  }

  if (loadingAuth)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-500" />
          <p className="text-white/70">Checking authentication...</p>
        </div>
      </div>
    );

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Decorative background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-2">
                Admin Access
              </h1>
              <p className="text-white/60">E-Cell IIIT Delhi Dashboard</p>
            </div>

            <form onSubmit={doLogin} className="space-y-5">
              <div>
                <label className="text-sm font-medium text-white/80 mb-2 block">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
                  placeholder="admin@iiitd.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white/80 mb-2 block">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {loginError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{loginError}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-lg transition duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Sign In
              </button>
            </form>

            <p className="text-center text-xs text-white/50 mt-6">
              Protected access • Firebase Authentication
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-white/60 mb-6">
              You are signed in but do not have admin privileges.
            </p>
            <button
              onClick={() => signOut(auth)}
              className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-white/10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent mb-2">
                Admin Dashboard
              </h1>
              <p className="text-white/60">Manage E-Cell events and content</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-white font-medium">{user.email}</p>
                <p className="text-xs text-green-400 flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  Admin Active
                </p>
              </div>
              <button
                onClick={() => signOut(auth)}
                className="p-2 hover:bg-white/10 rounded-lg transition duration-200 text-white/70 hover:text-white"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Event Form */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <Plus className="w-6 h-6 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Create Event</h2>
              </div>
              <AddEventForm />
            </div>
          </div>

          {/* Recent Events */}
          <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-pink-500/20 rounded-lg">
                <span className="text-pink-400 font-bold">📅</span>
              </div>
              <h3 className="text-xl font-bold text-white">Recent Events</h3>
            </div>

            {loadingEvents ? (
              <div className="flex justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-indigo-500" />
              </div>
            ) : recentEvents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/50">No events created yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                {recentEvents.slice(0, 15).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">
                          {ev.title}
                        </p>
                        <p className="text-xs text-white/60 mt-1">
                          {ev.date}{" "}
                          {ev.startTime ? `• ${ev.startTime}` : ""}
                        </p>
                        {ev.location && (
                          <p className="text-xs text-white/50 mt-0.5">
                            📍 {ev.location}
                          </p>
                        )}
                      </div>
                      {ev.category && (
                        <div className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full whitespace-nowrap">
                          {ev.category}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => startEditingEvent(ev)}
                        className="flex-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs rounded-lg transition duration-200 flex items-center justify-center gap-1"
                        title="Edit event"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        disabled={deleting === ev.id}
                        className="flex-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded-lg transition duration-200 flex items-center justify-center gap-1 disabled:opacity-60"
                        title="Delete event"
                      >
                        {deleting === ev.id ? (
                          <>
                            <Loader className="w-3 h-3 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Edit Event Modal */}
        {editingId && editData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Edit2 className="w-6 h-6 text-indigo-400" />
                  Edit Event
                </h3>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setEditData(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition duration-200"
                >
                  <X className="w-5 h-5 text-white/70" />
                </button>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Event Title
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editData.title || ""}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">
                    Description
                  </label>
                  <textarea
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={2}
                    value={editData.description || ""}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Date</label>
                    <input
                      type="date"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editData.date || ""}
                      onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Start Time</label>
                    <input
                      type="time"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editData.startTime || ""}
                      onChange={(e) => setEditData({ ...editData, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">End Time</label>
                    <input
                      type="time"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editData.endTime || ""}
                      onChange={(e) => setEditData({ ...editData, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Location</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editData.location || ""}
                      onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Category</label>
                    <select
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editData.category || "Workshop"}
                      onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                    >
                      <option className="bg-slate-800">Workshop</option>
                      <option className="bg-slate-800">Mentorship</option>
                      <option className="bg-slate-800">Competition</option>
                      <option className="bg-slate-800">Speaker Session</option>
                      <option className="bg-slate-800">Networking</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleSaveEdit(editingId)}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setEditData(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gallery Upload Section */}
        <div className="mt-6 bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Upload className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Gallery Upload</h2>
          </div>

          <form onSubmit={handleUpload} className="max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-white/80 mb-2 block">
                  Event Title (Optional)
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200"
                  placeholder="e.g., Workshop 2025"
                  value={eventTitleForUpload}
                  onChange={(e) => setEventTitleForUpload(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white/80 mb-2 block">
                  Select File
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white file:bg-purple-500 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-2 items-end">
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 disabled:opacity-60 text-white font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setEventTitleForUpload("");
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-lg transition duration-200"
                >
                  Reset
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.8);
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          AddEventForm component (inline)                    */
/*  This function is included here so you have a single file to paste.        */
/*  It writes event docs to Firestore only (no Storage).                      */
/* -------------------------------------------------------------------------- */
function AddEventForm() {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [startTime, setStartTime] = useState(""); // HH:MM
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("Workshop");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const CATEGORIES = [
    "Workshop",
    "Mentorship",
    "Competition",
    "Speaker Session",
    "Networking",
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      alert("Please provide at least an event title and date.");
      return;
    }
    setSaving(true);
    setSuccessMessage("");
    try {
      await addDoc(collection(db, "events"), {
        title: title.trim(),
        description: desc.trim() || null,
        date, // YYYY-MM-DD
        startTime: startTime || null,
        endTime: endTime || null,
        location: location.trim() || null,
        category,
        createdBy: auth.currentUser ? auth.currentUser.uid : null,
        createdAt: serverTimestamp(),
      });
      
      setSuccessMessage("✓ Event created successfully!");
      
      // clear form
      setTitle("");
      setDesc("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setCategory(CATEGORIES[0]);
      
      // Hide success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Error saving event:", err);
      alert("Error saving event (see console)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {successMessage && (
        <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
          <p className="text-green-400 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-white/80 mb-2 block">
          Event Title *
        </label>
        <input
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
          placeholder="e.g., Startup Pitch Competition"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="text-sm font-medium text-white/80 mb-2 block">
          Description
        </label>
        <textarea
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200 resize-none"
          placeholder="Brief description of the event"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">
            Date *
          </label>
          <input
            type="date"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">
            Start Time
          </label>
          <input
            type="time"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">
            End Time
          </label>
          <input
            type="time"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">
            Location
          </label>
          <input
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
            placeholder="e.g., Seminar Hall / Online"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">
            Category *
          </label>
          <select
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-slate-800">
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 text-white font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
      >
        {saving ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Creating Event...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Create Event
          </>
        )}
      </button>
    </form>
  );
}
