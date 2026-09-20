"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [connectionError, setConnectionError] = useState(false);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      if (navigator.onLine && document.visibilityState === "visible")
        timer = setTimeout(() => router.refresh(), 200);
    };
    const watchedTables = [
      "company_settings",
      "profiles",
      "role_permissions",
      "suppliers",
      "items",
      "purchases",
      "goods_receipts",
      "stock_movements",
      "stock_adjustments",
      "production_batches",
      "buyers",
      "export_orders",
      "shipments",
      "export_invoices",
      "supplier_bills",
    ];
    let channel = supabase.channel(`workspace-${userId}`);
    for (const table of watchedTables)
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      );
    channel = channel.subscribe((status) => {
      setConnectionError(status === "CHANNEL_ERROR" || status === "TIMED_OUT");
      if (status === "SUBSCRIBED") refresh();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
        router.refresh();
      }
      if (event === "TOKEN_REFRESHED") refresh();
    });
    const poll = setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      subscription.unsubscribe();
      void supabase.removeChannel(channel);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, userId]);
  if (online && !connectionError) return null;
  return (
    <div className="connection-warning" role="status">
      <WifiOff size={17} />
      {online
        ? "Live connection interrupted. Checking for updates every 30 seconds."
        : "You’re offline. Reconnect before making changes."}
    </div>
  );
}
