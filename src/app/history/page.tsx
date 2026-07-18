"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/AuthContext";
import { useData, Disaster } from "@/app/lib/DataContext";
import { supabase } from "@/app/lib/supabaseClient";
import {
  CalendarDays, CalendarRange, Calendar, Search, Flame, Car, Droplets, AlertTriangle,
  TrendingUp, AlertTriangle as AlertTriangleIcon, CheckCircle, FileDown, Archive,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, Variants } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Timeframe = "daily" | "weekly" | "monthly" | "annually";

const TYPE_CONFIG = {
  fire: { label: "Fire", icon: Flame, bg: "bg-red-600" },
  accident: { label: "Accident", icon: Car, bg: "bg-orange-500" },
  flood: { label: "Flood", icon: Droplets, bg: "bg-blue-600" },
  hazard: { label: "Hazard", icon: AlertTriangle, bg: "bg-yellow-500" },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const getEffectiveStatus = (dis: Disaster) => {
  if (dis.status === "archived" && dis.resolved_at) return "resolved";
  return dis.status;
};

export default function HistoryPage() {
  const { user, userRole, isLoading } = useAuth();
  const router = useRouter();
  const { disasters } = useData();

  useEffect(() => {
    if (isLoading) return;
    if (user && userRole !== undefined && userRole !== "official") {
      router.push("/");
    } else if (!user) {
      router.push("/");
    }
  }, [isLoading, user, userRole, router]);

  const [timeframe, setTimeframe] = useState<Timeframe>("weekly");
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const [profileMap, setProfileMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role, contact_number");
      if (data) {
        const map: Record<string, any> = {};
        data.forEach((p) => {
          map[p.id] = {
            first_name: p.first_name,
            last_name: p.last_name,
            role: p.role,
            contact_number: p.contact_number,
          };
        });
        setProfileMap(map);
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth < 640);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    return new Date(year, month, day);
  };

  const getFilteredByTimeframe = (disasters: Disaster[], timeframe: Timeframe) => {
    const now = new Date();
    let startDate: Date, endDate: Date;

    if (timeframe === "daily") {
      startDate = getLocalDate(now);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);
    } else if (timeframe === "weekly") {
      const today = getLocalDate(now);
      const dayOfWeek = today.getDay();
      startDate = new Date(today);
      startDate.setDate(today.getDate() - dayOfWeek);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 7);
    } else if (timeframe === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
    }

    return disasters.filter((dis) => {
      const reported = new Date(dis.reported_at);
      return reported >= startDate && reported < endDate;
    });
  };

  const processChartData = (disasters: Disaster[], timeframe: Timeframe) => {
    const now = new Date();
    const intervals: { start: Date; end: Date; label: string }[] = [];

    if (timeframe === "daily") {
      const today = getLocalDate(now);
      for (let hour = 0; hour < 24; hour++) {
        const intervalStart = new Date(today);
        intervalStart.setHours(hour, 0, 0, 0);
        const intervalEnd = new Date(today);
        intervalEnd.setHours(hour + 1, 0, 0, 0);
        const label = intervalStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
        intervals.push({ start: intervalStart, end: intervalEnd, label });
      }
    } else if (timeframe === "weekly") {
      const today = getLocalDate(now);
      const dayOfWeek = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - dayOfWeek);
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(sunday);
        dayStart.setDate(sunday.getDate() + i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);
        const label = dayStart.toLocaleDateString([], { weekday: "long" });
        intervals.push({ start: dayStart, end: dayEnd, label });
      }
    } else if (timeframe === "monthly") {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), day);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);
        const label = dayStart.toLocaleDateString([], { day: "numeric", month: "short" });
        intervals.push({ start: dayStart, end: dayEnd, label });
      }
    } else {
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(now.getFullYear(), month, 1);
        const monthEnd = new Date(now.getFullYear(), month + 1, 1);
        const label = monthStart.toLocaleDateString([], { month: "short" });
        intervals.push({ start: monthStart, end: monthEnd, label });
      }
    }

    return intervals.map((interval) => {
      let active = 0,
        resolved = 0;
      disasters.forEach((dis) => {
        const reportedTime = new Date(dis.reported_at).getTime();
        const effective = getEffectiveStatus(dis);
        if (effective === "active" && reportedTime >= interval.start.getTime() && reportedTime < interval.end.getTime()) active++;
        if (effective === "resolved") {
          const resolvedTime = new Date(dis.resolved_at!).getTime();
          if (resolvedTime >= interval.start.getTime() && resolvedTime < interval.end.getTime()) resolved++;
        }
      });
      return { label: interval.label, active, resolved };
    });
  };

  const timeframeFilteredDisasters = useMemo(() => getFilteredByTimeframe(disasters, timeframe), [disasters, timeframe]);

  const typeStats = useMemo(() => {
    const types = ["fire", "accident", "flood", "hazard"] as const;
    return types.map((type) => {
      const typeDisasters = timeframeFilteredDisasters.filter((d) => d.type === type);
      const active = typeDisasters.filter((d) => getEffectiveStatus(d) === "active").length;
      const resolved = typeDisasters.filter((d) => getEffectiveStatus(d) === "resolved").length;
      return { type, active, resolved };
    });
  }, [timeframeFilteredDisasters]);

  const stats = useMemo(() => {
    const total = timeframeFilteredDisasters.length;
    const active = timeframeFilteredDisasters.filter((d) => getEffectiveStatus(d) === "active").length;
    const resolved = timeframeFilteredDisasters.filter((d) => getEffectiveStatus(d) === "resolved").length;
    return { total, active, resolved };
  }, [timeframeFilteredDisasters]);

  const chartData = useMemo(() => processChartData(timeframeFilteredDisasters, timeframe), [timeframeFilteredDisasters, timeframe]);

  const filteredDisasters = useMemo(() => {
    return timeframeFilteredDisasters.filter((disaster) => {
      const matchesSearch =
        searchQuery === "" ||
        disaster.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (disaster.description && disaster.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        disaster.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "all" || disaster.type === filterType;

      let matchesStatus = true;
      if (filterStatus === "active") {
        matchesStatus = getEffectiveStatus(disaster) === "active";
      } else if (filterStatus === "responding") {
        matchesStatus = disaster.status === "responding";
      } else if (filterStatus === "resolved") {
        matchesStatus = getEffectiveStatus(disaster) === "resolved";
      } else if (filterStatus === "archived") {
        matchesStatus = disaster.status === "archived";
      }

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [timeframeFilteredDisasters, searchQuery, filterType, filterStatus]);

  const getXAxisProps = () => {
    const baseProps = { axisLine: { stroke: "#1e3a8a" }, tickLine: { stroke: "#1e3a8a" } };
    if (timeframe === "daily")
      return { ...baseProps, interval: isSmallScreen ? 2 : 0, angle: -30, textAnchor: "end" as const, height: 50, tick: { fontSize: isSmallScreen ? 9 : 11, fill: "#1e3a8a" } };
    else if (timeframe === "weekly")
      return { ...baseProps, interval: 0, angle: -30, textAnchor: "end" as const, height: 60, tick: { fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" } };
    else if (timeframe === "monthly")
      return { ...baseProps, interval: isSmallScreen ? 3 : 0, angle: -30, textAnchor: "end" as const, height: 60, tick: { fontSize: isSmallScreen ? 9 : 11, fill: "#1e3a8a" } };
    else
      return { ...baseProps, interval: 0, angle: -30, textAnchor: "end" as const, height: 60, tick: { fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" } };
  };

  const chartTitle = () => {
    if (timeframe === "daily") return "Hourly Disaster Activity (Today)";
    if (timeframe === "weekly") return "Daily Disaster Activity (Current Week)";
    if (timeframe === "monthly") return "Daily Disaster Activity (Current Month)";
    return "Monthly Disaster Activity (Current Year)";
  };

  const timeframeLabel = () => ({ daily: "Daily", weekly: "Weekly", monthly: "Monthly", annually: "Annually" }[timeframe]);

  const getReporterInfo = (disaster: Disaster) => {
    const profile = disaster.user_id ? profileMap[disaster.user_id] : null;
    const role = profile?.role || "";
    const phone = profile?.contact_number || disaster.contact_number || "";
    return { name: disaster.full_name, role, phone };
  };

  const getResolverInfo = (resolvedBy: string | null) => {
    if (!resolvedBy) return { name: "—", role: "", phone: "" };
    const profile = profileMap[resolvedBy];
    if (!profile) return { name: resolvedBy, role: "", phone: "" };
    return {
      name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
      role: profile.role || "",
      phone: profile.contact_number || "",
    };
  };

  const getResponderInfo = (respondedBy: string | null | undefined) => {
    if (!respondedBy) return { name: "—", role: "", phone: "" };
    const profile = profileMap[respondedBy];
    if (!profile) return { name: respondedBy, role: "", phone: "" };
    return {
      name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
      role: profile.role || "",
      phone: profile.contact_number || "",
    };
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 14;

      const REPORT_LOGO_SRC = "/logo_newilalim.jpg";
      const FALLBACK_LOGO_SRC = "/newilalim.png";

      const getImageType = (src: string): "PNG" | "JPEG" => {
        const ext = src.split(".").pop()?.toLowerCase();
        return ext === "png" ? "PNG" : "JPEG";
      };

      const loadLogo = (): Promise<{ img: HTMLImageElement; type: "PNG" | "JPEG" } | null> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = REPORT_LOGO_SRC;
          img.onload = () => resolve({ img, type: getImageType(REPORT_LOGO_SRC) });
          img.onerror = () => {
            const fallbackImg = new Image();
            fallbackImg.src = FALLBACK_LOGO_SRC;
            fallbackImg.onload = () => resolve({ img: fallbackImg, type: getImageType(FALLBACK_LOGO_SRC) });
            fallbackImg.onerror = () => resolve(null);
          };
        });
      };

      const logoPayload = await loadLogo();

      const currentUserProfile = user ? profileMap[user.id] : null;
      const generatedBy = currentUserProfile
        ? `${currentUserProfile.first_name || ""} ${currentUserProfile.last_name || ""}`.trim()
        : user?.email || "System Official";

      const renderedHeaderPages = new Set<number>();
      const drawHeader = (data: any) => {
        if (renderedHeaderPages.has(data.pageNumber)) return;
        renderedHeaderPages.add(data.pageNumber);

        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text("ONE ILALIM - SMART DISASTER MONITORING SYSTEM", margin, 10);
        pdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth - margin, 10, { align: "right" });
        pdf.setDrawColor(200);
        pdf.setLineWidth(0.2);
        pdf.line(margin, 12, pageWidth - margin, 12);
      };

      let currentY = 16;

      if (logoPayload) {
        pdf.addImage(logoPayload.img, logoPayload.type, margin, currentY, 20, 20);
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(30, 58, 138);
      pdf.text("REPUBLIC OF THE PHILIPPINES", margin + 23, currentY + 4);
      pdf.text("PROVINCE OF ZAMBALES | OLONGAPO CITY", margin + 23, currentY + 8);

      pdf.setFontSize(13);
      pdf.text("BARANGAY NEW ILALIM", margin + 23, currentY + 14);

      currentY += 21;
      pdf.setDrawColor(30, 58, 138);
      pdf.setLineWidth(0.8);
      pdf.line(margin, currentY, pageWidth - margin, currentY);
      pdf.setLineWidth(0.2);
      pdf.line(margin, currentY + 1, pageWidth - margin, currentY + 1);

      currentY += 9;
      pdf.setFontSize(11);
      pdf.setTextColor(30, 58, 138);
      pdf.text("BARANGAY NEW ILALIM OFFICIAL DISASTER INCIDENT HISTORY REPORT", margin, currentY);

      currentY += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(80);
      pdf.text(`Report Timeframe: ${timeframeLabel()} Overview`, margin, currentY);
      pdf.text(`Status: Active & Resolved Case Logs`, pageWidth - margin, currentY, { align: "right" });

      currentY += 4.5;
      pdf.text(`Prepared By: ${generatedBy}`, margin, currentY);
      pdf.text(`Document Reference: BNI-DRRMO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, pageWidth - margin, currentY, { align: "right" });

      currentY += 4;
      pdf.setDrawColor(220);
      pdf.setLineWidth(0.3);
      pdf.line(margin, currentY, pageWidth - margin, currentY);

      currentY += 8;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(30, 58, 138);
      pdf.text("1. Executive Summary & Operational Metrics", margin, currentY);

      const summaryBody = [
        ["Total Logged Incidents", `${stats.total}`, "Active Emergency Cases", `${stats.active}`],
        ["Resolved Incidents", `${stats.resolved}`, "Resolution Performance Rate", stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}%` : "0%"]
      ];

      autoTable(pdf, {
        startY: currentY + 3,
        body: summaryBody,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.5, textColor: [50, 50, 50] },
        columnStyles: {
          0: { fontStyle: "bold", textColor: [30, 58, 138], cellWidth: 50 },
          1: { fontStyle: "bold", cellWidth: 40 },
          2: { fontStyle: "bold", textColor: [220, 38, 38], cellWidth: 50 },
          3: { fontStyle: "bold", cellWidth: 40 }
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => drawHeader(data),
      });

      currentY = (pdf as any).lastAutoTable.finalY + 8;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(30, 58, 138);
      pdf.text("2. Disaster Trend Visualization (Native Graph)", margin, currentY);

      currentY += 4;
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, currentY, pageWidth - margin * 2, 45, "F");

      pdf.setDrawColor(30, 58, 138);
      pdf.setLineWidth(0.4);
      const graphOriginX = margin + 15;
      const graphOriginY = currentY + 37;
      const graphWidth = pageWidth - margin * 2 - 25;
      const graphHeight = 28;

      pdf.line(graphOriginX, graphOriginY, graphOriginX + graphWidth, graphOriginY);
      pdf.line(graphOriginX, graphOriginY, graphOriginX, graphOriginY - graphHeight);

      const filteredTrendData = chartData.slice(-10);
      const barCount = filteredTrendData.length;
      if (barCount > 0) {
        const barSpacing = graphWidth / barCount;
        const maxVal = Math.max(...filteredTrendData.map(d => d.active + d.resolved), 4);

        pdf.setFontSize(6);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120);
        pdf.setDrawColor(220, 225, 230);
        pdf.setLineWidth(0.15);
        for (let i = 1; i <= 4; i++) {
          const gridY = graphOriginY - (i / 4) * graphHeight;
          const labelVal = Math.round((i / 4) * maxVal);
          pdf.line(graphOriginX, gridY, graphOriginX + graphWidth, gridY);
          pdf.text(labelVal.toString(), graphOriginX - 3, gridY + 1.5, { align: "right" });
        }
        pdf.text("0", graphOriginX - 3, graphOriginY + 1.5, { align: "right" });

        filteredTrendData.forEach((d, idx) => {
          const barX = graphOriginX + idx * barSpacing + barSpacing * 0.15;
          const barW = barSpacing * 0.7;

          const activeH = (d.active / maxVal) * graphHeight;
          if (activeH > 0) {
            pdf.setFillColor(239, 68, 68);
            pdf.rect(barX, graphOriginY - activeH, barW / 2, activeH, "F");
          }

          const resolvedH = (d.resolved / maxVal) * graphHeight;
          if (resolvedH > 0) {
            pdf.setFillColor(34, 197, 94);
            pdf.rect(barX + barW / 2, graphOriginY - resolvedH, barW / 2, resolvedH, "F");
          }

          pdf.setFontSize(6);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(80);
          pdf.text(d.label.substring(0, 8), barX + barW / 2, graphOriginY + 4, { align: "center" });
        });
      }

      pdf.setFillColor(239, 68, 68);
      pdf.rect(pageWidth - margin - 45, currentY + 3, 3, 3, "F");
      pdf.setFontSize(7);
      pdf.setTextColor(50);
      pdf.text("Active Cases", pageWidth - margin - 40, currentY + 5.5);

      pdf.setFillColor(34, 197, 94);
      pdf.rect(pageWidth - margin - 23, currentY + 3, 3, 3, "F");
      pdf.text("Resolved Cases", pageWidth - margin - 18, currentY + 5.5);

      currentY += 49;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(30, 58, 138);
      pdf.text("3. Detailed Incident Registry", margin, currentY);

      const tableRows = filteredDisasters.map((dis) => {
        const reporter = getReporterInfo(dis);
        const resolver = getResolverInfo(dis.resolved_by);
        const effective = getEffectiveStatus(dis);
        const statusText =
          dis.status === "archived" && dis.resolved_at
            ? "Resolved & Archived"
            : dis.status === "archived"
            ? "Archived"
            : dis.status === "responding"
            ? "Responding"
            : effective === "resolved"
            ? "Resolved"
            : "Active";
        return [
          dis.type.toUpperCase(),
          `${reporter.name}\n${reporter.phone || ""}`,
          dis.description || "—",
          statusText,
          new Date(dis.reported_at).toLocaleString(),
          dis.resolved_at ? new Date(dis.resolved_at).toLocaleString() : "—",
          resolver.name !== "—" ? `${resolver.name}\n(${resolver.role || "Official"})` : "—"
        ];
      });

      autoTable(pdf, {
        startY: currentY + 3,
        head: [["Type", "Reporter Details", "Incident Description", "Status", "Reported Time", "Resolved Time", "Resolved By"]],
        body: tableRows,
        styles: { font: "helvetica", fontSize: 6.5, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 30 },
          2: { cellWidth: 42 },
          3: { cellWidth: 20 },
          4: { cellWidth: 26 },
          5: { cellWidth: 26 },
          6: { cellWidth: 23 }
        },
        didDrawPage: (data: any) => drawHeader(data),
      });

      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text("CONFIDENTIAL - BARANGAY EMERGENCY OPS", margin, pageHeight - 10);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }

      pdf.save(`disaster-report-${timeframe}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="h-auto xl:h-full xl:min-h-0 relative p-4">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            {(["daily", "weekly", "monthly", "annually"] as Timeframe[]).map((t) => (
              <motion.button
                key={t}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setTimeframe(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === t ? "bg-[#1e3a8a] text-white shadow-sm" : "text-gray-600 hover:bg-gray-200"}`}
              >
                {t === "daily" && <CalendarDays size={16} />}
                {t === "weekly" && <CalendarRange size={16} />}
                {t === "monthly" && <Calendar size={16} />}
                {t === "annually" && <Calendar size={16} />}
                <span className="capitalize">{t}</span>
              </motion.button>
            ))}
          </div>
          <button
            onClick={exportToPDF}
            disabled={exporting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FileDown size={16} />
            <span>{exporting ? "Generating..." : "Export PDF Report"}</span>
          </button>
        </div>

        <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {typeStats.map(({ type, active, resolved }) => {
            const config = TYPE_CONFIG[type];
            const Icon = config.icon;
            return (
              <motion.div key={type} whileHover={{ scale: 1.02 }} className={`${config.bg} rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center`}>
                <Icon size={20} className="mb-1" />
                <span className="text-xs font-semibold capitalize">{config.label}</span>
                <div className="flex flex-col text-xs mt-1">
                  <span>Active: {active}</span>
                  <span>Resolved: {resolved}</span>
                </div>
              </motion.div>
            );
          })}
          <motion.div whileHover={{ scale: 1.02 }} className="bg-[#1e3a8a] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <TrendingUp size={20} className="mb-1" />
            <span className="text-xs font-semibold">Total</span>
            <p className="text-lg font-bold">{stats.total}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-red-600 rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <AlertTriangleIcon size={20} className="mb-1" />
            <span className="text-xs font-semibold">Active</span>
            <p className="text-lg font-bold">{stats.active}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-green-600 rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <CheckCircle size={20} className="mb-1" />
            <span className="text-xs font-semibold">Resolved</span>
            <p className="text-lg font-bold">{stats.resolved}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-[#1e3a8a] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <Calendar size={20} className="mb-1" />
            <span className="text-xs font-semibold">Rate</span>
            <p className="text-lg font-bold">{stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}%` : "0%"}</p>
          </motion.div>
        </motion.div>

        <div ref={chartRef}>
          <motion.div variants={fadeInUp} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="bg-[#1e3a8a] px-3 py-2 shrink-0">
              <h2 className="text-base sm:text-lg font-semibold text-white text-center">{chartTitle()}</h2>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }} className="w-full h-[400px] p-2">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="8%" barGap="0%" maxBarSize={isSmallScreen ? 25 : 45}>
                    <CartesianGrid stroke="#1e3a8a" strokeDasharray="3 3" />
                    <XAxis dataKey="label" {...getXAxisProps()} />
                    <YAxis allowDecimals={false} tick={{ fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" }} axisLine={{ stroke: "#1e3a8a" }} tickLine={{ stroke: "#1e3a8a" }} width={isSmallScreen ? 30 : 35} />
                    <Tooltip />
                    <Bar dataKey="active" fill="#ef4444" name="Active" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="resolved" fill="#22c55e" name="Resolved" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-blue-800 text-sm">No data available</div>
              )}
            </motion.div>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-5 py-2 text-blue-900 text-sm font-medium shrink-0">
              <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> Active</div>
              <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> Resolved</div>
            </div>
          </motion.div>
        </div>

        <motion.div variants={fadeInUp} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-[#1e3a8a] px-3 sm:px-4 py-2">
            <div className="block sm:hidden">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-semibold text-white whitespace-nowrap">Records</h2>
                  <div className="flex gap-2">
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-2 py-1 text-xs capitalize">
                      <option value="all">All Types</option>
                      <option value="fire">Fire</option>
                      <option value="accident">Accident</option>
                      <option value="flood">Flood</option>
                      <option value="hazard">Hazard</option>
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-2 py-1 text-xs capitalize">
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="responding">Responding</option>
                      <option value="resolved">Resolved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white" size={14} />
                  <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoComplete="off" className="pl-7 pr-2 py-1.5 bg-[#1e3a8a] text-white placeholder-white/70 rounded-lg text-sm w-full" />
                </div>
              </div>
            </div>
            <div className="hidden sm:flex sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Disaster Records</h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white" size={16} />
                  <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoComplete="off" className="pl-8 pr-3 py-1.5 bg-[#1e3a8a] text-white placeholder-white/70 rounded-lg text-sm w-[160px]" />
                </div>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm capitalize">
                  <option value="all">All Types</option>
                  <option value="fire">Fire</option>
                  <option value="accident">Accident</option>
                  <option value="flood">Flood</option>
                  <option value="hazard">Hazard</option>
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm capitalize">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="responding">Responding</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
            <table className="min-w-[640px] sm:min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Type</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Reporter</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Description</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Status</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Reported</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Responded At</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Responded By</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Resolved</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Resolved By</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDisasters.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 sm:px-4 py-6 sm:py-8 text-center text-gray-500 text-sm">No disasters found.</td>
                  </tr>
                ) : (
                  filteredDisasters.map((disaster) => {
                    const config = TYPE_CONFIG[disaster.type];
                    const Icon = config.icon;
                    const reporter = getReporterInfo(disaster);
                    const resolver = getResolverInfo(disaster.resolved_by);
                    const isArchived = disaster.status === "archived";
                    const wasResolvedBeforeArchive = isArchived && disaster.resolved_at;

                    return (
                      <tr key={disaster.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Icon size={14} className={`${config.bg} text-white rounded-full p-0.5`} />
                            <span className="text-xs sm:text-sm text-[#1e3a8a] capitalize">{config.label}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#1e3a8a]">
                          <div>
                            <span className="font-medium">{reporter.name}</span>
                            {reporter.role && <span className="text-gray-500 text-xs ml-1">({reporter.role})</span>}
                            {reporter.phone && <span className="text-gray-500 text-xs ml-1 block sm:inline">{reporter.phone}</span>}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#1e3a8a] max-w-[120px] sm:max-w-xs truncate">{disaster.description || "—"}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <div className="flex gap-1 flex-wrap">
                            {wasResolvedBeforeArchive && (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                Resolved
                              </span>
                            )}
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                                disaster.status === "active"
                                  ? "bg-red-100 text-red-800"
                                  : disaster.status === "responding"
                                  ? "bg-blue-100 text-blue-800"
                                  : disaster.status === "resolved"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {disaster.status === "archived" ? "Archived" : disaster.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">{new Date(disaster.reported_at).toLocaleString()}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">{disaster.responded_at ? new Date(disaster.responded_at).toLocaleString() : "—"}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#1e3a8a]">
                          {(() => { const responder = getResponderInfo(disaster.responded_by); return (
                            <div>
                              <span className="font-medium">{responder.name}</span>
                              {responder.role && responder.name !== "—" && <span className="text-gray-500 text-xs ml-1">({responder.role})</span>}
                            </div>
                          ); })()}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">{disaster.resolved_at ? new Date(disaster.resolved_at).toLocaleString() : "—"}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#1e3a8a]">
                          <div>
                            <span className="font-medium">{resolver.name}</span>
                            {resolver.role && <span className="text-gray-500 text-xs ml-1">({resolver.role})</span>}
                            {resolver.phone && <span className="text-gray-500 text-xs ml-1 block sm:inline">{resolver.phone}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-gray-200 text-xs sm:text-sm text-gray-500 bg-gray-50">
            Showing {filteredDisasters.length} of {timeframeFilteredDisasters.length} records
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}