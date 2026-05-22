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
};

export default function RequestsToolbar({ search, setSearch, status, setStatus, pageSize, setPageSize, setPage, }: Props) {

  const [openRequest, setOpenRequest] = useState(false);
  const [openPage, setOpenPage] = useState(false);
  const statusOptions = [
    { label: "All", value: "ALL", icon: "list" },
    { label: "Pending", value: "PENDING", icon: "schedule" },
    { label: "Approved", value: "APPROVED", icon: "check_circle" },
    { label: "Completed", value: "COMPLETED", icon: "task_alt" },
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
      <div className="p-6 bg-surface-container-low/80 flex flex-col sm:flex-row justify-between items-center gap-4 rounded-tl-xl rounded-tr-xl">

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
            className="block w-full pl-10 pr-3 py-2 border-transparent bg-surface-container-lowest rounded-md focus:ring-primary focus:border-primary text-sm font-body outline-none transition-all"
          />
        </div>

          <div className="flex gap-3 w-full sm:w-auto">

                  <Popover open={openPage} onOpenChange={setOpenPage}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button className="flex-1 !text-info-light sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-filter/30 text-on-surface text-sm font-medium rounded-md hover:brightness-70 hover:cursor-pointer transition-colors">

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
                          <button className="flex-1 !text-info-light sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-filter/30 text-on-surface text-sm font-medium rounded-md hover:brightness-70 hover:cursor-pointer transition-colors">
                            <span className="material-symbols-outlined !text-info-light mr-2 !text-sm">
                                filter_list
                            </span>
                            {status === "ALL" ? "Filter" : status}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Filter by status
                      </TooltipContent>
                    </Tooltip>

                    <PopoverContent className="w-40 bg-surface p-1">
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