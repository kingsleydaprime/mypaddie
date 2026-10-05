import { TabBar } from "@/shared/ui/tab-bar";

/** Signed-in app: content column plus the bottom tab bar. Desktop just centres it. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto max-w-md px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28">{children}</main>
      <TabBar />
    </>
  );
}
