import type { Request } from "@/types/requestType";
import { getInitials } from "@/lib/utils";
import { useState } from "react";
import { formatReason } from "@/components/request-table/FormatReason"

type Props = {
  request: Request;
  averages: Record<string, Record<number, number>>;
  onApprove: (request: Request) => void;
  onReject: (request: Request) => void;
  selectedTier: string;
};

export default function RequestRow({
  request,
  averages,
  onApprove,
  onReject,
  selectedTier
}: Props) {
  const userInitials = getInitials(request.userName)
  const managerInitials = getInitials(request.manager)
  const isPending = request.status === "PENDING";
  const [reasonExpanded, setReasonExpanded] = useState(false);

  console.log({
    categoryId: request.categoryId,
    type: typeof request.categoryId,
  });

  const avgPrice =  averages[selectedTier][Number(request.categoryId)];
  console.log(avgPrice);
  const price = request.modelRequest?.price;

  const isComparable =
  price != null && avgPrice != null;

  const isAbove = isComparable && price > avgPrice;
  const isBelow = isComparable && price < avgPrice;

  const statusLabelMap: Record<string, string> = {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    COMPLETED: "Completed",
  };

  return (
    <tr className="hover:bg-surface-container-low/20 transition-colors border-b border-outline group">

      {/* REQUESTER */}
      <td className="px-6 py-5 align-center">
        <div className="flex items-center">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary-container flex items-center justify-center mr-3">
            <span className="text-requester-text bg-requester-bg/90 rounded-full py-1 px-1.5 font-bold text-sm">
              {userInitials}
            </span>
          </div>

          <div>
            <div className="text-sm font-semibold text-on-surface-variant">
              {request.userName}
            </div>
          </div>
        </div>
      </td>

      {/* ASSET DETAILS */}
      <td className="px-6 py-5 align-center">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-info-light">
            {request.modelRequest?.manufacturer}
          </span>
          <span className="text-xs text-primary font-semibold font-label">
            {request.modelRequest?.modelName}
          </span>
        </div>
      </td>

      {/* REASON */}
      <td
        className="px-6 py-5 align-center cursor-pointer"
        onClick={() => setReasonExpanded((prev) => !prev)}
      >
        <p
          className={`bg-surface-container-low/50 rounded-lg text-center py-1 px-2 m-1 text-sm font-sans text-info-light max-w-[200px] leading-relaxed transition-all ${
            reasonExpanded ? "" : "line-clamp-2"
          }`}
        >
          {formatReason(request.reason)}
        </p>
      </td>

      {/* PRICE */}
      <td className="px-6 py-5 align-center text-center">
        <span
          className={`text-sm font-mono font-bold ${
            isAbove
              ? "text-error"
              : isBelow
              ? "text-green-500"
              : "text-info-light"
          }`}
        >
          {price ? `$${price.toLocaleString()}` : "—"}
        </span>
      </td>

      {/* APPROVER */}
      <td className="px-6 align-center py-5">
        <div className="flex text-left items-center">
          <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center mr-2">
            <p className="text-approver-text bg-approver-bg/30 rounded-full py-1 px-1.5 font-bold text-sm">
              {managerInitials}
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold text-on-surface-variant">
              {request.manager}
            </div>
          </div>
        </div>
      </td>

      {/* ACTIONS / STATUS */}
      <td className="px-6 py-5 align-center text-center">
        {isPending ? (
          <div className="flex ml-2 gap-2">
            <button
              onClick={() => onApprove(request)}
              className="group/icon p-2 text-green-500 hover:bg-primary-container/30 hover:cursor-pointer rounded-md transition-colors"
              title="Approve"
            >
              <span className="material-symbols-outlined hover:cursor-pointer icon-fill-hover transition-all">
                check_circle
              </span>
            </button>

            <button
              onClick={() => onReject(request)}
              className="group/icon p-2 text-error hover:bg-error-container/10 hover:cursor-pointer rounded-md transition-colors"
              title="Reject"
            >
              <span className="material-symbols-outlined hover:cursor-pointer icon-fill-hover transition-all">
                cancel
              </span>
            </button>
          </div>
        ) : (
        <span
          className={`
            inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full
            ${
              request.status === "APPROVED"
                ? "bg-blue-500/10 text-blue-400"
                : request.status === "COMPLETED"
                ? "bg-green-500/10 text-green-600 border-1 border-green-600"
                : request.status === "REJECTED"
                ? "bg-red-500/10 text-red-600"
                : "bg-yellow-500/10 text-yellow-600"
            }
          `}
        >
          <span className="material-symbols-outlined !text-sm">
            {request.status === "APPROVED"
              ? "schedule"
              : request.status === "COMPLETED"
              ? "task_alt"
              : request.status === "REJECTED"
              ? "cancel"
              : "schedule"}
          </span>
          {statusLabelMap[request.status] || request.status}
        </span>
        )}
      </td>

    </tr>
  );
}