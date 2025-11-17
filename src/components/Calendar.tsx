"use client";
import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Animation styles for smooth transitions
const animationStyles = `
  @keyframes slideOutUp {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
  
  .animate-out {
    animation: slideOutUp 0.15s ease-in forwards;
  }

  /* Custom scrollbar styling */
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
`;

export const EVENT_TYPES = {
  workshop: {
    title: "Workshop",
    examples: ["Startup Ideation Workshop", "Business Model Canvas", "Pitch Perfect Workshop", "Design Thinking Session"],
    color: "bg-violet-500/90 text-white"
  },
  mentorship: {
    title: "Mentorship",
    examples: ["Founder Office Hours", "Alumni Mentorship Session", "Industry Expert Connect", "Technical Mentorship"],
    color: "bg-emerald-500/90 text-white"
  },
  competition: {
    title: "Competition",
    examples: ["Pitch Competition", "Hackathon", "Case Study Challenge", "B-Plan Competition"],
    color: "bg-amber-500/90 text-white"
  },
  speaker: {
    title: "Speaker Session",
    examples: ["Founder's Talk", "Industry Leader Session", "Alumni Success Story", "Tech Entrepreneurship Talk"],
    color: "bg-sky-500/90 text-white"
  },
  networking: {
    title: "Networking",
    examples: ["Startup Mixer", "Industry Connect", "Alumni Network Meet", "Investor Networking"],
    color: "bg-rose-500/90 text-white"
  }
};

export interface Event {
  title: string;
  type: keyof typeof EVENT_TYPES;
  time: string;
  location: string;
  description?: string;
  id?: string;
  date?: string;
}

interface FirebaseEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  category?: string;
  createdAt?: any;
  createdBy?: string;
}

type Events = Record<number, Event[]>;

// Local storage key for events
const EVENTS_STORAGE_KEY = 'ecell-calendar-events';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function monthName(month: number) {
  return new Date(0, month).toLocaleString(undefined, { month: "long" });
}

function generateRandomEvents(year: number, month: number): Events {
  const daysInMonth = getDaysInMonth(year, month);
  const eventCount = 8; // 8 event days per month
  const events: Events = {};


  for (let i = 0; i < eventCount; i++) {
    const day = Math.floor(Math.random() * daysInMonth) + 1;
    const count = Math.floor(Math.random() * 2) + 1; // 1-2 events per day
    events[day] = events[day] || [];

    for (let j = 0; j < count; j++) {
      const type = Object.keys(EVENT_TYPES)[Math.floor(Math.random() * Object.keys(EVENT_TYPES).length)] as keyof typeof EVENT_TYPES;
      const eventType = EVENT_TYPES[type];
      const example = eventType.examples[Math.floor(Math.random() * eventType.examples.length)];
      const hour = 9 + Math.floor(Math.random() * 8);

      events[day].push({
        title: example,
        type: type,
        time: `${hour}:${Math.random() > 0.5 ? '30' : '00'}`,
        location: ["Room 102, Old Academic Block", "Seminar Hall", "E-Cell Space, Library Building", "Conference Room, R&D Block"][Math.floor(Math.random() * 4)]
      });
    }
  }
  return events;
}

const Calendar: React.FC = () => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [view, setView] = useState<'month' | 'list'>('month');
  const [selectedFilters, setSelectedFilters] = useState<Set<keyof typeof EVENT_TYPES>>(new Set(Object.keys(EVENT_TYPES) as Array<keyof typeof EVENT_TYPES>));
  const [events, setEvents] = useState<Events>({});
  const [firebaseEvents, setFirebaseEvents] = useState<FirebaseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Firebase events in real-time
  useEffect(() => {
    setLoading(true);
    try {
      const q = query(collection(db, "events"), orderBy("date", "asc"));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const fetchedEvents: FirebaseEvent[] = [];
          snapshot.forEach((doc) => {
            fetchedEvents.push({
              id: doc.id,
              ...doc.data(),
            } as FirebaseEvent);
          });
          setFirebaseEvents(fetchedEvents);
          transformFirebaseEventsToCalendar(fetchedEvents);
          setLoading(false);
        },
        (error) => {
          console.error("Error fetching events:", error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase subscription error:", error);
      setLoading(false);
    }
  }, []);

  // Transform Firebase events to calendar format
  const transformFirebaseEventsToCalendar = (fbEvents: FirebaseEvent[]) => {
    const transformedEvents: Events = {};

    fbEvents.forEach((event) => {
      try {
        // Parse date (YYYY-MM-DD format)
        const [year, month, day] = event.date.split("-").map(Number);
        const eventDate = new Date(year, month - 1, day);
        const dayOfMonth = eventDate.getDate();

        // Determine event type from category
        let eventType: keyof typeof EVENT_TYPES = "workshop"; // default
        if (event.category) {
          const categoryLower = event.category.toLowerCase();
          if (categoryLower.includes("mentorship")) eventType = "mentorship";
          else if (categoryLower.includes("competition")) eventType = "competition";
          else if (categoryLower.includes("speaker")) eventType = "speaker";
          else if (categoryLower.includes("networking")) eventType = "networking";
          else eventType = "workshop";
        }

        // Use startTime if available, otherwise use "All Day"
        const time = event.startTime || "All Day";

        const transformedEvent: Event = {
          id: event.id,
          title: event.title,
          type: eventType,
          time: time,
          location: event.location || "TBD",
          description: event.description || undefined,
          date: event.date,
        };

        if (!transformedEvents[dayOfMonth]) {
          transformedEvents[dayOfMonth] = [];
        }
        transformedEvents[dayOfMonth].push(transformedEvent);
      } catch (err) {
        console.warn("Error transforming event:", event, err);
      }
    });

    setEvents(transformedEvents);
  };

  // Sort events by time
  const sortEvents = (events: Event[]) => {
    return [...events].sort((a, b) => {
      return a.time.localeCompare(b.time);
    });
  };

  const handlePrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
    setSelected(null);
  };

  const handleNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
    setSelected(null);
  };

  const handleToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelected(null);
    setIsClosing(false);
  };

  const handleCloseWithAnimation = () => {
    setIsClosing(true);
    setTimeout(() => {
      setSelected(null);
      setIsClosing(false);
    }, 150); // Match animation duration
  };

  const toggleFilter = (eventType: keyof typeof EVENT_TYPES) => {
    setSelectedFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(eventType)) {
        newFilters.delete(eventType);
      } else {
        newFilters.add(eventType);
      }
      return newFilters;
    });
  };

  const toggleAllFilters = () => {
    if (selectedFilters.size === Object.keys(EVENT_TYPES).length) {
      // All selected, so uncheck all
      setSelectedFilters(new Set());
    } else {
      // Not all selected, so check all
      setSelectedFilters(new Set(Object.keys(EVENT_TYPES) as Array<keyof typeof EVENT_TYPES>));
    }
  };

  // Check if we're on the current month
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);

  // Filter events based on selected filters
  const filteredEvents: Events = {};
  Object.entries(events).forEach(([day, dayEvents]) => {
    filteredEvents[Number(day)] = dayEvents.filter(ev => selectedFilters.has(ev.type));
  });

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const allEventsList = Object.entries(filteredEvents)
    .flatMap(([day, evs]) => evs.map(ev => ({ day: Number(day), ...ev })))
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

  return (
    <div className="max-w-7xl mx-auto p-4">
      <style>{animationStyles}</style>
      
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4" aria-hidden="true"></div>
              <p className="text-white/70">Loading events...</p>
          </div>
        </div>
      )}

      {!loading && (
      <div className="grid md:grid-cols-4 gap-4">
        {/* Sidebar */}
        <aside className="md:col-span-1 bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-2xl p-4 text-white/95 shadow-xl border border-white/10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                E-Cell Calendar
              </h4>
              <p className="text-sm text-white/80">IIIT Delhi</p>
            </div>
          </div>



          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${view === 'month'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                : 'bg-white/5 hover:bg-white/10'
                }`}
            >
              Month View
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${view === 'list'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                : 'bg-white/5 hover:bg-white/10'
                }`}
            >
              List View
            </button>
          </div>

          {/* Event categories - Filter Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-white/90">Event Categories</h5>
              <button
                onClick={toggleAllFilters}
                className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white"
                title={selectedFilters.size === Object.keys(EVENT_TYPES).length ? "Uncheck all" : "Check all"}
              >
                {/* {selectedFilters.size === Object.keys(EVENT_TYPES).length ? "✓ Select All" : "✗ Select None"} */}
                {selectedFilters.size === Object.keys(EVENT_TYPES).length ? "✗ Select None" : "✓ Select All"}
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(EVENT_TYPES).map(([key, { title, color }]) => (
                <button
                  key={key}
                  onClick={() => toggleFilter(key as keyof typeof EVENT_TYPES)}
                  className={`w-full flex items-center gap-2 text-sm p-2 rounded-lg transition-all ${
                    selectedFilters.has(key as keyof typeof EVENT_TYPES)
                      ? `${color} shadow-lg`
                      : 'bg-white/5 hover:bg-white/10 opacity-50'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${color}`}></div>
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming events - Flex grow to take remaining space */}
          <div className="flex-1 flex flex-col min-h-0">
            <h5 className="text-sm font-medium mb-2 text-white/90">Upcoming Events</h5>
            <div className="custom-scrollbar space-y-3 overflow-y-auto flex-1">
              {allEventsList.slice(0, 5).map((ev, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors">
                  <div className={`text-sm font-medium ${EVENT_TYPES[ev.type].color.replace('bg-', 'text-').replace('/90', '/80')}`}>
                    {ev.title}
                  </div>
                  <div className="text-xs text-white/70 mt-1">
                    {monthName(month)} {ev.day} • {ev.time}
                  </div>
                  <div className="text-xs text-white/60 mt-0.5">{ev.location}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Calendar area */}
        <section className="md:col-span-3 bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-2xl p-4 text-white shadow-xl border border-white/10">
          <div className="mb-4 flex items-center justify-between">
            {/* Left: Navigation with Month Name between arrows + View Today button */}
            <div className="flex items-center gap-3">
              <button onClick={handlePrev} className="bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors text-white/80 hover:text-white font-medium">
                ◀
              </button>
              <div className="text-2xl font-medium bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent min-w-[200px] text-center">
                {monthName(month)} {year}
              </div>
              <button onClick={handleNext} className="bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-colors text-white/80 hover:text-white font-medium">
                ▶
              </button>
              <button
                onClick={handleToday}
                disabled={isCurrentMonth}
                className={`px-4 py-2 rounded-lg text-white font-medium transition-all duration-200 text-sm ${
                  isCurrentMonth
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-xl'
                }`}
              >
                Current Month
              </button>
            </div>

            {/* Right: Event count */}
            <div className="text-sm font-medium bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
              {allEventsList.length} events this month
            </div>
          </div>

          {view === 'list' ? (
            <div className="space-y-3">
              {allEventsList.map((ev, i) => (
                <div key={i} className={`${EVENT_TYPES[ev.type].color} p-3 rounded-lg shadow-lg`}>
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-sm mt-1">{monthName(month)} {ev.day} • {ev.time}</div>
                  <div className="text-xs mt-0.5 text-white/90">{ev.location}</div>
                  {ev.description && (
                    <div className="text-xs mt-2 text-white/80 border-t border-white/10 pt-2">
                      {ev.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 text-center mb-2">
                {WEEK_DAYS.map((d) => (
                  <div key={d} className="text-xs font-medium text-white/70 py-2">{d}</div>
                ))}
              </div>

              <div>
                {/* Render calendar in weeks */}
                {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, weekIndex) => {
                  const weekCells = cells.slice(weekIndex * 7, (weekIndex + 1) * 7);
                  const selectedInThisWeek = selected && weekCells.some(c => c.day === selected);

                  return (
                    <div key={weekIndex}>
                      <div className="grid grid-cols-7 gap-2 mb-2">
                        {weekCells.map((c, i) => (
                          <div
                            key={weekIndex * 7 + i}
                            onClick={() => {
                        if (!c.day) return;
                        if (selected === c.day) {
                          handleCloseWithAnimation();
                        } else {
                          setSelected(c.day);
                          setIsClosing(false);
                        }
                      }}
                            className={`
                              min-h-[7rem] p-3 rounded-lg cursor-pointer relative
                              ${c.day ? 'bg-white/5 hover:bg-white/10' : 'bg-transparent'} 
                              ${c.day && selected === c.day ? 'ring-2 ring-indigo-500' : ''}
                              transition-colors flex flex-col justify-start
                            `}
                          >
                            {/* Today's modern corner tab */}
                            {c.day === today.getDate() && month === today.getMonth() && year === today.getFullYear() && (
                              <div className="absolute top-0 left-0 bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-semibold w-2/3 h-8 flex items-center justify-start pl-3 rounded-tl-lg rounded-br-xl shadow-[0_4px_12px_rgba(99,102,241,0.4)] border border-white/20">
                                {c.day}
                              </div>
                            )}
                            <div className="flex justify-between items-start mb-2">
                              <div className={`
                                text-sm font-medium 
                                ${c.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                                  ? 'opacity-0'
                                  : 'text-white/90'
                                }
                              `}>
                                {c.day ?? ''}
                              </div>
                              {c.day && filteredEvents[c.day] && (
                                <div className="text-xs text-white/90 bg-white/10 px-2 py-0.5 rounded-full">
                                  {filteredEvents[c.day].length}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-1">
                              {c.day && filteredEvents[c.day]?.map((ev, idx) => (
                                <div
                                  key={idx}
                                  className={`${EVENT_TYPES[ev.type].color} text-[0.7rem] px-2 py-1 rounded-md truncate shadow-sm`}
                                >
                                  {ev.time} • {ev.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Selected day drawer - appears between weeks */}
                      {selectedInThisWeek && selected && (
                        <div key={`drawer-${selected}`} className={`bg-white/5 p-4 rounded-lg border border-white/10 mb-2 ${isClosing ? 'animate-out' : 'animate-in fade-in slide-in-from-top-2 duration-300'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-lg bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                              Events on {monthName(month)} {selected}
                            </h4>
                            <button
                              onClick={handleCloseWithAnimation}
                              className="text-sm text-white/70 hover:text-white/90 transition-colors"
                            >
                              Close
                            </button>
                          </div>
                          {filteredEvents[selected]?.length > 0 ? (
                            <div className="space-y-3">
                              {filteredEvents[selected].map((ev, i) => (
                                <div key={i} className={`${EVENT_TYPES[ev.type].color} p-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-left-2 duration-150`}>
                                  <div className="font-medium">{ev.title}</div>
                                  <div className="text-sm mt-1">{ev.time}</div>
                                  <div className="text-xs mt-0.5 text-white/90">{ev.location}</div>
                                  {ev.description && (
                                    <div className="text-xs mt-2 text-white/80 border-t border-white/10 pt-2">
                                      {ev.description}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 animate-in fade-in duration-300">
                              <p className="text-white/50">No events scheduled for this day</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
      )}
    </div>
  );
};

export default Calendar;
