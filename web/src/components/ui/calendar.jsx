import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "relative",
        months: "mx-auto flex w-fit flex-col gap-2 sm:flex-row",
        month: "mx-auto flex flex-col gap-4",
        month_caption: "relative flex h-9 w-full items-center justify-center py-1",
        caption_label: "text-sm font-semibold",
        nav: "absolute left-1/2 top-4 z-10 flex w-[15.5rem] -translate-x-1/2 items-center justify-between",
        button_previous: cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-transparent p-0 opacity-60 transition-opacity hover:opacity-100 dark:border-slate-700"
        ),
        button_next: cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-transparent p-0 opacity-60 transition-opacity hover:opacity-100 dark:border-slate-700"
        ),
        month_grid: "mx-auto w-full border-collapse",
        weekdays: "flex justify-center",
        weekday:
          "text-slate-500 dark:text-slate-400 rounded-md w-9 font-normal text-[0.8rem]",
        week: "mt-2 flex w-full justify-center",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-slate-100 dark:[&:has([aria-selected])]:bg-slate-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 dark:[&:has([aria-selected].day-outside)]:bg-slate-800/50"
        ),
        day_button: cn(
          "flex h-9 w-9 items-center justify-center rounded-full p-0 font-normal transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 aria-selected:opacity-100"
        ),
        range_end: "day-range-end",
        selected:
          "bg-brand-primary text-white hover:bg-brand-primary hover:text-white focus:bg-brand-primary focus:text-white",
        today: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
        outside:
          "day-outside text-slate-400 dark:text-slate-600 aria-selected:bg-slate-100/50 dark:aria-selected:bg-slate-800/50 aria-selected:text-slate-400 dark:aria-selected:text-slate-600",
        disabled: "text-slate-400 dark:text-slate-600 opacity-50",
        range_middle:
          "aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 aria-selected:text-slate-900 dark:aria-selected:text-slate-100",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
