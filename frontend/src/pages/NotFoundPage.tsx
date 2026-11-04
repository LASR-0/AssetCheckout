import { StatusPage } from "@/components/shell/StatusPage";

export default function NotFoundPage() {
  return (
    <StatusPage
      icon="explore_off"
      title="This page doesn't exist"
      watermark={{
        light: import.meta.env.VITE_CATCH_ALL_WATERMARK_LIGHT,
        dark: import.meta.env.VITE_CATCH_ALL_WATERMARK_DARK,
      }}
    >
      The link may be out of date, or the page may have moved. Everything you can do in Checkout starts from
      the home page.
    </StatusPage>
  );
}
