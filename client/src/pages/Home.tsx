import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * Root route — redirect authenticated users to /capture, unauthenticated to /login.
 */
export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      setLocation("/capture");
    } else {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
