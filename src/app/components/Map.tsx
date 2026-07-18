"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";
import { disasterIcons, evacuationSiteAvailable, evacuationSiteFull } from "@/app/lib/leafletIcons";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  CheckCircle2,
  Clock,
  Phone,
  AlertTriangle,
  Flame,
  Car,
  Waves,
  Building2,
  XCircle,
  Pencil,
  VolumeX,
  Archive,
  RefreshCw,
  Navigation,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  RotateCcw,
  RotateCw,
  MapPin,
  CircleDot,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ActionPanel from "@/app/components/ActionPanel";

type DisasterType = "fire" | "accident" | "flood" | "hazard";

type DirectionStep = {
  text: string;
  type: string;
  modifier?: string;
};

type Disaster = {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  type: DisasterType;
  description: string | null;
  full_name: string;
  contact_number: string | null;
  status: "active" | "responding" | "resolved" | "archived";
  reported_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  archived_by?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
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

const BOUNDARY = {
  lat: { min: 14.8332, max: 14.8358 },
  lng: { min: 120.2775, max: 120.2801 },
};

const DEFAULT_CENTER: [number, number] = [14.8345, 120.2788];
const DEFAULT_ZOOM = 18;

const DISASTER_TYPE_CONFIG: Record<
  DisasterType,
  {
    label: string;
    badge: string;
    icon: React.ElementType;
    soundFile: string;
    flashColor: string;
  }
> = {
  fire: {
    label: "Fire",
    badge: "bg-red-600",
    icon: Flame,
    soundFile: "/fire.mp3",
    flashColor: "rgba(255, 0, 0, 0.4)",
  },
  accident: {
    label: "Accident",
    badge: "bg-orange-500",
    icon: Car,
    soundFile: "/accident.mp3",
    flashColor: "rgba(255, 165, 0, 0.4)",
  },
  flood: {
    label: "Flood",
    badge: "bg-blue-600",
    icon: Waves,
    soundFile: "/flood.mp3",
    flashColor: "rgba(0, 0, 255, 0.4)",
  },
  hazard: {
    label: "Hazard",
    badge: "bg-yellow-500",
    icon: AlertTriangle,
    soundFile: "/hazard.mp3",
    flashColor: "rgba(255, 255, 0, 0.4)",
  },
};

const customHazardIcon = L.divIcon({
  html: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 20h20L12 2z" fill="#eab308" stroke="#854d0e" stroke-width="1.5"/>
      <text x="12" y="17" text-anchor="middle" fill="#854d0e" font-size="10" font-weight="bold">!</text>
    </svg>
  </div>`,
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const isWithinBoundary = (lat: number, lng: number) =>
  lat >= BOUNDARY.lat.min &&
  lat <= BOUNDARY.lat.max &&
  lng >= BOUNDARY.lng.min &&
  lng <= BOUNDARY.lng.max;

const userLocationIcon = L.divIcon({
  html: `<div style="background-color: #1e3a8a; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;">
    <div style="width: 8px; height: 8px; background-color: white; border-radius: 50%;"></div>
  </div>`,
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

function BoundaryLayer() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const bounds = L.latLngBounds(
      [BOUNDARY.lat.min, BOUNDARY.lng.min],
      [BOUNDARY.lat.max, BOUNDARY.lng.max]
    );
    const rectangle = L.rectangle(bounds, {
      color: "#1e3a8a",
      weight: 2,
      opacity: 0.8,
      fillColor: "#1e3a8a",
      fillOpacity: 0.1,
    }).addTo(map);
    map.fitBounds(bounds, { padding: [20, 20] });
    return () => {
      map.removeLayer(rectangle);
    };
  }, [map]);
  return null;
}

function ClickToPickLocation({
  onPick,
  onBoundaryError,
}: {
  onPick: (lat: number, lng: number) => void;
  onBoundaryError: () => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (isWithinBoundary(lat, lng)) {
        onPick(lat, lng);
      } else {
        onBoundaryError();
      }
    },
  });
  return null;
}

function CustomRoutingControl({
  userLocation,
  destination,
  disasters = [],
  isNavigating = false,
}: {
  userLocation: [number, number] | null;
  destination: [number, number] | null;
  disasters?: Disaster[];
  isNavigating?: boolean;
}) {
  const map = useMap();
  const polylineRef = useRef<L.Polyline | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFlownRef = useRef(false);

  const distanceToSegment = (
    p: [number, number],
    a: [number, number],
    b: [number, number]
  ) => {
    const [x, y] = p;
    const [x1, y1] = a;
    const [x2, y2] = b;
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const len2 = C * C + D * D;
    if (len2 === 0) return Math.hypot(A, B);
    let t = dot / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    const projX = x1 + t * C;
    const projY = y1 + t * D;
    return Math.hypot(x - projX, y - projY);
  };

  const offsetPoint = (
    lat: number,
    lng: number,
    direction: [number, number],
    distance: number
  ) => {
    const [dx, dy] = direction;
    const norm = Math.hypot(dx, dy);
    if (norm === 0) return [lat, lng];
    const ux = dy / norm;
    const uy = -dx / norm;
    return [lat + ux * distance, lng + uy * distance];
  };

  useEffect(() => {
    if (!map || !userLocation || !destination) return;
    let active = true;

    const fetchRoute = async (): Promise<void> => {
      if (!active) return;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      let coords = `${userLocation[1]},${userLocation[0]};${destination[1]},${destination[0]}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      try {
        const response = await fetch(url, {
          signal: abortControllerRef.current.signal,
        });
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) return;
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        const activeDisasters = disasters.filter((d) => {
          if (d.status !== "active") return false;
          if (Math.abs(d.lat - destination[0]) < 0.0001 && Math.abs(d.lng - destination[1]) < 0.0001) {
            return false;
          }
          return true;
        });
        const THRESHOLD = 0.0003;
        const OFFSET = 0.0006;
        let foundAny = false;
        const avoidedDisasters = new Set<string>();
        const newWaypoints: [number, number][] = [];
        for (let i = 0; i < coordinates.length - 1; i++) {
          const a = coordinates[i];
          const b = coordinates[i + 1];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          for (const disaster of activeDisasters) {
            if (avoidedDisasters.has(disaster.id)) continue;
            const dist = distanceToSegment(
              [disaster.lat, disaster.lng],
              a,
              b
            );
            if (dist < THRESHOLD) {
              foundAny = true;
              avoidedDisasters.add(disaster.id);
              const direction: [number, number] = [dx, dy];
              const [offLat, offLng] = offsetPoint(
                disaster.lat,
                disaster.lng,
                direction,
                OFFSET
              );
              newWaypoints.push([offLat, offLng]);
            }
          }
        }
        let finalCoordinates = coordinates;
        if (foundAny && newWaypoints.length > 0 && newWaypoints.length <= 10) {
          let detourCoords = `${userLocation[1]},${userLocation[0]}`;
          for (const wp of newWaypoints) {
            detourCoords += `;${wp[1]},${wp[0]}`;
          }
          detourCoords += `;${destination[1]},${destination[0]}`;
          const detourUrl = `https://router.project-osrm.org/route/v1/driving/${detourCoords}?overview=full&geometries=geojson`;
          const detourResponse = await fetch(detourUrl, {
            signal: abortControllerRef.current.signal,
          });
          const detourData = await detourResponse.json();
          if (detourData.routes && detourData.routes.length > 0) {
            finalCoordinates = detourData.routes[0].geometry.coordinates.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
            );
          }
        }
        if (polylineRef.current) polylineRef.current.remove();
        if (finalCoordinates.length > 0) {
          polylineRef.current = L.polyline(finalCoordinates, {
            color: "#10b981",
            weight: 5,
            opacity: 0.8,
          }).addTo(map);

          // Only fly to route bounds on first draw; afterwards panTo follows user
          if (!hasFlownRef.current) {
            hasFlownRef.current = true;
            const bounds = polylineRef.current.getBounds();
            if (bounds.isValid()) {
              map.flyToBounds(bounds, {
                padding: [50, 50],
                maxZoom: 18,
                duration: 1.5
              });
            }
          }
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          console.error("Routing error:", error);
        }
      }
    };

    fetchRoute();
    return () => {
      active = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (polylineRef.current) polylineRef.current.remove();
    };
  }, [map, userLocation, destination, disasters]);

  // Reset flown flag whenever destination changes so a fresh route always pans
  useEffect(() => {
    hasFlownRef.current = false;
  }, [destination]);

  // Follow the responder with panTo while navigation is active
  useEffect(() => {
    if (isNavigating && userLocation) {
      map.panTo(userLocation, { animate: true, duration: 0.8 });
    }
  }, [isNavigating, userLocation, map]);

  return null;
}

function getManeuverIcon(type: string, modifier?: string) {
  const mod = modifier?.toLowerCase() ?? "";
  if (type === "arrive") return <MapPin size={16} className="text-green-600 shrink-0" />;
  if (type === "depart") return <CircleDot size={16} className="text-blue-600 shrink-0" />;
  if (type === "roundabout" || type === "rotary") {
    return mod.includes("left")
      ? <RotateCcw size={16} className="text-indigo-600 shrink-0" />
      : <RotateCw size={16} className="text-indigo-600 shrink-0" />;
  }
  if (mod === "uturn") return <RotateCcw size={16} className="text-red-500 shrink-0" />;
  if (mod === "sharp left" || mod === "left") return <ArrowLeft size={16} className="text-orange-500 shrink-0" />;
  if (mod === "slight left") return <ArrowUpLeft size={16} className="text-orange-400 shrink-0" />;
  if (mod === "sharp right" || mod === "right") return <ArrowRight size={16} className="text-orange-500 shrink-0" />;
  if (mod === "slight right") return <ArrowUpRight size={16} className="text-orange-400 shrink-0" />;
  return <ArrowUp size={16} className="text-gray-500 shrink-0" />;
}

function DirectionsPanel({
  steps,
  onClose,
  onResolve,
  disasterType,
}: {
  steps: DirectionStep[];
  onClose: () => void;
  onResolve?: () => Promise<void>;
  disasterType?: DisasterType;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const nextStep = steps[0];

  const handleResolve = async () => {
    if (!onResolve || resolving) return;
    setResolving(true);
    try {
      await onResolve();
    } finally {
      setResolving(false);
    }
  };

  const typeColors: Record<string, string> = {
    fire: "bg-red-50 border-red-200",
    flood: "bg-blue-50 border-blue-200",
    accident: "bg-orange-50 border-orange-200",
    hazard: "bg-yellow-50 border-yellow-200",
  };
  const headerColor = disasterType ? typeColors[disasterType] ?? "" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="
        pointer-events-auto
        fixed bottom-0 left-0 right-0 z-[9999]
        sm:absolute sm:bottom-6 sm:left-auto sm:right-6 sm:w-80 sm:rounded-xl
        bg-white shadow-2xl border-t border-gray-200
        sm:border sm:border-gray-200
        rounded-t-2xl
      "
    >
      {/* Drag handle – mobile only */}
      <div className="flex justify-center pt-2 sm:hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header – always visible, tappable to collapse */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none rounded-t-2xl sm:rounded-t-xl ${headerColor}`}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Navigation size={15} className="text-blue-800 shrink-0" />
          {collapsed && nextStep ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0">{getManeuverIcon(nextStep.type, nextStep.modifier)}</div>
              <span className="text-xs font-semibold text-gray-800 truncate">{nextStep.text}</span>
            </div>
          ) : (
            <h3 className="text-sm font-bold text-blue-900">Turn-by-Turn Directions</h3>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-gray-400 hover:text-red-500 transition-colors p-1"
            title="Close"
          >
            <XCircle size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Collapsible step list */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-1 max-h-52 sm:max-h-64 overflow-y-auto">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="mt-0.5 shrink-0">{getManeuverIcon(step.type, step.modifier)}</div>
                  <span className="text-xs text-gray-700 leading-snug">{step.text}</span>
                </div>
              ))}
            </div>

            {onResolve && (
              <div className="px-4 pb-4 pt-3 border-t border-gray-100">
                <button
                  onClick={handleResolve}
                  disabled={resolving}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg py-2.5 transition-colors shadow-sm"
                >
                  <CheckCircle2 size={16} />
                  {resolving ? "Marking as Resolved..." : "Mark Disaster as Resolved"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DisasterPopupContent({
  disaster,
  role,
  user,
  onFocus,
  reporterRoleMap,
  resolvedByNameMap,
  onRespond,
}: {
  disaster: Disaster;
  role: string | null;
  user: any;
  onFocus?: (id: string) => void;
  reporterRoleMap: Record<string, string>;
  resolvedByNameMap: Record<string, string>;
  onRespond?: (disaster: Disaster) => Promise<void> | void;
}) {
  const map = useMap();
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (onFocus) onFocus(disaster.id);
  }, [disaster.id, onFocus]);

  const handleRespond = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    let success = false;
    setActionError(null);
    setIsUpdating(true);
    try {
      if (onRespond) {
        await onRespond(disaster);
        success = true;
        map.closePopup();
        if (onFocus) onFocus("");
        return;
      }
      const { error } = await supabase
        .from("disasters")
        .update({
          status: "responding",
          responded_by: user?.id,
          responded_at: new Date().toISOString(),
        })
        .eq("id", disaster.id);
      if (error) throw error;
      success = true;
      map.closePopup();
      if (onFocus) onFocus("");
    } catch (err: any) {
      console.error("Failed to respond:", err);
      setActionError("Failed to respond: " + (err.message ?? "Unknown error"));
    } finally {
      if (!success) {
        setIsUpdating(false);
        isProcessingRef.current = false;
      }
    }
  };

  const handleResolve = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    let success = false;
    setActionError(null);
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("disasters")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
        })
        .eq("id", disaster.id);
      if (error) throw error;
      success = true;
      map.closePopup();
      if (onFocus) onFocus("");
    } catch (err: any) {
      console.error("Failed to resolve:", err);
      setActionError("Failed to resolve: " + (err.message ?? "Unknown error"));
    } finally {
      if (!success) {
        setIsUpdating(false);
        isProcessingRef.current = false;
      }
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    let success = false;
    setActionError(null);
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("disasters")
        .update({
          status: "archived",
          archived_by: user?.id,
        })
        .eq("id", disaster.id);
      if (error) throw error;
      success = true;
      map.closePopup();
      if (onFocus) onFocus("");
    } catch (err: any) {
      console.error("Failed to archive:", err);
      setActionError("Failed to archive: " + (err.message ?? "Unknown error"));
    } finally {
      if (!success) {
        setIsUpdating(false);
        isProcessingRef.current = false;
      }
    }
  };

  const reporterRole = reporterRoleMap[disaster.user_id];
  const typeConfig = DISASTER_TYPE_CONFIG[disaster.type];
  const TypeIcon = typeConfig.icon;

  const isOfficial = role === "official";
  const isResponder = role === "responder";
  const isReporter = disaster.user_id === user?.id;

  const showRespondButton = isResponder && disaster.status === "active";
  const showResolveForResponder = isResponder && disaster.status === "responding";
  const showOfficialButtons = isOfficial && (disaster.status === "active" || disaster.status === "responding");
  const canArchive = isOfficial;

  const canSeeDetails =
    role === "official" || isReporter || reporterRole === "official";

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleString();
  };

  const reportedTime = formatTime(disaster.reported_at);
  const resolvedTime = formatTime(disaster.resolved_at);
  const resolverName = disaster.resolved_by
    ? resolvedByNameMap[disaster.resolved_by]
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative font-sans text-center"
    >
      {isUpdating && (
        <div className="absolute inset-0 backdrop-blur-sm bg-white/30 z-10" />
      )}
      <div className="relative z-20 flex flex-col gap-1">
        <div className="flex flex-row flex-nowrap gap-1.5 justify-center">
          <span
            className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium ${disaster.status === "active"
                ? "bg-red-600 text-white"
                : disaster.status === "responding"
                  ? "bg-blue-600 text-white"
                  : disaster.status === "resolved"
                    ? "bg-green-600 text-white"
                    : "bg-gray-600 text-white"
              }`}
          >
            {disaster.status === "active" ? (
              <Clock className="w-3 h-3" />
            ) : disaster.status === "responding" ? (
              <RefreshCw className="w-3 h-3" />
            ) : disaster.status === "resolved" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Archive className="w-3 h-3" />
            )}
            <span>
              {disaster.status === "active"
                ? "Active"
                : disaster.status === "responding"
                  ? "Responding"
                  : disaster.status === "resolved"
                    ? "Resolved"
                    : "Archived"}
            </span>
          </span>

          <span
            className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium text-white ${typeConfig.badge}`}
          >
            <TypeIcon className="w-3 h-3" />
            <span>{typeConfig.label}</span>
          </span>

          {reporterRole && (
            <span
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium ${reporterRole === "official"
                  ? "bg-blue-700 text-white"
                  : "bg-gray-500 text-white"
                }`}
            >
              <User className="w-3 h-3" />
              <span>
                {reporterRole === "official" ? "Brgy. Official" : "Resident"}
              </span>
            </span>
          )}

          {(isOfficial || isResponder) && disaster.contact_number && (
            <a
              href={`tel:${disaster.contact_number}`}
              className="flex items-center justify-center p-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full transition-colors"
              title="Call Reporter"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <div className="text-[10px] text-gray-600">
          Reported: {reportedTime}
        </div>

        {disaster.status === "resolved" && (
          <div className="text-[10px] text-gray-600">
            Resolved by {resolverName || "Unknown"} at {resolvedTime}
          </div>
        )}

        {disaster.type === "hazard" && disaster.description && (
          <div className="p-1 bg-gray-50 rounded border border-gray-200 text-xs text-gray-800 break-words">
            {disaster.description}
          </div>
        )}

        {canSeeDetails && (
          <div className="flex items-center justify-center gap-1 flex-wrap">
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
        )}

        {actionError && (
          <div className="text-[10px] text-red-600 text-center px-1 break-words">
            {actionError}
          </div>
        )}
        <div className="flex justify-center gap-2 mt-0.5">
          {showRespondButton && (
            <button
              onClick={handleRespond}
              disabled={isUpdating}
              className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "Updating..." : "Respond"}
            </button>
          )}
          {showResolveForResponder && (
            <button
              onClick={handleResolve}
              disabled={isUpdating}
              className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "Resolving..." : "Resolve"}
            </button>
          )}
          {showOfficialButtons && (
            <button
              onClick={handleResolve}
              disabled={isUpdating}
              className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "Resolving..." : "Resolve"}
            </button>
          )}
          {canArchive && disaster.status !== "archived" && (
            <button
              onClick={handleArchive}
              disabled={isUpdating}
              className="bg-gray-600 hover:bg-gray-700 text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isUpdating ? "Archiving..." : "Archive"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function EvacuationSitePopupContent({
  site,
  role,
  user,
  onFocus,
  officialPhoneMap,
  onUpdateDescription,
  onRequestRoute,
}: {
  site: EvacuationSite;
  role: string | null;
  user: any;
  onFocus?: (id: string) => void;
  officialPhoneMap: Record<string, string>;
  onUpdateDescription: (id: string, newDescription: string) => Promise<void>;
  onRequestRoute: (site: EvacuationSite) => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(site.description || "");

  useEffect(() => {
    if (onFocus) onFocus(site.id);
  }, [site.id, onFocus]);

  const handleStatusToggle = async () => {
    if (!isOfficial) return;
    setIsUpdating(true);
    try {
      await supabase
        .from("evacuation_sites")
        .update({
          status: site.status === "available" ? "full" : "available",
        })
        .eq("id", site.id);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await supabase.from("evacuation_sites").delete().eq("id", site.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveDescription = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editDesc === site.description) {
      setIsEditingDesc(false);
      return;
    }
    setIsUpdating(true);
    try {
      await onUpdateDescription(site.id, editDesc.trim());
      setIsEditingDesc(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDesc(site.description || "");
    setIsEditingDesc(false);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingDesc(true);
  };

  const handleRouteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestRoute(site);
  };

  const isOfficial = role === "official";
  const isCreator = site.official_id === user?.id;

  const showStatusToggle = isOfficial;
  const canDelete = isOfficial || isCreator;

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative font-sans text-center"
    >
      {(isUpdating || isDeleting) && (
        <div className="absolute inset-0 backdrop-blur-sm bg-white/30 z-10" />
      )}
      <div className="relative z-20 flex flex-col gap-1">
        <div className="flex flex-row flex-nowrap gap-1.5 justify-center">
          <span
            className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium ${site.status === "available"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
              }`}
          >
            {site.status === "available" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            <span>
              {site.status === "available" ? "Available" : "Full"}
            </span>
          </span>

          <span className="flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium bg-green-600 text-white">
            <Building2 className="w-3 h-3" />
            <span>Evacuation Site</span>
          </span>
        </div>

        <div className="text-center font-semibold text-xs text-black break-words">
          {site.title}
        </div>

        <div className="relative pt-1">
          {isEditingDesc ? (
            <div className="flex flex-col gap-1">
              <textarea
                rows={2}
                className="w-full rounded border border-gray-300 p-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={500}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex justify-center gap-2">
                <button
                  onClick={handleSaveDescription}
                  disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 text-white py-0.5 px-2 rounded text-[10px]"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 py-0.5 px-2 rounded text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {site.description ? (
                <div className="p-1 bg-gray-50 rounded border border-gray-200 text-xs text-gray-800 break-words">
                  {site.description}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 italic">
                  No description
                </div>
              )}
              {isOfficial && (
                <button
                  onClick={handleEditClick}
                  className="absolute -mt-1.5 -mr-1 top-0 right-0 bg-transparent p-0.5 text-gray-500 hover:text-gray-700"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="text-[10px] text-gray-600">
          Added: {formatTime(site.created_at)}
        </div>

        <div className="flex items-center justify-center gap-1">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-black" />
            <span className="text-xs font-medium text-black">
              {site.official_name}
            </span>
          </div>
          {officialPhoneMap[site.official_id] && (
            <>
              <span className="text-xs text-black">•</span>
              <div className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-black" />
                <span className="text-xs text-black">
                  {officialPhoneMap[site.official_id]}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-center gap-2 mt-0.5">
          <button
            onClick={handleRouteClick}
            className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/80 text-white py-1 px-3 rounded-md text-xs font-medium transition-colors"
          >
            Get Route
          </button>

          {showStatusToggle && (
            <button
              onClick={handleStatusToggle}
              disabled={isUpdating}
              className={`${site.status === "available"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
                } text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors`}
            >
              {isUpdating
                ? "Updating..."
                : site.status === "available"
                  ? "Mark Full"
                  : "Mark Available"}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Map({
  disasters = [],
  evacuationSites = [],
  currentUser,
  currentUserRole,
  focusDisaster,
  focusEvacuationSite,
  onFocusDisaster,
  onFocusEvacuationSite,
  reporterRoleMap = {},
  resolvedByNameMap = {},
  officialPhoneMap = {},
  onUpdateEvacuationDescription,
  readOnly = false,
}: {
  disasters?: Disaster[];
  evacuationSites?: EvacuationSite[];
  currentUser?: any;
  currentUserRole?: string | null;
  focusDisaster?: { id: string; key: number } | null;
  focusEvacuationSite?: { id: string; key: number } | null;
  onFocusDisaster?: (id: string) => void;
  onFocusEvacuationSite?: (id: string) => void;
  reporterRoleMap?: Record<string, string>;
  resolvedByNameMap?: Record<string, string>;
  officialPhoneMap?: Record<string, string>;
  onUpdateEvacuationDescription?: (
    id: string,
    newDescription: string
  ) => Promise<void>;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const user = currentUser;
  const role = currentUserRole;
  const isResponder = role === "responder";

  const [localDisasters, setLocalDisasters] = useState<Disaster[]>(disasters);
  const [respondingDisasterId, setRespondingDisasterId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDisasters = async () => {
      const { data, error } = await supabase
        .from("disasters")
        .select("*")
        .order("reported_at", { ascending: false });
      if (!error && data) {
        setLocalDisasters(
          data.filter((d: Disaster) => d.status !== "archived")
        );
      }
    };
    fetchDisasters();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("disasters-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "disasters" },
        (payload) => {
          const newDisaster = payload.new as Disaster;
          if (newDisaster.status !== "archived") {
            setLocalDisasters((prev) => [newDisaster, ...prev]);
            startAlert(newDisaster);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "disasters" },
        (payload) => {
          const updated = payload.new as Disaster;
          if (updated.status === "archived") {
            setLocalDisasters((prev) => prev.filter((d) => d.id !== updated.id));
          } else {
            setLocalDisasters((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            );
          }
          if (respondingDisasterId === updated.id && updated.status !== "responding") {
            setRespondingDisasterId(null);
            setRoutingDestination(null);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "disasters" },
        (payload) => {
          setLocalDisasters((prev) =>
            prev.filter((d) => d.id !== payload.old.id)
          );
          if (respondingDisasterId === payload.old.id) {
            setRespondingDisasterId(null);
            setRoutingDestination(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [respondingDisasterId]);

  const [panelMode, setPanelMode] = useState<"disaster" | "evacuation">("disaster");
  const [locationMode, setLocationMode] = useState<"current" | "pick">("current");
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [pickedLocation, setPickedLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBoundaryError, setShowBoundaryError] = useState(false);
  const [routingDestination, setRoutingDestination] = useState<[number, number] | null>(null);
  const [directionsSteps, setDirectionsSteps] = useState<DirectionStep[]>([]);
  const [showDirections, setShowDirections] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const [alertActive, setAlertActive] = useState(false);
  const [alertDisasterId, setAlertDisasterId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashOverlayRef = useRef<HTMLDivElement | null>(null);

  const disasterMarkersRef = useRef<Record<string, L.Marker | null>>({});
  const evacMarkersRef = useRef<Record<string, L.Marker | null>>({});
  const manuallyClosedDisaster = useRef(false);
  const manuallyClosedEvac = useRef(false);
  const initialRequestDone = useRef(false);

  useEffect(() => {
    if (isResponder) {
      setPickedLocation(null);
      setLocationError(null);
      setIsGettingLocation(false);
    }
  }, [isResponder]);

  const requestDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      return;
    }
    setIsGettingLocation(true);
    setLocationError(null);

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocationError(null);
        setIsGettingLocation(false);
      },
      (err) => {
        setLocationError(err.message);
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!initialRequestDone.current && locationMode === "current") {
      initialRequestDone.current = true;
      requestDeviceLocation();
    }
  }, [locationMode, requestDeviceLocation]);

  const handleLocationModeChange = useCallback(
    (mode: "current" | "pick") => {
      setLocationMode(mode);
      if (mode === "current") {
        if (!currentLocation && !isGettingLocation) {
          requestDeviceLocation();
        }
      }
    },
    [currentLocation, isGettingLocation, requestDeviceLocation]
  );

  const handleMapPick = (lat: number, lng: number) => {
    if (locationMode === "pick" && !isResponder) {
      setPickedLocation([lat, lng]);
    }
  };

  const handleBoundaryError = useCallback(() => setShowBoundaryError(true), []);

  const submitDisasterReport = useCallback(
    async (type: DisasterType, location: [number, number], description?: string) => {
      if (!user) return;
      if (!isWithinBoundary(location[0], location[1])) {
        setShowBoundaryError(true);
        return;
      }
      setIsSubmitting(true);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, contact_number, role")
          .eq("id", user.id)
          .single();
        if (!profile) return;
        await supabase.from("disasters").insert({
          user_id: user.id,
          full_name: `${profile.first_name} ${profile.last_name}`,
          contact_number: profile.contact_number ?? null,
          lat: location[0],
          lng: location[1],
          type,
          description: type === "hazard" ? description : null,
          status: "active",
        });
        if (locationMode === "pick") setPickedLocation(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [user, locationMode]
  );

  const submitEvacuationSite = useCallback(
    async (location: [number, number], title: string, description?: string) => {
      if (!user) return;
      if (!isWithinBoundary(location[0], location[1])) {
        setShowBoundaryError(true);
        return;
      }
      setIsSubmitting(true);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        if (!profile) return;
        await supabase.from("evacuation_sites").insert({
          official_id: user.id,
          official_name: `${profile.first_name} ${profile.last_name}`.trim(),
          lat: location[0],
          lng: location[1],
          title: title,
          description: description || null,
          status: "available",
        });
        if (locationMode === "pick") setPickedLocation(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [user, locationMode]
  );

  const getDisasterIcon = (disaster: Disaster) => {
    if (disaster.status === "resolved") return disasterIcons.resolved;
    if (disaster.status === "archived") return disasterIcons.resolved;
    if (disaster.type === "hazard") return customHazardIcon;
    switch (disaster.type) {
      case "fire":
        return disasterIcons.fire;
      case "accident":
        return disasterIcons.accident;
      case "flood":
        return disasterIcons.flood;
      default:
        return disasterIcons.default;
    }
  };

  const getEvacuationIcon = (site: EvacuationSite) => {
    return site.status === "available" ? evacuationSiteAvailable : evacuationSiteFull;
  };

  const routingUserLocation = locationMode === "current" ? currentLocation : pickedLocation;

  const handleRequestRoute = useCallback(
    (site: EvacuationSite) => {
      setRoutingDestination([site.lat, site.lng]);
      evacMarkersRef.current[site.id]?.closePopup();
      onFocusEvacuationSite?.("");
    },
    [onFocusEvacuationSite]
  );

  const handleEvacMarkerClick = useCallback(
    (site: EvacuationSite) => {
      if (readOnly) {
        router.push(`/evacuation?id=${site.id}`);
      } else {
        if (
          routingDestination &&
          routingDestination[0] === site.lat &&
          routingDestination[1] === site.lng
        ) {
          setRoutingDestination(null);
        }
        onFocusEvacuationSite?.(site.id);
      }
    },
    [readOnly, router, onFocusEvacuationSite, routingDestination]
  );

  useEffect(() => {
    if (!routingUserLocation) {
      setRoutingDestination(null);
    }
  }, [routingUserLocation]);

  const fetchDirections = useCallback(async () => {
    if (!currentLocation || !routingDestination) return;
    try {
      const coords = `${currentLocation[1]},${currentLocation[0]};${routingDestination[1]},${routingDestination[0]}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes?.length > 0) {
        const allSteps: DirectionStep[] = [];
        data.routes[0].legs.forEach((leg: any) => {
          leg.steps.forEach((step: any) => {
            const mType: string = step.maneuver.type ?? "";
            const mMod: string | undefined = step.maneuver.modifier;
            let text = "";
            if (step.maneuver.instruction && step.maneuver.instruction.trim().length > 0) {
              text = step.maneuver.instruction.trim();
            } else {
              const modifier = mMod ? ` ${mMod}` : "";
              const name = step.name ? ` on ${step.name}` : "";
              if (mType === "turn") text = `Turn${modifier}${name}`;
              else if (mType === "new name") text = `Continue${modifier}${name}`;
              else if (mType === "depart") text = `Head${modifier}${name}`;
              else if (mType === "arrive") text = `Arrive at destination`;
              else text = `${mType}${modifier}${name}`;
              text = text.charAt(0).toUpperCase() + text.slice(1);
            }
            allSteps.push({ text, type: mType, modifier: mMod });
          });
        });
        setDirectionsSteps(allSteps);
        setShowDirections(true);
      }
    } catch (error) {
      console.error("Failed to fetch directions:", error);
    }
  }, [currentLocation, routingDestination]);

  useEffect(() => {
    if (routingDestination && currentLocation) {
      fetchDirections();
    } else {
      setShowDirections(false);
      setDirectionsSteps([]);
    }
  }, [routingDestination, currentLocation, fetchDirections]);

  // Stop GPS tracking when no longer responding
  useEffect(() => {
    if (!respondingDisasterId && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [respondingDisasterId]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const handleRespondToDisaster = useCallback(
    async (disaster: Disaster) => {
      if (!user) return;
      let loc = currentLocation;
      if (!loc) {
        try {
          await new Promise<void>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error("Geolocation not supported"));
              return;
            }
            setIsGettingLocation(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                loc = [pos.coords.latitude, pos.coords.longitude];
                setCurrentLocation(loc);
                setIsGettingLocation(false);
                resolve();
              },
              (err) => {
                setIsGettingLocation(false);
                alert("Location access is required to respond to a disaster. Please enable it.");
                reject(err);
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        } catch { }
      }

      const { error } = await supabase
        .from("disasters")
        .update({
          status: "responding",
          responded_by: user.id,
          responded_at: new Date().toISOString(),
        })
        .eq("id", disaster.id);

      if (error) {
        console.error("Respond error:", error);
        return;
      }

      setRespondingDisasterId(disaster.id);
      if (loc) {
        setRoutingDestination([disaster.lat, disaster.lng]);
      }
      onFocusDisaster?.("");

      // Start live GPS tracking so the map follows the responder
      if (navigator.geolocation) {
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => setCurrentLocation([pos.coords.latitude, pos.coords.longitude]),
          (err) => console.warn("GPS watch error:", err),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );
      }
    },
    [user, currentLocation, onFocusDisaster]
  );

  const visibleDisasters = useMemo(() => {
    if (!isResponder || !respondingDisasterId) return localDisasters;
    return localDisasters.filter((d) => d.id === respondingDisasterId);
  }, [localDisasters, isResponder, respondingDisasterId]);

  const stopAlert = useCallback(() => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (flashOverlayRef.current && flashOverlayRef.current.parentNode) {
      flashOverlayRef.current.parentNode.removeChild(flashOverlayRef.current);
      flashOverlayRef.current = null;
    }
    setAlertActive(false);
    setAlertDisasterId(null);
    localStorage.removeItem("activeDisasterId");
    localStorage.removeItem("alertActive");
  }, []);

  const startAlert = useCallback(
    (disaster: Disaster) => {
      const dismissed = localStorage.getItem(`dismissedAlert_${disaster.id}`);
      if (dismissed === "true") return;
      if (alertActive && alertDisasterId === disaster.id) return;

      stopAlert();

      const config = DISASTER_TYPE_CONFIG[disaster.type];
      if (!config) return;

      const ALERT_DURATION_MS = 5 * 60 * 1000;
      const reportedAt = new Date(disaster.reported_at).getTime();
      const now = Date.now();
      let remaining = ALERT_DURATION_MS - (now - reportedAt);
      if (remaining <= 0) return;

      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "9998";
      overlay.style.backgroundColor = "transparent";
      overlay.style.animation = `flash-${disaster.type} 0.5s infinite`;
      document.body.appendChild(overlay);
      flashOverlayRef.current = overlay;

      const audio = new Audio(config.soundFile);
      audioRef.current = audio;
      audio.play().catch((e) => console.log("Audio play failed:", e));

      alertTimeoutRef.current = setTimeout(() => {
        stopAlert();
      }, remaining);

      setAlertActive(true);
      setAlertDisasterId(disaster.id);

      localStorage.setItem("activeDisasterId", disaster.id);
      localStorage.setItem("alertActive", "true");

      if (onFocusDisaster) onFocusDisaster(disaster.id);
      setTimeout(() => {
        disasterMarkersRef.current[disaster.id]?.openPopup();
      }, 500);
    },
    [stopAlert, onFocusDisaster, alertActive, alertDisasterId]
  );

  useEffect(() => {
    const activeDisaster = localDisasters.find((d) => d.status === "active");
    if (activeDisaster) {
      startAlert(activeDisaster);
    } else {
      stopAlert();
    }
  }, [localDisasters, startAlert, stopAlert]);

  useEffect(() => {
    const storedDisasterId = localStorage.getItem("activeDisasterId");
    const storedAlertActive = localStorage.getItem("alertActive");
    if (storedDisasterId && storedAlertActive === "true") {
      const disaster = localDisasters.find((d) => d.id === storedDisasterId);
      if (disaster) {
        startAlert(disaster);
      } else {
        localStorage.removeItem("activeDisasterId");
        localStorage.removeItem("alertActive");
      }
    }
  }, [localDisasters, startAlert]);

  useEffect(() => {
    return () => {
      stopAlert();
    };
  }, [stopAlert]);

  const handleStopAlert = () => {
    if (alertDisasterId) {
      localStorage.setItem(`dismissedAlert_${alertDisasterId}`, "true");
    }
    stopAlert();
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes flash-fire {
        0% { background-color: transparent; }
        50% { background-color: rgba(255, 0, 0, 0.4); }
        100% { background-color: transparent; }
      }
      @keyframes flash-accident {
        0% { background-color: transparent; }
        50% { background-color: rgba(255, 165, 0, 0.4); }
        100% { background-color: transparent; }
      }
      @keyframes flash-flood {
        0% { background-color: transparent; }
        50% { background-color: rgba(0, 0, 255, 0.4); }
        100% { background-color: transparent; }
      }
      @keyframes flash-hazard {
        0% { background-color: transparent; }
        50% { background-color: rgba(255, 255, 0, 0.4); }
        100% { background-color: transparent; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative h-full w-full"
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
        dragging={!readOnly}
        zoomControl={!readOnly}
        scrollWheelZoom={!readOnly}
        doubleClickZoom={!readOnly}
        boxZoom={!readOnly}
        keyboard={!readOnly}
        touchZoom={!readOnly}
      >
        <BoundaryLayer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {!readOnly && locationMode === "pick" && !isResponder && (
          <ClickToPickLocation
            onPick={(lat, lng) => handleMapPick(lat, lng)}
            onBoundaryError={handleBoundaryError}
          />
        )}

        {!readOnly && locationMode === "pick" && pickedLocation && !isResponder && (
          <Marker position={pickedLocation} icon={userLocationIcon}>
            <Popup>Pinned location.</Popup>
          </Marker>
        )}

        {!readOnly && locationMode === "current" && currentLocation && (
          <Marker position={currentLocation} icon={userLocationIcon}>
            <Popup>Your current location.</Popup>
          </Marker>
        )}

        <CustomRoutingControl
          userLocation={routingUserLocation}
          destination={routingDestination}
          disasters={visibleDisasters}
          isNavigating={isResponder && !!respondingDisasterId}
        />

        {visibleDisasters.map((disaster) => (
          <Marker
            key={disaster.id}
            position={[disaster.lat, disaster.lng]}
            icon={getDisasterIcon(disaster)}
            eventHandlers={{
              click: () => {
                if (readOnly) router.push(`/disasters?id=${disaster.id}`);
                else onFocusDisaster?.(disaster.id);
              },
              ...(!readOnly && {
                popupopen: (e) => {
                  onFocusDisaster?.(disaster.id);
                  const map = e.target._map;
                  const popup = e.popup;
                  if (!map || !popup) return;
                  setTimeout(() => {
                    const container = popup.getElement();
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const popupCenterX = rect.left + rect.width / 2;
                    const popupCenterY = rect.top + rect.height / 2;
                    const mapRect = map.getContainer().getBoundingClientRect();
                    const point = {
                      x: popupCenterX - mapRect.left,
                      y: popupCenterY - mapRect.top,
                    };
                    const targetLatLng = map.containerPointToLatLng([
                      point.x,
                      point.y,
                    ]);
                    map.flyTo(targetLatLng, map.getZoom(), {
                      duration: 0.8,
                    });
                  }, 10);
                },
                popupclose: () => {
                  manuallyClosedDisaster.current = true;
                  onFocusDisaster?.("");
                },
              }),
            }}
            ref={(ref) => {
              disasterMarkersRef.current[disaster.id] = ref;
            }}
          >
            <Popup className="disaster-popup" autoPan={false}>
              <DisasterPopupContent
                disaster={disaster}
                role={role ?? null}
                user={user}
                onFocus={onFocusDisaster}
                reporterRoleMap={reporterRoleMap}
                resolvedByNameMap={resolvedByNameMap}
                onRespond={isResponder ? handleRespondToDisaster : undefined}
              />
            </Popup>
          </Marker>
        ))}

        {evacuationSites.map((site) => (
          <Marker
            key={site.id}
            position={[site.lat, site.lng]}
            icon={getEvacuationIcon(site)}
            eventHandlers={{
              click: () => handleEvacMarkerClick(site),
              ...(!readOnly && {
                popupopen: (e) => {
                  onFocusEvacuationSite?.(site.id);
                  const map = e.target._map;
                  const popup = e.popup;
                  if (!map || !popup) return;
                  setTimeout(() => {
                    const container = popup.getElement();
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const popupCenterX = rect.left + rect.width / 2;
                    const popupCenterY = rect.top + rect.height / 2;
                    const mapRect = map.getContainer().getBoundingClientRect();
                    const point = {
                      x: popupCenterX - mapRect.left,
                      y: popupCenterY - mapRect.top,
                    };
                    const targetLatLng = map.containerPointToLatLng([
                      point.x,
                      point.y,
                    ]);
                    map.flyTo(targetLatLng, map.getZoom(), {
                      duration: 0.8,
                    });
                  }, 10);
                },
                popupclose: () => {
                  manuallyClosedEvac.current = true;
                  onFocusEvacuationSite?.("");
                },
              }),
            }}
            ref={(ref) => {
              evacMarkersRef.current[site.id] = ref;
            }}
          >
            <Popup className="evacuation-popup" autoPan={false}>
              <EvacuationSitePopupContent
                site={site}
                role={role ?? null}
                user={user}
                onFocus={onFocusEvacuationSite}
                officialPhoneMap={officialPhoneMap}
                onUpdateDescription={
                  onUpdateEvacuationDescription ||
                  (() => Promise.resolve())
                }
                onRequestRoute={handleRequestRoute}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <AnimatePresence>
        {showBoundaryError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[9999] flex items-center justify-center bg-white/20 backdrop-blur-sm"
            onClick={() => setShowBoundaryError(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <AlertTriangle size={24} className="text-blue-600" />
                </div>
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-blue-900">
                Outside Service Area
              </h3>
              <p className="mb-6 text-center text-sm text-gray-700">
                Reports and evacuation sites are only accepted within New
                Ilalim, Olongapo City.
              </p>
              <button
                onClick={() => setShowBoundaryError(false)}
                className="w-full rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!readOnly && user && currentUserRole !== "responder" && (
        <ActionPanel
          onReportDisaster={submitDisasterReport}
          onSubmitEvacuation={submitEvacuationSite}
          isSubmitting={isSubmitting}
          mode={panelMode}
          onModeChange={setPanelMode}
          userRole={role}
          locationMode={locationMode}
          onLocationModeChange={handleLocationModeChange}
          currentLocation={currentLocation}
          pickedLocation={pickedLocation}
          locationError={locationError}
          onRequestLocation={requestDeviceLocation}
          onClearPickedLocation={() => setPickedLocation(null)}
          isGettingLocation={isGettingLocation}
        />
      )}

      {alertActive && (
        <div className="fixed top-[80px] left-1/2 transform -translate-x-1/2 z-[10000]">
          <button
            onClick={handleStopAlert}
            className="bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-all flex items-center gap-1"
          >
            <VolumeX size={16} />
            <span className="text-xs font-medium">Stop Alert</span>
          </button>
        </div>
      )}

      <AnimatePresence>
        {showDirections && directionsSteps.length > 0 && (() => {
          const respondingDisaster = respondingDisasterId
            ? localDisasters.find((d) => d.id === respondingDisasterId)
            : null;
          return (
            <DirectionsPanel
              steps={directionsSteps}
              onClose={() => setShowDirections(false)}
              disasterType={respondingDisaster?.type}
              onResolve={isResponder && respondingDisaster ? async () => {
                if (!user) return;
                const { error } = await supabase
                  .from("disasters")
                  .update({
                    status: "resolved",
                    resolved_at: new Date().toISOString(),
                    resolved_by: user.id,
                  })
                  .eq("id", respondingDisaster.id);
                if (error) throw error;
                // Stop siren/alert
                if (alertDisasterId) {
                  localStorage.setItem(`dismissedAlert_${alertDisasterId}`, "true");
                }
                stopAlert();
                // Clear navigation state
                setRespondingDisasterId(null);
                setRoutingDestination(null);
                setShowDirections(false);
                setDirectionsSteps([]);
                if (watchIdRef.current !== null) {
                  navigator.geolocation.clearWatch(watchIdRef.current);
                  watchIdRef.current = null;
                }
              } : undefined}
            />
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}