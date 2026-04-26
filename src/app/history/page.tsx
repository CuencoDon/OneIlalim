// src/app/history/page.tsx
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/app/lib/AuthContext";
import { useData, Disaster } from "@/app/lib/DataContext";
import {
  CalendarDays,
  CalendarRange,
  Calendar,
  Search,
  Flame,
  Car,
  Droplets,
  AlertTriangle,
  TrendingUp,
  AlertTriangle as AlertTriangleIcon,
  CheckCircle,
  FileDown,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, Variants, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

type Timeframe = "hourly" | "weekly" | "monthly";
type ColorMode = "colored" | "grayscale";

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
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export default function HistoryPage() {
  const { user } = useAuth();
  const { disasters } = useData();
  const [timeframe, setTimeframe] = useState<Timeframe>("hourly");
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

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
    let startDate: Date;
    let endDate: Date = now;

    if (timeframe === "hourly") {
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
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    return disasters.filter((dis) => {
      const reported = new Date(dis.reported_at);
      return reported >= startDate && reported < endDate;
    });
  };

  const processChartData = (disasters: Disaster[], timeframe: Timeframe) => {
    const now = new Date();
    const intervals: { start: Date; end: Date; label: string }[] = [];

    if (timeframe === "hourly") {
      const today = getLocalDate(now);
      for (let hour = 0; hour < 24; hour++) {
        const intervalStart = new Date(today);
        intervalStart.setHours(hour, 0, 0, 0);
        const intervalEnd = new Date(today);
        intervalEnd.setHours(hour + 1, 0, 0, 0);
        const label = intervalStart.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
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
    } else {
      const currentYear = now.getFullYear();
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(currentYear, month, 1);
        const monthEnd = new Date(currentYear, month + 1, 1);
        const label = monthStart.toLocaleDateString([], { month: "long" });
        intervals.push({ start: monthStart, end: monthEnd, label });
      }
    }

    return intervals.map((interval) => {
      let active = 0,
        resolved = 0;
      disasters.forEach((dis) => {
        const reportedTime = new Date(dis.reported_at).getTime();
        if (dis.status === "active" && reportedTime >= interval.start.getTime() && reportedTime < interval.end.getTime()) {
          active++;
        }
        if (dis.resolved_at) {
          const resolvedTime = new Date(dis.resolved_at).getTime();
          if (resolvedTime >= interval.start.getTime() && resolvedTime < interval.end.getTime()) {
            resolved++;
          }
        }
      });
      return { label: interval.label, active, resolved };
    });
  };

  const timeframeFilteredDisasters = useMemo(() => {
    return getFilteredByTimeframe(disasters, timeframe);
  }, [disasters, timeframe]);

  const typeStats = useMemo(() => {
    const types = ["fire", "accident", "flood", "hazard"] as const;
    return types.map((type) => {
      const typeDisasters = timeframeFilteredDisasters.filter((d) => d.type === type);
      const active = typeDisasters.filter((d) => d.status === "active").length;
      const resolved = typeDisasters.filter((d) => d.status === "resolved").length;
      return { type, active, resolved };
    });
  }, [timeframeFilteredDisasters]);

  const stats = useMemo(() => {
    const total = timeframeFilteredDisasters.length;
    const active = timeframeFilteredDisasters.filter((d) => d.status === "active").length;
    const resolved = timeframeFilteredDisasters.filter((d) => d.status === "resolved").length;
    return { total, active, resolved };
  }, [timeframeFilteredDisasters]);

  const chartData = useMemo(() => {
    return processChartData(timeframeFilteredDisasters, timeframe);
  }, [timeframeFilteredDisasters, timeframe]);

  const filteredDisasters = useMemo(() => {
    return timeframeFilteredDisasters.filter((disaster) => {
      const matchesSearch =
        searchQuery === "" ||
        disaster.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (disaster.description && disaster.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        disaster.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "all" || disaster.type === filterType;
      const matchesStatus = filterStatus === "all" || disaster.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [timeframeFilteredDisasters, searchQuery, filterType, filterStatus]);

  const getXAxisProps = () => {
    const baseProps = {
      axisLine: { stroke: "#1e3a8a" },
      tickLine: { stroke: "#1e3a8a" },
    };
    if (timeframe === "hourly") {
      return {
        ...baseProps,
        interval: isSmallScreen ? 2 : 0,
        angle: -30,
        textAnchor: "end" as const,
        height: isSmallScreen ? 40 : 50,
        tick: { fontSize: isSmallScreen ? 9 : 11, fill: "#1e3a8a" },
      };
    } else if (timeframe === "weekly") {
      return {
        ...baseProps,
        interval: 0,
        angle: -30,
        textAnchor: "end" as const,
        height: 60,
        tick: { fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" },
      };
    } else {
      return {
        ...baseProps,
        interval: 0,
        angle: -30,
        textAnchor: "end" as const,
        height: 60,
        tick: { fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" },
      };
    }
  };

  const chartTitle = () => {
    if (timeframe === "hourly") return "Hourly Disaster Activity (Today)";
    if (timeframe === "weekly") return "Weekly Disaster Activity (Current Week)";
    return "Monthly Disaster Activity (Year to Date)";
  };

  const timeframeLabel = () => {
    if (timeframe === "hourly") return "Hourly";
    if (timeframe === "weekly") return "Weekly";
    return "Monthly";
  };

  const applyGrayscale = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext("2d");
    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    if (imgData) {
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx?.putImageData(imgData, 0, 0);
    }
    return canvas;
  };

  const exportToPDF = async (mode: ColorMode) => {
    setExporting(true);
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      pdf.setFont("Times", "normal");

      const headerColor = mode === "grayscale" ? [100, 100, 100] : [30, 58, 138];
      pdf.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
      pdf.rect(0, 0, 210, 25, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont("Times", "bold");
      pdf.text("Disaster History Report", 14, 15);
      pdf.setFontSize(10);
      pdf.setFont("Times", "normal");
      pdf.text("Barangay New Ilalim", 14, 21);
      pdf.text(`${timeframeLabel()} | ${new Date().toLocaleString()}`, 196, 15, { align: "right" });
      pdf.setTextColor(0, 0, 0);

      const margin = 14;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const colWidth = (pageWidth - margin * 2 - 3) / 2;
      const boxHeight = 25;
      const gap = 3;
      let y = 32;

      type SummaryBox =
        { label: string; active: number; resolved: number; type: "fire" | "accident" | "flood" | "hazard" } |
        { label: string; value: number | string; colorKey: "blue" | "red" | "green" };

      const summaryBoxes: SummaryBox[] = [
        { label: "Fire", active: typeStats[0].active, resolved: typeStats[0].resolved, type: "fire" },
        { label: "Accident", active: typeStats[1].active, resolved: typeStats[1].resolved, type: "accident" },
        { label: "Flood", active: typeStats[2].active, resolved: typeStats[2].resolved, type: "flood" },
        { label: "Hazard", active: typeStats[3].active, resolved: typeStats[3].resolved, type: "hazard" },
        { label: "Total Disasters", value: stats.total, colorKey: "blue" },
        { label: "Active Disasters", value: stats.active, colorKey: "red" },
        { label: "Resolved Disasters", value: stats.resolved, colorKey: "green" },
        { label: "Resolution Rate", value: stats.total === 0 ? "0%" : `${Math.round((stats.resolved / stats.total) * 100)}%`, colorKey: "blue" },
      ];

      const colorPalette: { [key: string]: [number, number, number] } = {
        fire: [239, 68, 68],
        accident: [249, 115, 22],
        flood: [37, 99, 235],
        hazard: [234, 179, 8],
        blue: [30, 58, 138],
        red: [220, 38, 38],
        green: [34, 197, 94],
        grayscaleBg: [100, 100, 100],
      };

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          const index = row * 2 + col;
          if (index >= summaryBoxes.length) break;

          const box = summaryBoxes[index];
          const x = margin + col * (colWidth + gap);
          const boxY = y + row * (boxHeight + gap);

          let fillColor: [number, number, number];
          if (mode === "grayscale") {
            fillColor = colorPalette.grayscaleBg;
          } else if ("type" in box) {
            fillColor = colorPalette[box.type];
          } else {
            fillColor = colorPalette[box.colorKey];
          }

          pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
          pdf.setDrawColor(200, 200, 200);
          pdf.roundedRect(x, boxY, colWidth, boxHeight, 2, 2, "FD");

          pdf.setTextColor(255, 255, 255);
          pdf.setFont("Times", "bold");
          pdf.setFontSize(14);
          pdf.text(box.label, x + 3, boxY + 8);

          pdf.setFont("Times", "normal");
          pdf.setFontSize(10);
          if ("active" in box) {
            pdf.text(`Active: ${box.active}`, x + 3, boxY + 16);
            pdf.text(`Resolved: ${box.resolved}`, x + 3, boxY + 21);
          } else {
            pdf.text(`${box.value}`, x + 3, boxY + 16);
          }
        }
      }

      y = y + 4 * (boxHeight + gap) + 5;

      // Divider after summary containers
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;

      const chartElement = chartRef.current?.querySelector(".recharts-wrapper");
      if (!chartElement) {
        alert("Could not capture chart.");
        setExporting(false);
        return;
      }
      let chartCanvas = await html2canvas(chartElement as HTMLElement, {
        scale: 2,
        backgroundColor: "#ffffff",
      } as any);
      if (mode === "grayscale") {
        chartCanvas = applyGrayscale(chartCanvas);
      }
      const chartImgData = chartCanvas.toDataURL("image/png");

      pdf.setFont("Times", "bold");
      pdf.setFontSize(12);
      pdf.text("Disaster Trends", margin, y);
      y += 5;

      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (chartCanvas.height * imgWidth) / chartCanvas.width;
      if (y + imgHeight > pdf.internal.pageSize.getHeight() - 20) {
        pdf.addPage();
        y = 20;
        pdf.text("Disaster Trends", margin, y);
        y += 5;
      }
      pdf.addImage(chartImgData, "PNG", margin, y, imgWidth, imgHeight);
      y += imgHeight + 3;

      // Chart legend
      const activeColor = mode === "grayscale" ? [100, 100, 100] : [239, 68, 68];
      const resolvedColor = mode === "grayscale" ? [100, 100, 100] : [34, 197, 94];

      pdf.setFillColor(activeColor[0], activeColor[1], activeColor[2]);
      pdf.rect(margin, y, 4, 4, "F");
      pdf.setFont("Times", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text("Active", margin + 5, y + 3.5);

      pdf.setFillColor(resolvedColor[0], resolvedColor[1], resolvedColor[2]);
      pdf.rect(margin + 30, y, 4, 4, "F");
      pdf.text("Resolved", margin + 35, y + 3.5);
      y += 6;

      // Divider after chart and legend
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;

      pdf.setFont("Times", "bold");
      pdf.setFontSize(12);
      pdf.text("Detailed Disaster Records", margin, y);
      y += 5;

      const tableData = filteredDisasters.map((disaster) => [
        disaster.type.charAt(0).toUpperCase() + disaster.type.slice(1),
        disaster.full_name,
        disaster.description || "—",
        disaster.status === "active" ? "Active" : "Resolved",
        new Date(disaster.reported_at).toLocaleString(),
        disaster.resolved_at ? new Date(disaster.resolved_at).toLocaleString() : "—",
      ]);

      const remainingHeight = pdf.internal.pageSize.getHeight() - y;
      if (remainingHeight < 30) {
        pdf.addPage();
        y = 20;
        pdf.setFont("Times", "bold");
        pdf.setFontSize(12);
        pdf.text("Detailed Disaster Records", margin, y);
        y += 5;
      }

      pdf.setFont("Times", "normal");
      autoTable(pdf, {
        startY: y,
        head: [["Type", "Reporter", "Description", "Status", "Reported", "Resolved"]],
        body: tableData,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          textColor: mode === "grayscale" ? [0, 0, 0] : undefined,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          font: "Times",
          fontStyle: "normal",
        },
        headStyles: {
          fillColor: mode === "grayscale" ? [100, 100, 100] : [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: mode === "grayscale" ? [240, 240, 240] : [245, 245, 245],
        },
        margin: { left: margin, right: margin },
      });

      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont("Times", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pdf.internal.pageSize.getHeight() - 10, { align: "right" });
        pdf.text("Barangay Disaster Monitoring System", margin, pdf.internal.pageSize.getHeight() - 10);
      }

      pdf.save(`disaster-report-${timeframe}-${new Date().toISOString().slice(0, 19)}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setExporting(false);
      setShowExportModal(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="h-auto xl:h-full xl:min-h-0 relative p-4 [scrollbar-gutter:stable]"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            {["hourly", "weekly", "monthly"].map((t) => (
              <motion.button
                key={t}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setTimeframe(t as Timeframe)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeframe === t
                    ? "bg-[#1e3a8a] text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t === "hourly" && <CalendarDays size={16} />}
                {t === "weekly" && <CalendarRange size={16} />}
                {t === "monthly" && <Calendar size={16} />}
                <span className="capitalize">{t}</span>
              </motion.button>
            ))}
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={exporting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FileDown size={16} />
            <span>{exporting ? "Generating..." : "Export PDF"}</span>
          </button>
        </div>

        <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {typeStats.map(({ type, active, resolved }) => {
            const config = TYPE_CONFIG[type];
            const Icon = config.icon;
            return (
              <motion.div
                key={type}
                whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                className={`${config.bg} rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center`}
              >
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
            <span className="text-xs font-semibold">Total Disasters</span>
            <p className="text-lg font-bold">{stats.total}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-red-600 rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <AlertTriangleIcon size={20} className="mb-1" />
            <span className="text-xs font-semibold">Total Active Disasters</span>
            <p className="text-lg font-bold">{stats.active}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-green-600 rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <CheckCircle size={20} className="mb-1" />
            <span className="text-xs font-semibold">Total Resolved Disasters</span>
            <p className="text-lg font-bold">{stats.resolved}</p>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="bg-[#1e3a8a] rounded-xl p-2 shadow-sm flex flex-col items-center justify-center text-white text-center">
            <Calendar size={20} className="mb-1" />
            <span className="text-xs font-semibold">Resolution Rate</span>
            <p className="text-lg font-bold">
              {stats.total === 0 ? "0%" : `${Math.round((stats.resolved / stats.total) * 100)}%`}
            </p>
          </motion.div>
        </motion.div>

        <div ref={chartRef}>
          <motion.div variants={fadeInUp} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="bg-[#1e3a8a] px-3 py-2 shrink-0">
              <h2 className="text-base sm:text-lg font-semibold text-white text-center">
                {chartTitle()}
              </h2>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-full h-[400px] p-2"
            >
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    barCategoryGap="8%"
                    barGap="0%"
                    maxBarSize={isSmallScreen ? 25 : 45}
                  >
                    <CartesianGrid stroke="#1e3a8a" strokeDasharray="3 3" />
                    <XAxis dataKey="label" {...getXAxisProps()} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: isSmallScreen ? 10 : 12, fill: "#1e3a8a" }}
                      axisLine={{ stroke: "#1e3a8a" }}
                      tickLine={{ stroke: "#1e3a8a" }}
                      width={isSmallScreen ? 30 : 35}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        return (
                          <div className="bg-white p-2 rounded shadow-md border border-[#1e3a8a] text-sm">
                            <p className="font-semibold text-[#1e3a8a] mb-1">{label}</p>
                            {payload.map((entry) => (
                              <div key={entry.name} style={{ color: entry.color }} className="text-sm">
                                {entry.name}: {entry.value}
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="active" fill="#ef4444" name="Active" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="resolved" fill="#22c55e" name="Resolved" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-blue-800 text-sm">
                  No data available for this timeframe
                </div>
              )}
            </motion.div>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-5 py-2 text-blue-900 text-sm font-medium shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                <span>Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                <span>Resolved</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div variants={fadeInUp} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-[#1e3a8a] px-3 sm:px-4 py-2">
            <div className="block sm:hidden">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-semibold text-white whitespace-nowrap">Disaster Records</h2>
                  <div className="flex gap-2">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-white/50 capitalize"
                    >
                      <option value="all">All Types</option>
                      <option value="fire">Fire</option>
                      <option value="accident">Accident</option>
                      <option value="flood">Flood</option>
                      <option value="hazard">Hazard</option>
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-white/50 capitalize"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white" size={14} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    className="pl-7 pr-2 py-1.5 bg-[#1e3a8a] text-white placeholder-white/70 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-white/50 w-full"
                  />
                </div>
              </div>
            </div>
            <div className="hidden sm:flex sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Disaster Records</h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white" size={16} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    className="pl-8 pr-3 py-1.5 bg-[#1e3a8a] text-white placeholder-white/70 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-white/50 w-[160px]"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 capitalize"
                >
                  <option value="all">All Types</option>
                  <option value="fire">Fire</option>
                  <option value="accident">Accident</option>
                  <option value="flood">Flood</option>
                  <option value="hazard">Hazard</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-[#1e3a8a] text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-white/50 capitalize"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
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
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-[#1e3a8a] uppercase tracking-wider">Resolved</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDisasters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 sm:px-4 py-6 sm:py-8 text-center text-gray-500 text-sm">
                      No disasters found.
                    </td>
                  </tr>
                ) : (
                  filteredDisasters.map((disaster) => {
                    const config = TYPE_CONFIG[disaster.type];
                    const Icon = config.icon;
                    return (
                      <tr key={disaster.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Icon size={14} className={`${config.bg} text-white rounded-full p-0.5`} />
                            <span className="text-xs sm:text-sm text-[#1e3a8a] capitalize">{config.label}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">{disaster.full_name}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#1e3a8a] max-w-[120px] sm:max-w-xs truncate">{disaster.description || "—"}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                              disaster.status === "active"
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {disaster.status}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">
                          {new Date(disaster.reported_at).toLocaleString()}
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-[#1e3a8a]">
                          {disaster.resolved_at ? new Date(disaster.resolved_at).toLocaleString() : "—"}
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

      <AnimatePresence>
        {showExportModal && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/10 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowExportModal(false)}
          >
            <motion.div
              className="relative bg-white rounded-xl p-4 shadow-xl max-w-xs w-full"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowExportModal(false)}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
              <h2 className="text-base font-semibold text-center text-[#1e3a8a] mb-3">Export PDF</h2>
              <p className="text-xs text-gray-600 text-center mb-3">Choose color mode:</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={async () => {
                    setShowExportModal(false);
                    await exportToPDF("colored");
                  }}
                  className="px-3 py-1.5 bg-[#1e3a8a] text-white rounded-md text-xs font-medium hover:bg-blue-900 transition-colors"
                >
                  Colored
                </button>
                <button
                  onClick={async () => {
                    setShowExportModal(false);
                    await exportToPDF("grayscale");
                  }}
                  className="px-3 py-1.5 bg-gray-600 text-white rounded-md text-xs font-medium hover:bg-gray-700 transition-colors"
                >
                  Black & White
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}