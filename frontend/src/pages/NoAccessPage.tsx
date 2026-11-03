import { useLocation } from "react-router-dom";
import { StatusPage } from "@/components/shell/StatusPage";

export default function NoAccessPage() {
  // Set by the route that sent them here, when it knows something more
  // useful to say than the general rule.
  const reason = (useLocation().state as { reason?: string } | null)?.reason;

  if (reason === "stock") {
    return (
      <StatusPage
        icon="inventory_2"
        title="Stock is for stock keepers"
        watermark={{
          light: import.meta.env.VITE_NO_ACCESS_WATERMARK_LIGHT,
          dark: import.meta.env.VITE_NO_ACCESS_WATERMARK_DARK,
        }}
      >
        It shows what&rsquo;s waiting to be handed over at a site, so it opens for the people who keep one. If you
        should be one, ask IT to assign you to your location under Settings &rarr; Sites.
      </StatusPage>
    );
  }

  return (
    <StatusPage
      icon="lock"
      title="You don't have access to this yet"
      watermark={{
        light: import.meta.env.VITE_NO_ACCESS_WATERMARK_LIGHT,
        dark: import.meta.env.VITE_NO_ACCESS_WATERMARK_DARK,
      }}
    >
      Access comes with taking part: having a request of your own, or approving someone else's. If you think
      you should have it already, contact IT and they can add you as an admin or as a manager.
    </StatusPage>
  );
}
