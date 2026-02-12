import { Plus, Search, X } from "lucide-react";
import { DASHBOARD_STATUS_OPTIONS } from "../lib/dashboard-filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { DatePicker } from "../../../components/ui/date-picker";

export function DashboardFilterBar({
  visibleDashboardFilterKeys = [],
  dashboardFilterEditor = null,
  handleDashboardFilterEditorOpenChange,
  removeDashboardFilter,
  dashboardGroupFilterLabel = "Questing group",
  selectedGroupFilterColor = null,
  dashboardStatusChipLabel = "Status",
  dashboardDateChipLabel = "Date range",
  selectedGroupFilterId = null,
  setSelectedGroupFilterId,
  groups = [],
  getGroupColor,
  dashboardStatusFilterSet,
  toggleDashboardStatusFilter,
  dashboardStatusFilters = [],
  setDashboardStatusFilters,
  effectiveDashboardDateFrom = null,
  effectiveDashboardDateTo = null,
  setDashboardDateFrom,
  setDashboardDateTo,
  handleDashboardDateFromChange,
  handleDashboardDateToChange,
  dashboardFilterPickerOpen = false,
  setDashboardFilterPickerOpen,
  availableDashboardFilters = [],
  handleAddDashboardFilter,
  dashboardSearchText = "",
  setDashboardSearchText,
}) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white/95 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        <div className="order-1 flex flex-wrap items-center gap-2 md:order-2 md:flex-nowrap">
          {visibleDashboardFilterKeys.map((filterKey) => {
            let label = "";
            let accentColor = null;
            if (filterKey === "group") {
              label = dashboardGroupFilterLabel;
              accentColor = selectedGroupFilterColor;
            } else if (filterKey === "status") {
              label = dashboardStatusChipLabel;
            } else if (filterKey === "date") {
              label = dashboardDateChipLabel;
            }
            return (
              <Popover
                key={filterKey}
                open={dashboardFilterEditor === filterKey}
                onOpenChange={(open) => handleDashboardFilterEditorOpenChange(filterKey, open)}
              >
                <div className="group relative">
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 pr-7 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      title={`Edit ${filterKey} filter`}
                    >
                      <span aria-hidden="true" className="inline-flex w-3.5 justify-center">
                        {filterKey === "group" ? (
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: accentColor || "#94a3b8" }}
                          />
                        ) : null}
                      </span>
                      <span className="max-w-[220px] truncate text-center leading-none">
                        {label}
                      </span>
                      <span aria-hidden="true" className="inline-flex w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeDashboardFilter(filterKey);
                    }}
                    className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 opacity-0 transition-opacity hover:bg-slate-400/15 hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-600/30 dark:hover:text-slate-200"
                    aria-label={`Remove ${filterKey} filter`}
                    title={`Remove ${filterKey} filter`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <PopoverContent
                  align="end"
                  className={filterKey === "date" ? "w-[30rem] p-3" : "w-72 p-3"}
                >
                  {filterKey === "group" ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Questing group
                      </p>
                      <Select
                        value={selectedGroupFilterId || "none"}
                        onValueChange={(value) =>
                          setSelectedGroupFilterId(value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm dark:border-slate-600 dark:bg-slate-900">
                          <SelectValue placeholder="Select a questing group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose a questing group</SelectItem>
                          {(groups || []).map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: getGroupColor(group.id) }}
                                />
                                <span>{group.name || "Questing group"}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {filterKey === "status" ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Status
                      </p>
                      <div className="space-y-1">
                        {DASHBOARD_STATUS_OPTIONS.map((option) => {
                          const checked = dashboardStatusFilterSet.has(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                              title={option.description}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDashboardStatusFilter(option.value)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-primary focus:ring-brand-primary/40 dark:border-slate-600"
                              />
                              <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {dashboardStatusFilters.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDashboardStatusFilters([])}
                          className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {filterKey === "date" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Date range
                        </p>
                        {(effectiveDashboardDateFrom || effectiveDashboardDateTo) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDashboardDateFrom(null);
                              setDashboardDateTo(null);
                            }}
                            className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <DatePicker
                          date={effectiveDashboardDateFrom}
                          onSelect={handleDashboardDateFromChange}
                          placeholder="From date"
                          className="h-10 min-w-[13rem] rounded-xl border-slate-200 text-sm dark:border-slate-600"
                        />
                        <DatePicker
                          date={effectiveDashboardDateTo}
                          onSelect={handleDashboardDateToChange}
                          placeholder="To date"
                          className="h-10 min-w-[13rem] rounded-xl border-slate-200 text-sm dark:border-slate-600"
                        />
                      </div>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            );
          })}
          <Popover open={dashboardFilterPickerOpen} onOpenChange={setDashboardFilterPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={availableDashboardFilters.length === 0}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Filter
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Add filter
              </p>
              <div className="space-y-1">
                {availableDashboardFilters.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                    All filters are already active.
                  </p>
                ) : (
                  availableDashboardFilters.map((filterOption) => (
                    <button
                      key={filterOption.key}
                      type="button"
                      onClick={() => handleAddDashboardFilter(filterOption.key)}
                      className="flex w-full flex-col items-start rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {filterOption.label}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {filterOption.description}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <label
          className="relative order-2 w-full min-w-0 md:order-1 md:min-w-[33%] md:flex-[1_1_32rem]"
          title="Search session and general poll titles and descriptions"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={dashboardSearchText}
            onChange={(event) => setDashboardSearchText(event.target.value)}
            placeholder="Search title or description"
            aria-label="Search title or description"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-primary/70 focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>
    </section>
  );
}
