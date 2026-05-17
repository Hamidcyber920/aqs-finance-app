import { useAuth } from "@/_core/hooks/useAuth";
import { getRoleCategory, isRouteAllowed } from "@/lib/routePermissions";
import { useLocation } from "wouter";
import { lazy, Suspense } from "react";

const AccessDeniedPage = lazy(() => import("@/pages/AccessDenied"));

/**
 * RouteGuard checks the current user's role against the route permission map.
 * If denied, renders the AccessDenied page instead of the child content.
 * If the user is still loading, renders nothing (DashboardLayout shows skeleton).
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  // Still loading auth — don't flash denied page
  if (loading) return null;

  // Not authenticated — DashboardLayout handles redirect to login
  if (!user) return null;

  const roleCategory = getRoleCategory(user.role as string | undefined);

  if (!isRouteAllowed(location, roleCategory)) {
    return (
      <Suspense fallback={null}>
        <AccessDeniedPage />
      </Suspense>
    );
  }

  return <>{children}</>;
}
