import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../app/useAuth";
import { MAX_FEEDBACK_FILE_SIZE, submitFeedback } from "../lib/data/feedback";

const ISSUE_TYPES = [
  "Bug",
  "Feature request",
  "Account issue",
  "Calendar sync",
  "Performance",
  "Other",
];

const bytesToMb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

const isSupportedAttachment = (file) =>
  file?.type?.startsWith("image/") || file?.type?.startsWith("video/");

export default function FeedbackForm({ onSubmitted }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const canSubmit = useMemo(() => {
    if (!user?.uid) return false;
    return Boolean(title.trim() && issueType.trim() && description.trim());
  }, [user?.uid, title, issueType, description]);

  const resetForm = () => {
    setTitle("");
    setIssueType("");
    setDescription("");
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!isSupportedAttachment(file)) {
      toast.error("Only image or video files are supported.");
      event.target.value = "";
      setAttachment(null);
      return;
    }
    if (file.size > MAX_FEEDBACK_FILE_SIZE) {
      toast.error("Attachment must be 20 MB or less.");
      event.target.value = "";
      setAttachment(null);
      return;
    }
    setAttachment(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user?.uid) {
      toast.error("Please sign in to send feedback.");
      return;
    }

    setSubmitting(true);
    try {
      const context = {
        path: window.location?.pathname || null,
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: navigator.platform,
        submittedFrom: "account_dropdown",
      };

      await submitFeedback({
        user,
        title,
        issueType,
        description,
        attachment,
        context,
      });

      toast.success("Thanks! Your feedback was sent.");
      resetForm();
      onSubmitted?.();
    } catch (error) {
      toast.error(error?.message || "Unable to send feedback right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 text-xs">
      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Title
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          placeholder="Short summary"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={submitting}
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Issue type
        <select
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          value={issueType}
          onChange={(event) => setIssueType(event.target.value)}
          disabled={submitting}
        >
          <option value="" disabled>
            Select type
          </option>
          {ISSUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Description
        <textarea
          className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          placeholder="Tell us what you expected vs. what happened."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Attachment (optional)
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          disabled={submitting}
          className="mt-1 w-full rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-slate-600 hover:file:bg-slate-200 dark:border-slate-700 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
        />
      </label>
      <div className="text-[11px] text-slate-400 dark:text-slate-500">
        {attachment
          ? `Selected: ${attachment.name} (${bytesToMb(attachment.size)} MB)`
          : "Images or videos up to 20 MB."}
      </div>
      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="mt-1 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending..." : "Submit feedback"}
      </button>
    </form>
  );
}
