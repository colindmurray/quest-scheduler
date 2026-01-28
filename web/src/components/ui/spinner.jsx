import { cn } from "../../lib/utils";

export function Spinner({ className, size = "md" }) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-3",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-slate-200 border-t-brand-primary dark:border-slate-700",
        sizeClasses[size] || sizeClasses.md,
        className
      )}
    />
  );
}

export function LoadingState({ message = "Loading...", className }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-slate-600 dark:text-slate-400",
        className
      )}
    >
      <Spinner />
      <span>{message}</span>
    </div>
  );
}
