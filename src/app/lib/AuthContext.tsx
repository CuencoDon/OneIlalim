"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabaseClient";
import { User } from "@supabase/supabase-js";

type UserMeta = {
  first_name?: string;
  last_name?: string;
  role?: string;
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

  const triggerRefetch = () => {
    setRefetchCounter(prev => prev + 1);
  };

  const fetchUserRole = async (userId: string, fallbackRole?: string) => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (!error && profile?.role) return profile.role;
      return fallbackRole || null;
    } catch {
      return fallbackRole || null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session) {
          setUser(session.user);
          setUserMeta(session.user.user_metadata || null);
          const role = await fetchUserRole(session.user.id, session.user.user_metadata?.role);
          setUserRole(role);
        } else {
          setUser(null);
          setUserMeta(null);
          setUserRole(null);
        }
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        setIsLoading(true);

        if (session) {
          setUser(session.user);
          setUserMeta(session.user.user_metadata || null);
          const role = await fetchUserRole(session.user.id, session.user.user_metadata?.role);
          setUserRole(role);
        } else {
          setUser(null);
          setUserMeta(null);
          setUserRole(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    if (user && refetchCounter > 0) {
      const updateRole = async () => {
        const role = await fetchUserRole(user.id, userMeta?.role);
        setUserRole(role);
      };
      updateRole();
    }
  }, [refetchCounter, user, userMeta?.role]);

  return (
    <AuthContext.Provider value={{ user, userMeta, isLoading, userRole, tabVisible, triggerRefetch }}>
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