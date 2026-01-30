import { useCallback, useEffect, useMemo, useState } from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

const DEFAULT_SCROLL_MINUTES = 8 * 60;
const ESTIMATED_SLOT_HEIGHT_PX = 20;
const DEFAULT_STEP_MINUTES = 30;
const MINUTES_IN_DAY = 24 * 60;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toMinutes = (date) => date.getHours() * 60 + date.getMinutes();
const toScrollDate = (minutes) =>
  new Date(1970, 0, 1, Math.floor(minutes / 60), minutes % 60, 0, 0);

const getViewRange = (view, date) => {
  if (view === "month") {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  if (view === "day") {
    return { start: startOfDay(date), end: endOfDay(date) };
  }
  return {
    start: startOfWeek(date, { weekStartsOn: 0 }),
    end: endOfWeek(date, { weekStartsOn: 0 }),
  };
};

const eventOverlapsRange = (event, range) =>
  event.start < range.end && event.end > range.start;

const getBucketStart = (view, date) => {
  if (view === "month") return startOfMonth(date);
  if (view === "day") return startOfDay(date);
  return startOfWeek(date, { weekStartsOn: 0 });
};

const isSameBucket = (view, a, b) => {
  if (view === "month") return isSameMonth(a, b);
  if (view === "day") return isSameDay(a, b);
  return isSameWeek(a, b, { weekStartsOn: 0 });
};

const estimateVisibleMinutes = (height, stepMinutes) => {
  if (!height) return 8 * 60;
  const slotsVisible = Math.max(1, Math.floor(height / ESTIMATED_SLOT_HEIGHT_PX));
  const estimated = slotsVisible * stepMinutes;
  return clamp(estimated, 4 * 60, 8 * 60);
};

const getTimeBounds = (events) => {
  let earliest = null;
  let latest = null;
  events.forEach((event) => {
    const startMinutes = toMinutes(event.start);
    const endMinutes = toMinutes(event.end || event.start);
    const safeEnd = Math.max(endMinutes, startMinutes);
    if (earliest === null || startMinutes < earliest) earliest = startMinutes;
    if (latest === null || safeEnd > latest) latest = safeEnd;
  });
  return {
    earliestStart: earliest ?? DEFAULT_SCROLL_MINUTES,
    latestEnd: latest ?? DEFAULT_SCROLL_MINUTES,
  };
};

export function useCalendarNavigation({
  events = [],
  view,
  date,
  height,
  step = DEFAULT_STEP_MINUTES,
  onNavigate,
}) {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [scrollMinutes, setScrollMinutes] = useState(DEFAULT_SCROLL_MINUTES);
  const [scrollToTime, setScrollToTime] = useState(toScrollDate(DEFAULT_SCROLL_MINUTES));

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events]
  );
  const viewRange = useMemo(() => getViewRange(view, date), [view, date]);
  const eventsInView = useMemo(
    () => sortedEvents.filter((event) => eventOverlapsRange(event, viewRange)),
    [sortedEvents, viewRange]
  );
  const visibleMinutes = useMemo(
    () => estimateVisibleMinutes(height, step),
    [height, step]
  );

  const applyScrollMinutes = useCallback(
    (minutes) => {
      const maxTop = Math.max(0, MINUTES_IN_DAY - visibleMinutes);
      const clamped = clamp(Math.round(minutes), 0, maxTop);
      setScrollMinutes(clamped);
      setScrollToTime(toScrollDate(clamped));
    },
    [visibleMinutes]
  );

  useEffect(() => {
    if (view === "month" || eventsInView.length === 0) return;

    const selectedEvent = selectedEventId
      ? sortedEvents.find((event) => event.id === selectedEventId)
      : null;
    if (selectedEvent) {
      const startMinutes = toMinutes(selectedEvent.start);
      const endMinutes = Math.max(toMinutes(selectedEvent.end || selectedEvent.start), startMinutes);
      const bottom = scrollMinutes + visibleMinutes;
      if (startMinutes >= scrollMinutes && endMinutes <= bottom) return;
    }

    const { earliestStart, latestEnd } = getTimeBounds(eventsInView);
    const midpoint =
      eventsInView.length === 1
        ? earliestStart
        : Math.round((earliestStart + latestEnd) / 2);
    let top = midpoint - visibleMinutes / 2;
    if (top > earliestStart) {
      top = earliestStart;
    }
    applyScrollMinutes(top);
  }, [
    view,
    eventsInView,
    visibleMinutes,
    selectedEventId,
    sortedEvents,
    scrollMinutes,
    applyScrollMinutes,
  ]);

  const ensureEventInView = useCallback(
    (event) => {
      if (!event || !onNavigate) return;
      if (view === "month" && !isSameMonth(event.start, date)) {
        onNavigate(event.start);
        return;
      }
      if (view === "day" && !isSameDay(event.start, date)) {
        onNavigate(event.start);
        return;
      }
      if (view === "week" && !isSameWeek(event.start, date, { weekStartsOn: 0 })) {
        onNavigate(event.start);
      }
    },
    [view, date, onNavigate]
  );

  const ensureEventVisible = useCallback(
    (event) => {
      if (!event || view === "month") return;
      const startMinutes = toMinutes(event.start);
      const endMinutes = Math.max(toMinutes(event.end || event.start), startMinutes);
      const bottom = scrollMinutes + visibleMinutes;
      if (startMinutes < scrollMinutes) {
        applyScrollMinutes(startMinutes);
      } else if (endMinutes > bottom) {
        applyScrollMinutes(endMinutes - visibleMinutes);
      }
    },
    [view, scrollMinutes, visibleMinutes, applyScrollMinutes]
  );

  const focusEvent = useCallback(
    (event) => {
      if (!event) return;
      setSelectedEventId(event.id);
      ensureEventInView(event);
      ensureEventVisible(event);
    },
    [ensureEventInView, ensureEventVisible]
  );

  const findFirstAfter = useCallback(
    (targetDate) =>
      sortedEvents.findIndex((event) => event.start.getTime() >= targetDate.getTime()),
    [sortedEvents]
  );
  const findLastBefore = useCallback(
    (targetDate) =>
      sortedEvents
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.start.getTime() <= targetDate.getTime())
        .pop()?.index ?? -1,
    [sortedEvents]
  );

  const getDefaultIndex = useCallback(
    (direction) => {
      if (eventsInView.length > 0) {
        const targetEvent = direction === "next" ? eventsInView[0] : eventsInView[eventsInView.length - 1];
        return sortedEvents.findIndex((event) => event.id === targetEvent.id);
      }
      if (direction === "next") {
        const idx = findFirstAfter(viewRange.end);
        return idx >= 0 ? idx : sortedEvents.length - 1;
      }
      const idx = findLastBefore(viewRange.start);
      return idx >= 0 ? idx : 0;
    },
    [eventsInView, sortedEvents, findFirstAfter, findLastBefore, viewRange]
  );

  const jumpNext = useCallback(() => {
    if (sortedEvents.length === 0) return;
    const currentIndex = sortedEvents.findIndex((event) => event.id === selectedEventId);
    const nextIndex =
      currentIndex >= 0 ? Math.min(currentIndex + 1, sortedEvents.length - 1) : getDefaultIndex("next");
    focusEvent(sortedEvents[nextIndex]);
  }, [sortedEvents, selectedEventId, focusEvent, getDefaultIndex]);

  const jumpPrev = useCallback(() => {
    if (sortedEvents.length === 0) return;
    const currentIndex = sortedEvents.findIndex((event) => event.id === selectedEventId);
    const prevIndex = currentIndex >= 0 ? Math.max(currentIndex - 1, 0) : getDefaultIndex("prev");
    focusEvent(sortedEvents[prevIndex]);
  }, [sortedEvents, selectedEventId, focusEvent, getDefaultIndex]);

  const buckets = useMemo(() => {
    const bucketMap = new Map();
    sortedEvents.forEach((event, index) => {
      const bucketStart = getBucketStart(view, event.start);
      const key = bucketStart.toISOString();
      if (!bucketMap.has(key)) {
        bucketMap.set(key, { key, start: bucketStart, firstIndex: index, lastIndex: index });
      } else {
        const existing = bucketMap.get(key);
        existing.lastIndex = index;
      }
    });
    return Array.from(bucketMap.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [sortedEvents, view]);

  const jumpNextWindow = useCallback(() => {
    if (buckets.length === 0) return;
    const currentBucketStart = getBucketStart(view, date);
    const currentIndex = buckets.findIndex((bucket) => isSameBucket(view, bucket.start, currentBucketStart));
    const nextBucket = buckets[Math.min(currentIndex + 1, buckets.length - 1)];
    if (!nextBucket) return;
    focusEvent(sortedEvents[nextBucket.firstIndex]);
  }, [buckets, date, view, focusEvent, sortedEvents]);

  const jumpPrevWindow = useCallback(() => {
    if (buckets.length === 0) return;
    const currentBucketStart = getBucketStart(view, date);
    const currentIndex = buckets.findIndex((bucket) => isSameBucket(view, bucket.start, currentBucketStart));
    const prevBucket = buckets[Math.max(currentIndex - 1, 0)];
    if (!prevBucket) return;
    focusEvent(sortedEvents[prevBucket.lastIndex]);
  }, [buckets, date, view, focusEvent, sortedEvents]);

  return {
    scrollToTime: view === "month" ? undefined : scrollToTime,
    selectedEventId,
    setSelectedEventId,
    hasEvents: sortedEvents.length > 0,
    hasEventsInView: eventsInView.length > 0,
    jumpNext,
    jumpPrev,
    jumpNextWindow,
    jumpPrevWindow,
  };
}
