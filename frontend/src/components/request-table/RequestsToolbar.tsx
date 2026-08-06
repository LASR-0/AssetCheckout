"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Role } from "@/types/authType";

type Props = {
  search: string;
  setSearch: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
  setPage: (value: number) => void;
  setSelectedTier: (value: string) => void;
  selectedTier: string;
  tiers: string[];
  role: Role;
  /** Set when the table is pinned to one request via ?requestId — see
   *  RequestsTablePage. Renders a dismissible chip so the narrowing is visible
   *  and reversible; without it a single-row table looks like a broken filter. */
  pinnedId?: number | null;
  onClearPin?: () => void;
};

export default function RequestsToolbar({ search, setSearch, status, setStatus, pageSize, setPageSize, setPage, pinnedId, onClearPin }: Props) {

  const [openRequest, setOpenRequest] = useState(false);
  const [openPage, setOpenPage] = useState(false);
  // One entry per badge the table can show, in lifecycle order, because the
  // four raw RequestStatus values couldn't distinguish the stages people
  // actually chase — RequestStatus.COMPLETED covers "checked out but still on a
  // desk in IT", "in the post" and "in the requester's hands" alike. Every
  // value here is a stage key from deriveStage (statusbadge.tsx) and the labels
  // match the badges exactly, so a filter reads as "show me the rows with this
  // badge". Filtering is entirely client-side now — see RequestsTablePage.
  //
  // Two synthetic groups, marked so they read as spans rather than stages:
  //   IN_PROGRESS  everything still in flight (the home page's tile links here)
  //   DONE         the terminal stages, i.e. the requester actually has it
  const statusOptions = [
    { label: "All", value: "ALL", icon: "list" },
    { label: "In progress", value: "IN_PROGRESS", icon: "pending" },
    { label: "Pending", value: "PENDING", icon: "schedule" },
    { label: "Awaiting IT", value: "AWAITING_IT", icon: "shield_person" },
    { label: "Approved", value: "APPROVED", icon: "schedule" },
    { label: "Quote with manager", value: "AWAITING_QUOTE", icon: "request_quote" },
    { label: "Assigned", value: "ASSIGNED", icon: "assignment_ind" },
    { label: "Ready to collect", value: "READY_TO_COLLECT", icon: "package_2" },
    { label: "Shipped", value: "SHIPPED", icon: "local_shipping" },
    { label: "Completed", value: "DONE", icon: "task_alt" },
    { label: "Rejected", value: "REJECTED", icon: "cancel" },
  ];
  const pageSizeOptions = [
    {label: "10", value: 10, icon: "menu"},
    {label: "20", value: 20, icon: "menu"},
    {label: "50", value: 50, icon: "density_small"},
    {label: "100", value: 100, icon: "density_small"},
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 bg-surface-container-low flex flex-col sm:flex-row justify-between items-center gap-4 rounded-tl-xl rounded-tr-xl">

        {/* SEARCH INPUT */}
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined font-body !text-[16px]">
              search
            </span>
          </span>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Requests"
            className="block w-full pl-10 pr-3 py-2 border-transparent bg-surface-container-lowest rounded-full shadow-sm focus:ring-primary focus:border-primary text-sm font-body outline-none transition-all"
          />
        </div>

        {/* PINNED-REQUEST CHIP — only while ?requestId is narrowing the table */}
        {pinnedId != null && (
          <div className="flex w-full sm:w-auto items-center gap-2 rounded-full border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm">
            <span className="material-symbols-outlined !text-[16px] text-info-light">
              filter_alt
            </span>
            <span className="text-on-surface-variant whitespace-nowrap">
              Showing request{" "}
              <span className="font-mono font-semibold">#{pinnedId}</span>
            </span>
            <button
              type="button"
              onClick={onClearPin}
              title="Show all requests"
              className="ml-auto sm:ml-1 inline-flex items-center text-info-light hover:text-on-background hover:cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined !text-[16px]">close</span>
            </button>
          </div>
        )}

          <div className="flex gap-3 w-full sm:w-auto">

                  <Popover open={openPage} onOpenChange={setOpenPage}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button className="flex-1 shadow-sm !text-info-light sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-filter/30 text-on-surface text-sm font-medium rounded-md hover:brightness-70 hover:cursor-pointer transition-colors">

                            <span className="material-symbols-outlined !text-info-light mr-2 !text-sm">
                              tune
                            </span>

                            {pageSize}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Rows per page
                      </TooltipContent>
                    </Tooltip>

                      <PopoverContent className="w-40 bg-surface p-1">

                        {pageSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setPageSize(option.value);
                              setPage(1);
                              setOpenPage(false);
                            }}
                            className="w-full flex items-center gap-2 text-left bg-surface text-info-light px-3 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-base">
                              {option.icon}
                            </span>
                            {option.label}
                          </button>
                        ))}

                      </PopoverContent>
                  </Popover>


                  <Popover open={openRequest} onOpenChange={setOpenRequest}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button className="flex-1 shadow-sm !text-info-light sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-filter/30 text-on-surface text-sm font-medium rounded-md hover:brightness-70 hover:cursor-pointer transition-colors">
                            <span className="material-symbols-outlined !text-info-light mr-2 !text-sm">
                                filter_list
                            </span>
                            {/* Show the option's label, not the raw value —
                                IN_PROGRESS would otherwise read as a constant. */}
                            {status === "ALL"
                              ? "Filter"
                              : statusOptions.find((s) => s.value === status)
                                  ?.label ?? status}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Filter by status
                      </TooltipContent>
                    </Tooltip>

                    {/* Wider and capped: the list is eleven stages now, and
                        "Quote with manager" doesn't fit w-40. */}
                    <PopoverContent className="w-56 max-h-80 overflow-y-auto bg-surface p-1">
                      {statusOptions.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => {
                            setStatus(s.value);
                            setOpenRequest(false);
                          }}
                          className="w-full flex items-center gap-2 text-left bg-surface text-info-light px-3 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-base">
                            {s.icon}
                          </span>
                          {s.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>

          </div>

      </div>
    </TooltipProvider>
  );
}