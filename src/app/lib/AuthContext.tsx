"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "./supabaseClient";
import { User } from "@supabase/supabase-js";

type UserMeta = {
  first_name?: string;
  last_name?: string;
  role?: string;
  email?: string;
  contact_number?: string;
};

type AuthContextType = {
  user: User | null;
  userMeta: UserMeta | null;
  isLoading: boolean;
  userRole: string | null;
  tabVisible: boolean;
  triggerRefetch: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [tabVisible, setTabVisible] = useState(true);
  const [refetchCounter, setRefetchCounter] = useState(0);

  const triggerRefetch = () => setRefetchCounter((prev) => prev + 1);

  const fetchUserRole = useCallback(
    async (userId: string, fallbackRole?: string | null) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (!error && data?.role) {
          return data.role;
        }

        return fallbackRole ?? null;
      } catch {
        return fallbackRole ?? null;
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    const applySession = (session: any) => {
      if (!isMounted) return;

      const sessionUser = session?.user ?? null;

      setUser(sessionUser);
      setUserMeta((sessionUser?.user_metadata as UserMeta) ?? null);

      if (!sessionUser) {
        setUserRole(null);
      }
    };

    const initAuth = async () => {
      setIsLoading(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        applySession(session);
      } catch (error) {
        console.error("Auth init error:", error);
        setUser(null);
        setUserMeta(null);
        setUserRole(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Important: do NOT await Supabase queries here.
      applySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const updateRole = async () => {
      if (!user) {
        setUserRole(null);
        return;
      }

      const fallbackRole = (user.user_metadata?.role as string | undefined) ?? null;

      // Set fallback immediately so nav does not freeze while waiting.
      setUserRole(fallbackRole);

      const role = await fetchUserRole(user.id, fallbackRole);

      if (isMounted) {
        setUserRole(role);
      }
    };

    updateRole();

    return () => {
      isMounted = false;
    };
  }, [user?.id, refetchCounter, fetchUserRole]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      setTabVisible(isVisible);

      if (isVisible) {
        triggerRefetch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userMeta,
        isLoading,
        userRole,
        tabVisible,
        triggerRefetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}