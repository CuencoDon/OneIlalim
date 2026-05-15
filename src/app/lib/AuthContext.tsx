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
  roleDescription: string | null;
  tabVisible: boolean;
  triggerRefetch: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleDescription, setRoleDescription] = useState<string | null>(null);
  const [tabVisible, setTabVisible] = useState(true);
  const [refetchCounter, setRefetchCounter] = useState(0);

  const triggerRefetch = () => setRefetchCounter((prev) => prev + 1);

  const fetchUserProfile = useCallback(
    async (userId: string, fallbackRole?: string | null) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role, role_description")
          .eq("id", userId)
          .maybeSingle();

        if (!error && data) {
          return {
            role: data.role ?? fallbackRole ?? null,
            roleDescription: data.role_description ?? null,
          };
        }

        return {
          role: fallbackRole ?? null,
          roleDescription: null,
        };
      } catch {
        return {
          role: fallbackRole ?? null,
          roleDescription: null,
        };
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
        setRoleDescription(null);
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
        setRoleDescription(null);
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
      applySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const updateProfile = async () => {
      if (!user) {
        setUserRole(null);
        setRoleDescription(null);
        return;
      }

      const fallbackRole = (user.user_metadata?.role as string | undefined) ?? null;

      setUserRole(fallbackRole);
      setRoleDescription(null);

      const { role, roleDescription: desc } = await fetchUserProfile(user.id, fallbackRole);

      if (isMounted) {
        setUserRole(role);
        setRoleDescription(desc);
      }
    };

    updateProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id, refetchCounter, fetchUserProfile]);

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
        roleDescription,
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