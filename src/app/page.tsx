"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/app/lib/AuthContext";
import { supabase } from "@/app/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  ChevronDown,
  ChevronUp,
  Flame,
  Car,
  Waves,
  AlertTriangle,
  User,
  Phone,
  Clock,
  Map,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("@/app/components/Map"), { ssr: false });

type Disaster = {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  type: "fire" | "accident" | "flood" | "hazard";
  description: string | null;
  full_name: string;
  contact_number: string | null;
  status: "active" | "resolved" | "archived";
  reported_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  archived_by?: string | null;
};

type EvacuationSite = {
  id: string;
  official_id: string;
  official_name: string;
  lat: number;
  lng: number;
  title: string;
  description: string | null;
  created_at: string;
  status: "available" | "full";
};

const DISASTER_TYPE_CONFIG: Record<
  string,
  { label: string; badge: string; icon: React.ElementType; priority: number }
> = {
  fire: { label: "Fire", badge: "bg-red-600", icon: Flame, priority: 1 },
  accident: { label: "Accident", badge: "bg-orange-500", icon: Car, priority: 2 },
  flood: { label: "Flood", badge: "bg-blue-600", icon: Waves, priority: 3 },
  hazard: { label: "Hazard", badge: "bg-yellow-500", icon: AlertTriangle, priority: 4 },
};

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString();
};

export default function UnifiedMapPage() {
  const { user, userRole, isLoading: authLoading, tabVisible } = useAuth();

  const [disasters, setDisasters] = useState<Disaster[]>([]);
  const [evacuationSites, setEvacuationSites] = useState<EvacuationSite[]>([]);
  const [reporterRoleMap, setReporterRoleMap] = useState<Record<string, string>>({});
  const [resolvedByNameMap, setResolvedByNameMap] = useState<Record<string, string>>({});
  const [officialPhoneMap, setOfficialPhoneMap] = useState<Record<string, string>>({});
  const [focusDisaster, setFocusDisaster] = useState<{ id: string; key: number } | null>(null);
  const [focusEvacuationSite, setFocusEvacuationSite] = useState<{ id: string; key: number } | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [hazardMapVisible, setHazardMapVisible] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) {
      setDisasters([]);
      setEvacuationSites([]);
      setReporterRoleMap({});
      setResolvedByNameMap({});
      setOfficialPhoneMap({});
      return;
    }

    try {
      const [disastersRes, sitesRes, profilesRes] = await Promise.all([
        supabase.from("disasters").select("*").order("reported_at", { ascending: false }),
        supabase.from("evacuation_sites").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, role, first_name, last_name, contact_number"),
      ]);

      const { data: disastersData } = disastersRes;
      const { data: sitesData } = sitesRes;
      const { data: profilesData } = profilesRes;

      if (disastersData) setDisasters(disastersData);
      if (sitesData) setEvacuationSites(sitesData);

      if (profilesData) {
        const roleMap: Record<string, string> = {};
        const phoneMap: Record<string, string> = {};
        const nameMap: Record<string, string> = {};
        profilesData.forEach((p) => {
          if (p.role) roleMap[p.id] = p.role;
          if (p.contact_number) phoneMap[p.id] = p.contact_number;
          nameMap[p.id] = `${p.first_name} ${p.last_name}`.trim();
        });
        setReporterRoleMap(roleMap);
        setOfficialPhoneMap(phoneMap);

        if (disastersData) {
          const resolvedMap: Record<string, string> = {};
          disastersData.forEach((d) => {
            if (d.resolved_by) resolvedMap[d.resolved_by] = nameMap[d.resolved_by] || "Unknown";
          });
          setResolvedByNameMap(resolvedMap);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  useEffect(() => {
    if (tabVisible) fetchData();
  }, [tabVisible, fetchData]);

  useEffect(() => {
    const disastersChannel = supabase
      .channel("disasters")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "disasters" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newDisaster = payload.new as Disaster;
            const { data: profile } = await supabase
              .from("profiles")
              .select("role, first_name, last_name")
              .eq("id", newDisaster.user_id)
              .single();
            if (profile) {
              setReporterRoleMap((prev) => ({
                ...prev,
                [newDisaster.user_id]: profile.role,
              }));
              setResolvedByNameMap((prev) => ({
                ...prev,
                [newDisaster.user_id]: `${profile.first_name} ${profile.last_name}`.trim(),
              }));
            }
            setDisasters((prev) => [newDisaster, ...prev]);
            setFocusDisaster({ id: newDisaster.id, key: Date.now() });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Disaster;
            setDisasters((prev) =>
              prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
            );
            setFocusDisaster({ id: updated.id, key: Date.now() });
          } else if (payload.eventType === "DELETE") {
            setDisasters((prev) => prev.filter((d) => d.id !== payload.old.id));
            setFocusDisaster((current) =>
              current?.id === payload.old.id ? null : current
            );
          }
        }
      )
      .subscribe();

    const evacChannel = supabase
      .channel("evacuation_sites")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evacuation_sites" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const newSite = payload.new as EvacuationSite;
            const { data: profile } = await supabase
              .from("profiles")
              .select("contact_number")
              .eq("id", newSite.official_id)
              .single();
            if (profile?.contact_number)
              setOfficialPhoneMap((prev) => ({
                ...prev,
                [newSite.official_id]: profile.contact_number,
              }));
            setEvacuationSites((prev) => [newSite, ...prev]);
            setFocusEvacuationSite({ id: newSite.id, key: Date.now() });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as EvacuationSite;
            setEvacuationSites((prev) =>
              prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
            );
            setFocusEvacuationSite({ id: updated.id, key: Date.now() });
          } else if (payload.eventType === "DELETE") {
            setEvacuationSites((prev) =>
              prev.filter((s) => s.id !== payload.old.id)
            );
            setFocusEvacuationSite((current) =>
              current?.id === payload.old.id ? null : current
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(disastersChannel).catch(() => {});
      supabase.removeChannel(evacChannel).catch(() => {});
    };
  }, []);

  const handleFocusDisaster = useCallback((id: string) => {
    setFocusDisaster(id ? { id, key: Date.now() } : null);
  }, []);

  const handleFocusEvacuationSite = useCallback((id: string) => {
    setFocusEvacuationSite(id ? { id, key: Date.now() } : null);
  }, []);

  const updateEvacuationDescription = useCallback(
    async (id: string, newDescription: string) => {
      const { error } = await supabase
        .from("evacuation_sites")
        .update({ description: newDescription || null })
        .eq("id", id);
      if (!error) {
        setEvacuationSites((prev) =>
          prev.map((site) =>
            site.id === id ? { ...site, description: newDescription || null } : site
          )
        );
      }
    },
    []
  );

  const activeDisasters = useMemo(() => {
    return disasters
      .filter((d) => d.status === "active")
      .sort((a, b) => {
        const pa = DISASTER_TYPE_CONFIG[a.type]?.priority || 99;
        const pb = DISASTER_TYPE_CONFIG[b.type]?.priority || 99;
        return pa - pb;
      });
  }, [disasters]);

  const mapDisasters = useMemo(
    () => disasters.filter((d) => d.status !== "archived"),
    [disasters]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="relative h-full w-full"
    >
      <MapComponent
        key={user?.id || "no-user"}
        disasters={mapDisasters}
        evacuationSites={evacuationSites}
        currentUser={user}
        currentUserRole={userRole}
        focusDisaster={focusDisaster}
        focusEvacuationSite={focusEvacuationSite}
        onFocusDisaster={handleFocusDisaster}
        onFocusEvacuationSite={handleFocusEvacuationSite}
        reporterRoleMap={reporterRoleMap}
        resolvedByNameMap={resolvedByNameMap}
        officialPhoneMap={officialPhoneMap}
        onUpdateEvacuationDescription={updateEvacuationDescription}
        readOnly={false}
      />

      {user && (
        <button
          onClick={() => setHazardMapVisible(true)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1500] bg-white/95 backdrop-blur-sm p-2 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          title="View Hazard Map"
        >
          <Map className="w-4 h-4 text-[#1e3a8a]" />
        </button>
      )}

      <AnimatePresence>
        {hazardMapVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-white/10 backdrop-blur-sm p-4 pt-[88px]"
            onClick={() => setHazardMapVisible(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setHazardMapVisible(false)}
                className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full shadow hover:bg-white transition-colors z-10"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
              <img
                src="/Hazard Map.jpg"
                alt="Hazard Map"
                className="max-w-[80vw] max-h-[75vh] object-contain rounded-2xl shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {user && (
        <div className="absolute top-4 right-4 z-[1500] w-72 max-h-[calc(100vh-6rem)] overflow-hidden overflow-y-auto rounded-3xl">
          <button
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            className="w-full flex items-center justify-between bg-[#1e3a8a] text-white px-3 py-2 font-medium text-sm"
          >
            <span>Active Disasters ({activeDisasters.length})</span>
            {panelCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>

          <AnimatePresence>
            {!panelCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-white border border-gray-200 shadow-lg overflow-hidden"
              >
                {activeDisasters.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No active disasters
                  </div>
                ) : (
                  activeDisasters.map((disaster) => {
                    const typeConfig = DISASTER_TYPE_CONFIG[disaster.type];
                    const TypeIcon = typeConfig.icon;
                    const reporterRole = reporterRoleMap[disaster.user_id];
                    const reportedTime = formatTime(disaster.reported_at);

                    return (
                      <div key={disaster.id} className="p-3 border-b border-gray-100">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-row flex-nowrap gap-1.5">
                            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-600 text-white">
                              <Clock className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                            <span
                              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${typeConfig.badge}`}
                            >
                              <TypeIcon className="w-3 h-3" />
                              <span>{typeConfig.label}</span>
                            </span>
                            {reporterRole && (
                              <span
                                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  reporterRole === "official"
                                    ? "bg-blue-700 text-white"
                                    : "bg-gray-500 text-white"
                                }`}
                              >
                                <User className="w-3 h-3" />
                                <span>
                                  {reporterRole === "official"
                                    ? "Brgy. Official"
                                    : "Resident"}
                                </span>
                              </span>
                            )}
                          </div>

                          {reportedTime && (
                            <div className="text-[10px] text-gray-600">
                              Reported: {reportedTime}
                            </div>
                          )}

                          <div className="flex items-center gap-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-black" />
                              <span className="text-xs font-medium text-black">
                                {disaster.full_name}
                              </span>
                            </div>
                            {disaster.contact_number && (
                              <>
                                <span className="text-xs text-black">•</span>
                                <div className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-black" />
                                  <span className="text-xs text-black">
                                    {disaster.contact_number}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {!user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[2000] flex items-center justify-center bg-white/20 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              className="inline-flex w-auto max-w-[92vw] flex-col rounded-xl bg-white px-5 py-6 shadow-xl"
            >
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <Lock size={24} className="text-blue-700" />
                </div>
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-blue-900">
                Locked
              </h3>
              <p className="text-center text-sm text-gray-700">
                Sign up or log in to view and report disasters and evacuation sites.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden md:flex absolute bottom-6 left-6 z-[9999] flex-col items-center bg-white/95 p-4 rounded-xl shadow-2xl border border-gray-200 pointer-events-auto transition-transform hover:scale-105">
        <img
          src="/one-ilalim.png"
          alt="Mobile App QR Code"
          className="w-24 h-24 mb-2 object-contain"
        />
        <p className="text-sm font-bold text-blue-900 text-center">
          Use on Mobile
        </p>
        <p className="text-xs text-gray-600 text-center">Scan to access</p>
      </div>
    </motion.div>
  );
}