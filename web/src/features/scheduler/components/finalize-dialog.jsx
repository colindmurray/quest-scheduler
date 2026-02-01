import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";

export function FinalizeDialog({
  open,
  onOpenChange,
  saving = false,
  createCalendarEvent = false,
  onToggleCreateCalendarEvent,
  linkedCalendars = [],
  selectedCalendarId = "",
  onSelectCalendarId,
  eventTitle,
  onChangeEventTitle,
  eventDescription,
  onChangeEventDescription,
  eventDuration,
  onChangeEventDuration,
  eventAttendees,
  onChangeEventAttendees,
  deleteOldEvent = false,
  onToggleDeleteOldEvent,
  hasExistingEvent = false,
  onOpenSettings,
  onFinalize,
}) {
  const hasCalendars = linkedCalendars.length > 0;
  const calendarName =
    linkedCalendars.find((item) => item.id === selectedCalendarId)?.name ||
    linkedCalendars[0]?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalize session</DialogTitle>
          <DialogDescription>
            Confirm the calendar details before locking votes.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <span>Create Google Calendar event</span>
            <Switch
              checked={createCalendarEvent}
              disabled={!hasCalendars}
              onCheckedChange={onToggleCreateCalendarEvent}
            />
          </label>
          {!hasCalendars && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              Link a Google Calendar in Settings to enable event creation.
              <button
                type="button"
                onClick={onOpenSettings}
                className="ml-2 underline underline-offset-2"
              >
                Open settings
              </button>
            </div>
          )}
          {createCalendarEvent && hasCalendars && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Calendar: {calendarName}
            </p>
          )}
          {createCalendarEvent && hasCalendars && (
            <div className="grid gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Select calendar</span>
              <Select value={selectedCalendarId} onValueChange={onSelectCalendarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {linkedCalendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Event title
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventTitle}
                onChange={(event) => onChangeEventTitle(event.target.value)}
              />
            </label>
          )}
          {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Description
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventDescription}
                onChange={(event) => onChangeEventDescription(event.target.value)}
              />
            </label>
          )}
          {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Duration (min)
              <input
                type="number"
                min="30"
                step="30"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventDuration}
                onChange={(event) => onChangeEventDuration(event.target.value)}
              />
            </label>
          )}
          {createCalendarEvent && (
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Attendees (comma or newline separated)
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={eventAttendees}
                onChange={(event) => onChangeEventAttendees(event.target.value)}
              />
            </label>
          )}
          {createCalendarEvent && hasExistingEvent && (
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={deleteOldEvent}
                onChange={(event) => onToggleDeleteOldEvent(event.target.checked)}
              />
              Delete previous calendar event on finalize
            </label>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onFinalize}
            disabled={saving}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {saving ? "Finalizing..." : "Finalize"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
