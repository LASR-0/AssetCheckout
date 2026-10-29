import { StatusPage } from "@/components/shell/StatusPage";

export default function NoAccessPage() {
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
