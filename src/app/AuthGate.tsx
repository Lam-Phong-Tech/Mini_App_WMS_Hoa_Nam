import AuthStatePage from "@/pages/AuthStatePage";
import { useZaloAuth } from "@/hooks/use-zalo-auth";
import type { ReactNode } from "react";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { staff, isLoading, securityMode } = useZaloAuth();

  if (isLoading) {
    return <AuthStatePage mode="loading" />;
  }

  if (securityMode === "session") {
    return <AuthStatePage mode="session" />;
  }

  if (securityMode === "permission") {
    return <AuthStatePage mode="permission" />;
  }

  if (!staff) {
    return <AuthStatePage mode="login" />;
  }

  return <>{children}</>;
}
