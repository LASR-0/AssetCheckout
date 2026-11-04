import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet, TrayLabel } from "@/components/ui/tray";
import { iconForCategory } from "@/lib/categoryIcon";
import type { UserHoldings } from "@/types/holdingsType";
import { heldAccessories, heldAssets, heldDetail, type HeldItem } from "./held";
import { ROW, SKELETON } from "./styles";

type Props = {
  holdings: UseQueryResult<UserHoldings>;
  onReport: (item: HeldItem) => void;
  onReportMissing: () => void;
};

export default function WhatYouHave({ holdings, onReport, onReportMissing }: Props) {
  const assets = heldAssets(holdings.data);
  const accessories = heldAccessories(holdings.data);
  const count = assets.length + accessories.length;
  const groups = [
    { label: "Devices", items: assets },
    { label: "Accessories", items: accessories },
  ].filter((g) => g.items.length > 0);
  let first = true;

  return (
    <Tray
      label="What you have"
      aside={holdings.isSuccess && count > 0 ? `${count} item${count === 1 ? "" : "s"}` : undefined}
      data-tour={holdings.isSuccess && count > 0 ? "home-my-stuff" : undefined}
    >
      <Sheet className="overflow-hidden">
        {holdings.isPending ? (
          <div className="flex flex-col gap-3.5 px-3.5 py-4">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span className="size-9 rounded-9 bg-track" />
                <span className="flex flex-1 flex-col gap-1.75">
                  <span className={cn(SKELETON, "h-2.75 w-3/5")} />
                  <span className={cn(SKELETON, "h-2.25 w-[36%]")} />
                </span>
              </div>
            ))}
          </div>
        ) : holdings.isError ? (
          <div className="flex gap-2.5 px-3.5 py-4 fs-12 leading-normal text-tx3">
            <Icon name="cloud_off" size={17.5} className="text-mut" />
            <span>Couldn't load your items from our records right now. Your requests aren't affected.</span>
          </div>
        ) : (
          <>
            {count > 0 ? (
              <>
                <p className="m-0 px-3.5 pt-3 pb-1 fs-11.5 leading-normal text-pretty text-tx3">
                  Assigned to you in our records. Something look wrong? Select it and tell us.
                </p>
                {groups.map((g) => (
                  <div key={g.label}>
                    <TrayLabel className="px-3.5 pt-3 pb-1">{g.label}</TrayLabel>
                    {g.items.map((item) => {
                      const detail = heldDetail(item);
                      const anchor = first;
                      first = false;
                      return (
                        <button
                          key={`${item.subject}-${item.snipeRecordId}`}
                          type="button"
                          onClick={() => onReport(item)}
                          data-tour={anchor ? "home-my-stuff-item" : undefined}
                          className={cn(ROW, "grid min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-2")}
                        >
                          <span className="grid size-9 place-items-center rounded-9 bg-track text-tx2">
                            <Icon name={iconForCategory(item.categoryName ?? "")} size={17.5} weight={300} />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="fs-12.5 leading-[1.35] font-medium">{item.title}</span>
                            <span className="flex items-center gap-1.5 overflow-hidden fs-11 whitespace-nowrap text-mut">
                              {detail.category}
                              {detail.id && (
                                <span className={cn("truncate", detail.mono ? "font-mono fs-10.5" : "fs-10.5")}>
                                  {detail.id}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="flex items-center gap-0.75 fs-11.5 font-medium whitespace-nowrap text-brand-tx">
                            <Icon name="flag" size={14} />
                            Something wrong?
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <p data-tour="home-my-stuff-empty" className="m-0 px-3.5 pt-4.5 pb-3.5 fs-13 text-tx3">
                Nothing is assigned to you in our records.
              </p>
            )}
            <button
              type="button"
              onClick={onReportMissing}
              data-tour="home-report-unlogged"
              className={cn(
                ROW,
                "mt-1.5 flex min-h-12 items-center gap-2 border-t border-line2 px-3.5 py-2.5 fs-12 font-medium text-tx2 hover:text-tx"
              )}
            >
              <Icon name="add_circle" size={16.5} className="text-mut" />
              Got something we haven't recorded?
            </button>
          </>
        )}
      </Sheet>
    </Tray>
  );
}
