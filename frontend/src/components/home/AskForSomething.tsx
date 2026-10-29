import { Link } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";
import { buttonVariants } from "@/components/ui/variants";
import { iconForCategory } from "@/lib/categoryIcon";
import { loanConfigQuery } from "@/api/queries";
import type { AssetCategory } from "@/types/categoriesType";
import type { AccessoryCategory } from "@/types/accessoriesType";
import type { HeldItem } from "./held";
import { ACTION, ROW, SKELETON } from "./styles";

type Props = {
  assetCategories: UseQueryResult<AssetCategory[]>;
  accessoryCategories: UseQueryResult<AccessoryCategory[]>;
  assets: HeldItem[];
  accessories: HeldItem[];
  onSeeAll: (subject: "ASSET" | "ACCESSORY") => void;
};

const CARD_ROW = cn(ROW, "grid grid-cols-[1.5rem_minmax(0,1fr)_auto_1.125rem] items-center gap-x-3 border-t border-line2 py-2 pr-3 pl-3.5");

/** "You have 2", with the models on hover. Invisible when they have none. */
function YouHave({ items }: { items: HeldItem[] }) {
  if (items.length === 0) return <span />;
  return (
    <span title={items.map((i) => i.title).join(", ")} className="rounded-6 bg-track px-1.75 py-0.75 fs-11 font-medium whitespace-nowrap text-tx2">
      You have {items.length}
    </span>
  );
}

/** What an accessory is for, from the devices that unlock it: "For your laptop". */
function fitsText(c: AccessoryCategory, assets: HeldItem[]): string | null {
  const unlockers = assets.filter((a) => a.categoryId != null && c.unlockedBy?.includes(a.categoryId));
  if (unlockers.length === 0) return null;
  if (unlockers.length === 1) return `For your ${unlockers[0].title}`;
  const cats = [...new Set(unlockers.map((a) => (a.categoryName ?? "devices").toLowerCase()))];
  return `For your ${cats.length === 1 ? cats[0] : `${cats.slice(0, -1).join(", ")} and ${cats.at(-1)}`}`;
}

function CardHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
      <span className="fs-13 font-semibold">{title}</span>
      {action}
    </div>
  );
}

function SeeAll({ onClick, tour, children }: { onClick: () => void; tour: string; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={tour}
      className="cursor-pointer rounded-4 border-0 bg-transparent p-0 font-sans fs-11.5 font-medium whitespace-nowrap text-brand-tx outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </button>
  );
}

export default function AskForSomething({ assetCategories, accessoryCategories, assets, accessories, onSeeAll }: Props) {
  const { data: loanConfig } = useQuery(loanConfigQuery);

  return (
    <Tray label="Ask for something" data-tour="home-request-assets">
      {/* Wrapping cards rather than an auto-fit grid: the full-width quick
          links row spans every track, which stops auto-fit collapsing the
          empty ones and left a hole beside the two catalogue cards. */}
      <div className="flex flex-wrap gap-0.75 *:min-w-0 *:flex-[1_1_17.5rem]">
        {assetCategories.isPending ? (
          [0, 1].map((k) => (
            <Sheet key={k} className="flex flex-col gap-3.5 px-3.5 py-4">
              <span className={cn(SKELETON, "h-2.75 w-[30%]")} />
              <span className={cn(SKELETON, "h-2.5 w-[70%]")} />
              <span className={cn(SKELETON, "h-2.5 w-[55%]")} />
              <span className={cn(SKELETON, "h-2.5 w-[62%]")} />
            </Sheet>
          ))
        ) : assetCategories.isError ? (
          <Sheet className="flex basis-full! flex-wrap items-center gap-x-4 gap-y-3 p-4">
            <Icon name="cloud_off" size={19} className="text-mut" />
            <span className="flex-[1_1_16rem] fs-12.5 leading-normal text-pretty text-tx2">
              Couldn't load the asset catalogue right now — you can still start a request from the form.
            </span>
            <span className="flex flex-wrap gap-2">
              <Link to="/assets" className={cn(buttonVariants({ variant: "secondary" }), ACTION)}>
                Request assets
              </Link>
              <Link to="/accessories" className={cn(buttonVariants({ variant: "secondary" }), ACTION)}>
                Request accessories
              </Link>
            </span>
          </Sheet>
        ) : (
          <>
            <Sheet className="overflow-hidden">
              <CardHead
                title="Devices"
                action={
                  assets.length > 0 && (
                    <SeeAll onClick={() => onSeeAll("ASSET")} tour="home-see-all-devices">
                      See all my devices
                    </SeeAll>
                  )
                }
              />
              {assetCategories.data.map((c) => (
                <Link key={c.id} to={`/assets?categoryId=${c.id}`} className={cn(CARD_ROW, "min-h-11.5")}>
                  <Icon name={iconForCategory(c.name)} size={17.5} weight={300} className="text-tx3" />
                  <span className="fs-13">{c.name}</span>
                  <YouHave items={assets.filter((a) => a.categoryId === c.id)} />
                  <Icon name="chevron_right" size={16.5} className="text-mut" />
                </Link>
              ))}
            </Sheet>

            <Sheet className="overflow-hidden" data-tour="home-request-accessories">
              <CardHead
                title="Accessories for your devices"
                action={
                  accessories.length > 0 && (
                    <SeeAll onClick={() => onSeeAll("ACCESSORY")} tour="home-see-all-accessories">
                      See all my accessories
                    </SeeAll>
                  )
                }
              />
              {(accessoryCategories.data ?? []).length > 0 ? (
                accessoryCategories.data!.map((c) => {
                  const fits = fitsText(c, assets);
                  return (
                    <Link
                      key={c.id}
                      to={`/accessories?categoryId=${c.id}`}
                      className={cn(CARD_ROW, "min-h-13")}
                    >
                      <Icon name={iconForCategory(c.name)} size={17.5} weight={300} className="text-tx3" />
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="fs-13">{c.name}</span>
                        {fits && <span className="truncate fs-11 text-mut">{fits}</span>}
                      </span>
                      <YouHave items={accessories.filter((a) => a.categoryId === c.id)} />
                      <Icon name="chevron_right" size={16.5} className="text-mut" />
                    </Link>
                  );
                })
              ) : accessoryCategories.isPending ? null : (
                <p className="m-0 px-3.5 pt-1.5 pb-4 fs-12 leading-normal text-pretty text-tx3">
                  Accessories appear here once you hold a device they fit, like a laptop or a phone.
                </p>
              )}
            </Sheet>
          </>
        )}

        <Sheet
          data-tour="home-quick-links"
          className="grid basis-full! grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] overflow-hidden"
        >
          {[
            {
              to: "/loan",
              icon: "event_available",
              title: "Book a loan",
              text: `Borrow a device for up to ${loanConfig?.maxLoanDays ?? 30} days`,
            },
            { to: "/troubleshooting", icon: "build", title: "Troubleshooting", text: "Fix a common problem yourself" },
          ].map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                ROW,
                "flex min-h-15 items-center gap-3 py-2.5 pr-3 pl-3.5",
                i > 0 && "max-phone:border-t max-phone:border-line2 phone:border-l phone:border-line2"
              )}
            >
              <span className="grid size-9 flex-none place-items-center rounded-9 bg-track text-tx2">
                <Icon name={l.icon} size={17.5} weight={300} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="fs-13 font-medium">{l.title}</span>
                <span className="fs-11.5 text-mut">{l.text}</span>
              </span>
              <Icon name="chevron_right" size={16.5} className="text-mut" />
            </Link>
          ))}
        </Sheet>
      </div>
    </Tray>
  );
}
