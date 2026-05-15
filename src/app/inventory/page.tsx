"use client";

import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/AuthContext";
import { useData, InventoryItem, InventoryCheckout } from "@/app/lib/DataContext";
import { Package, Box, Plus, Search, Trash2, Edit3, LogOut, Calendar, RotateCcw, User, Clock, FileText, Download } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const UNITS = ["dozen", "bundle", "pack", "box", "unit"];

const MODAL_BACKDROP_CLASS = "fixed inset-0 bg-white/10 backdrop-blur-sm";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const InventoryCard = memo(({
  title, items, isConsumable, icon: Icon, search, setSearch,
  onAdd, onUpdate, onDelete, onCheckout, onReturn,
}: {
  title: string;
  items: InventoryItem[];
  isConsumable: boolean;
  icon: React.ElementType;
  search: string;
  setSearch: (v: string) => void;
  onAdd: () => void;
  onUpdate: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onCheckout: (item: InventoryItem) => void;
  onReturn: (checkoutId: string) => void;
}) => (
  <motion.div variants={fadeInUp} className="flex flex-col h-full rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
    <div className="bg-[#1e3a8a] px-3 sm:px-4 py-2 shrink-0">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-white" />
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white" size={16} />
            <input
              type="text" placeholder="Search..." value={search}
              onChange={(e) => setSearch(e.target.value)} autoComplete="off"
              className="pl-8 pr-3 py-1.5 bg-[#1e3a8a] text-white placeholder-white/70 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-white/50 w-[160px]"
            />
          </div>
          <button onClick={onAdd} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="min-w-[640px] sm:min-w-full divide-y divide-gray-200">
        <div className="bg-gray-50 grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-[#1e3a8a] uppercase tracking-wider sticky top-0">
          {isConsumable ? (
            <>
              <div className="col-span-7">Item</div>
              <div className="col-span-3">Quantity</div>
              <div className="col-span-2"></div>
            </>
          ) : (
            <>
              <div className="col-span-4">Item</div>
              <div className="col-span-2">Total</div>
              <div className="col-span-2">In Use</div>
              <div className="col-span-2">Available</div>
              <div className="col-span-2"></div>
            </>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Package size={44} className="mb-3 text-gray-300" />
            <p className="text-sm">No {title.toLowerCase()} items.</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-50 border-b border-gray-100">
              {isConsumable ? (
                <>
                  <div className="col-span-7">
                    <p className="text-base font-medium text-[#1e3a8a]">{item.item_name}</p>
                    {item.description && <p className="text-xs text-gray-500 italic">{item.description}</p>}
                    {item.update_description && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                          <FileText size={10} /> Update: {item.update_description}
                        </span>
                        {item.updated_by_profile && (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                            <User size={10} /> {[item.updated_by_profile.first_name, item.updated_by_profile.last_name].filter(Boolean).join(" ") || "Unknown"}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                        <Clock size={10} /> {formatDate(item.created_at)}
                      </span>
                      {item.created_by_profile && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                          <User size={10} /> {[item.created_by_profile.first_name, item.created_by_profile.last_name].filter(Boolean).join(" ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center">
                    <span className="font-bold text-base text-gray-700 mr-1">{item.quantity}</span>
                    <span className="text-[10px] text-gray-500">{item.unit}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button onClick={() => onUpdate(item)} className="p-1 text-[#1e3a8a] hover:text-[#162d6e]" title="Update"><Edit3 size={16} /></button>
                    <button onClick={() => onDelete(item)} className="p-1 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-4">
                    <p className="text-base font-medium text-[#1e3a8a]">{item.item_name}</p>
                    {item.description && <p className="text-xs text-gray-500 italic">{item.description}</p>}
                    {item.update_description && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                          <FileText size={10} /> Update: {item.update_description}
                        </span>
                        {item.updated_by_profile && (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                            <User size={10} /> {[item.updated_by_profile.first_name, item.updated_by_profile.last_name].filter(Boolean).join(" ") || "Unknown"}
                          </span>
                        )}
                      </div>
                    )}
                    {item.checkouts && item.checkouts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {item.checkouts.map((c: InventoryCheckout) => (
                          <div key={c.id} className="flex items-center justify-between bg-blue-50 rounded-md px-2 py-1">
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="font-semibold text-[#1e3a8a]">{c.quantity_checked_out}</span>
                              <span className="text-gray-600">by</span>
                              <span className="font-medium text-gray-800">{c.responsible_person_name}</span>
                              <span className="text-gray-400 mx-1">|</span>
                              <Calendar size={12} className="text-gray-500" />
                              <span className="text-gray-500 text-[9px]">{formatDate(c.expected_return_date)}</span>
                            </div>
                            <button
                              onClick={() => onReturn(c.id)}
                              className="flex items-center justify-center bg-[#1e3a8a] hover:bg-[#162d6e] text-white rounded-md p-1 transition-colors"
                              title="Return"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                        <Clock size={10} /> {formatDate(item.created_at)}
                      </span>
                      {item.created_by_profile && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-[#1e3a8a] rounded-full px-2 py-0.5 text-[10px] font-medium">
                          <User size={10} /> {[item.created_by_profile.first_name, item.created_by_profile.last_name].filter(Boolean).join(" ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="font-bold text-base text-gray-700 mr-1">{item.quantity}</span>
                    <span className="text-[10px] text-gray-500">{item.unit}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="font-bold text-base text-gray-700 mr-1">{item.in_use}</span>
                    <span className="text-[10px] text-gray-500">{item.unit}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="font-bold text-base text-gray-700 mr-1">{item.quantity - item.in_use}</span>
                    <span className="text-[10px] text-gray-500">{item.unit}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button onClick={() => onCheckout(item)} className="p-1 text-green-600 hover:text-green-800" title="Checkout"><LogOut size={16} /></button>
                    <button onClick={() => onUpdate(item)} className="p-1 text-[#1e3a8a] hover:text-[#162d6e]" title="Update"><Edit3 size={16} /></button>
                    <button onClick={() => onDelete(item)} className="p-1 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500 bg-gray-50 shrink-0">
      Showing {items.length} records
    </div>
  </motion.div>
));

InventoryCard.displayName = "InventoryCard";

export default function InventoryPage() {
  const { userRole, isLoading, user } = useAuth();
  const router = useRouter();
  const {
    inventoryItems, fetchInventory,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
    checkoutItem, returnCheckout,
  } = useData();

  const [searchConsumable, setSearchConsumable] = useState("");
  const [searchNonConsumable, setSearchNonConsumable] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [modalType, setModalType] = useState<"consumable" | "nonConsumable">("consumable");
  const [form, setForm] = useState({ name: "", qty: 1, unit: UNITS[0], description: "" });
  const [updateForm, setUpdateForm] = useState({ quantity: 0, update_description: "" });
  const [checkoutForm, setCheckoutForm] = useState({ quantity: 1, responsiblePerson: "", expectedReturnDate: "" });
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (user && userRole !== undefined && userRole !== "official") {
      router.push("/");
    } else if (!user) {
      router.push("/");
    }
  }, [isLoading, user, userRole, router]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const openUpdateModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setUpdateForm({ quantity: item.quantity, update_description: "" });
    setUpdateModalOpen(true);
  };
  const openCheckoutModal = (item: InventoryItem) => {
    setSelectedItem(item);
    const available = item.quantity - (item.in_use || 0);
    setCheckoutForm({ quantity: Math.min(available, 1), responsiblePerson: "", expectedReturnDate: "" });
    setCheckoutModalOpen(true);
  };
  const confirmDelete = (item: InventoryItem) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(itemToDelete.id);
    } catch {
      alert("Failed to delete item.");
    }
    setDeleting(false);
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.qty <= 0) {
      alert("Quantity must be at least 1.");
      return;
    }
    setAdding(true);
    const newItem: any = {
      item_name: form.name.trim(),
      quantity: form.qty,
      unit: form.unit,
      description: form.description.trim(),
      is_consumable: modalType === "consumable",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (modalType === "nonConsumable") {
      newItem.in_use = 0;
    }
    try {
      await addInventoryItem(newItem);
      setAddModalOpen(false);
      setForm({ name: "", qty: 1, unit: UNITS[0], description: "" });
    } catch {
      alert("Failed to add item.");
    }
    setAdding(false);
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (updateForm.quantity < 0) {
      alert("Quantity cannot be negative.");
      return;
    }
    const oldQty = selectedItem.quantity;
    const diff = updateForm.quantity - oldQty;
    const changeText = diff > 0 ? `Added ${diff}` : diff < 0 ? `Transferred ${Math.abs(diff)}` : "No quantity change";
    const finalDescription = updateForm.update_description.trim()
      ? `${updateForm.update_description.trim()} (${changeText})`
      : changeText;

    setUpdating(true);
    try {
      await updateInventoryItem(selectedItem.id, {
        quantity: updateForm.quantity,
        update_description: finalDescription,
      });
      setUpdateModalOpen(false);
      setSelectedItem(null);
    } catch {
      alert("Failed to update item.");
    }
    setUpdating(false);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const available = selectedItem.quantity - (selectedItem.in_use || 0);
    if (checkoutForm.quantity <= 0 || checkoutForm.quantity > available) {
      alert(`Invalid quantity. Available: ${available}`);
      return;
    }
    if (!checkoutForm.responsiblePerson.trim() || !checkoutForm.expectedReturnDate) {
      alert("Please fill in all fields.");
      return;
    }
    setCheckingOut(true);
    try {
      await checkoutItem(selectedItem.id, checkoutForm.quantity, checkoutForm.responsiblePerson.trim(), checkoutForm.expectedReturnDate);
      setCheckoutModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Checkout failed.");
    }
    setCheckingOut(false);
  };

  const handleReturn = async (checkoutId: string) => {
    try {
      await returnCheckout(checkoutId);
    } catch {
      alert("Return failed.");
    }
  };

  const consumables = useMemo(() => inventoryItems.filter(i => i.is_consumable && i.item_name.toLowerCase().includes(searchConsumable.toLowerCase())).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [inventoryItems, searchConsumable]);
  const nonConsumables = useMemo(() => inventoryItems.filter(i => !i.is_consumable && i.item_name.toLowerCase().includes(searchNonConsumable.toLowerCase())).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [inventoryItems, searchNonConsumable]);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFont("times", "normal");

    const headerFooter = (data: any) => {
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, pageWidth, 20, 'F');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("One Ilalim - Smart Disaster Monitoring System", pageWidth / 2, 12, { align: "center" });
      doc.setFontSize(8);
      doc.text("Inventory Report", pageWidth / 2, 17, { align: "center" });

      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("One Ilalim", 14, pageHeight - 10);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 14, pageHeight - 10, { align: "right" });
    };

    if (consumables.length > 0) {
      doc.setFontSize(13);
      doc.setTextColor(30, 58, 138);
      doc.text("Consumables", 14, 30);

      const consumableRows = consumables.map(item => [
        item.item_name,
        item.description || "-",
        `${item.quantity} ${item.unit}`,
        item.update_description || "-",
        item.created_by_profile
          ? `${item.created_by_profile.first_name || ""} ${item.created_by_profile.last_name || ""}`.trim() || "-"
          : "-",
        formatDate(item.created_at),
      ]);

      autoTable(doc, {
        startY: 35,
        head: [["Item", "Description", "Quantity", "Last Update", "Added By", "Created"]],
        body: consumableRows,
        styles: { font: "times", fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, font: "times" },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 35 },
          2: { cellWidth: 20 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
        },
        didDrawPage: (data: any) => headerFooter(data),
      });
    }

    if (nonConsumables.length > 0) {
      const startY = consumables.length > 0 ? (doc as any).lastAutoTable.finalY + 10 : 30;

      doc.setFontSize(13);
      doc.setTextColor(30, 58, 138);
      doc.text("Non-Consumables", 14, startY);

      const nonConsumableRows = nonConsumables.map(item => {
        const checkoutSummary = item.checkouts
          ?.map(c => `${c.quantity_checked_out} by ${c.responsible_person_name} (return: ${formatDate(c.expected_return_date)})`)
          .join("; ") || "-";
        return [
          item.item_name,
          item.description || "-",
          `${item.quantity} ${item.unit}`,
          `${item.in_use} ${item.unit}`,
          `${item.quantity - item.in_use} ${item.unit}`,
          item.created_by_profile
            ? `${item.created_by_profile.first_name || ""} ${item.created_by_profile.last_name || ""}`.trim() || "-"
            : "-",
          checkoutSummary,
          formatDate(item.created_at),
        ];
      });

      autoTable(doc, {
        startY: startY + 5,
        head: [["Item", "Description", "Total", "In Use", "Available", "Added By", "Active Checkouts", "Created"]],
        body: nonConsumableRows,
        styles: { font: "times", fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, font: "times" },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28 },
          2: { cellWidth: 14 },
          3: { cellWidth: 14 },
          4: { cellWidth: 14 },
          5: { cellWidth: 22 },
          6: { cellWidth: 40 },
          7: { cellWidth: 22 },
        },
        didDrawPage: (data: any) => headerFooter(data),
      });
    }

    if (consumables.length === 0 && nonConsumables.length === 0) {
      doc.setFontSize(12);
      doc.text("No items found.", 14, 30);
    }

    doc.save(`inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [consumables, nonConsumables]);

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="h-auto xl:h-full xl:min-h-0 relative p-5">
      <div className="flex justify-center mb-3">
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} /> Export PDF Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:h-full xl:min-h-0 xl:grid-cols-2 xl:items-stretch">
        <InventoryCard
          title="Consumable" items={consumables} isConsumable={true} icon={Package}
          search={searchConsumable} setSearch={setSearchConsumable}
          onAdd={() => { setModalType("consumable"); setAddModalOpen(true); }}
          onUpdate={openUpdateModal} onDelete={confirmDelete}
          onCheckout={() => { }} onReturn={() => { }}
        />
        <InventoryCard
          title="Non-Consumable" items={nonConsumables} isConsumable={false} icon={Box}
          search={searchNonConsumable} setSearch={setSearchNonConsumable}
          onAdd={() => { setModalType("nonConsumable"); setAddModalOpen(true); }}
          onUpdate={openUpdateModal} onDelete={confirmDelete}
          onCheckout={openCheckoutModal} onReturn={handleReturn}
        />
      </div>

      <AnimatePresence>
        {addModalOpen && (
          <motion.div className={`${MODAL_BACKDROP_CLASS} z-[9999] flex items-center justify-center p-4 pt-[72px]`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAddModalOpen(false)}>
            <motion.div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 text-center"><h2 className="text-xl font-semibold tracking-tight text-blue-900">Add {modalType === "consumable" ? "Consumable" : "Non-Consumable"}</h2></div>
              <form onSubmit={handleAddItem} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Item Name</label>
                  <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rice" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Quantity</label>
                    <input type="number" required min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: parseInt(e.target.value) || 1 })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Unit</label>
                    <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] bg-white">
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Description (Source, Notes)</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g., Donation from Red Cross" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div className="pt-3 flex gap-2">
                  <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={adding || form.qty <= 0} className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded-md text-white font-medium disabled:opacity-50">{adding ? "Adding..." : "Add Item"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {updateModalOpen && selectedItem && (
          <motion.div className={`${MODAL_BACKDROP_CLASS} z-[9999] flex items-center justify-center p-4 pt-[72px]`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setUpdateModalOpen(false)}>
            <motion.div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 text-center"><h2 className="text-xl font-semibold tracking-tight text-blue-900">Update Item</h2><p className="text-sm text-gray-500">{selectedItem.item_name}</p></div>
              <form onSubmit={handleUpdateItem} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Quantity</label>
                  <input type="number" required min="0" value={updateForm.quantity} onChange={(e) => setUpdateForm({ ...updateForm, quantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Update Description (Reason for Change)</label>
                  <input type="text" value={updateForm.update_description} onChange={e => setUpdateForm({ ...updateForm, update_description: e.target.value })} placeholder="e.g., Transferred to Evacuation Center A" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div className="pt-3 flex gap-2">
                  <button type="button" onClick={() => setUpdateModalOpen(false)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={updating} className="flex-1 px-3 py-1.5 text-sm bg-[#1e3a8a] hover:bg-[#162d6e] rounded-md text-white font-medium disabled:opacity-50">{updating ? "Updating..." : "Update"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkoutModalOpen && selectedItem && (
          <motion.div className={`${MODAL_BACKDROP_CLASS} z-[9999] flex items-center justify-center p-4 pt-[72px]`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCheckoutModalOpen(false)}>
            <motion.div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 text-center"><h2 className="text-xl font-semibold tracking-tight text-blue-900">Checkout Item</h2><p className="text-sm text-gray-500">{selectedItem.item_name} (Available: {selectedItem.quantity - selectedItem.in_use})</p></div>
              <form onSubmit={handleCheckout} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Quantity to Check Out</label>
                  <input type="number" required min="1" max={selectedItem.quantity - selectedItem.in_use} value={checkoutForm.quantity} onChange={e => setCheckoutForm({ ...checkoutForm, quantity: parseInt(e.target.value) || 1 })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Responsible Person Name</label>
                  <input type="text" required value={checkoutForm.responsiblePerson} onChange={e => setCheckoutForm({ ...checkoutForm, responsiblePerson: e.target.value })} placeholder="Full name" className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Expected Return Date</label>
                  <input type="datetime-local" required value={checkoutForm.expectedReturnDate} onChange={e => setCheckoutForm({ ...checkoutForm, expectedReturnDate: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]" />
                </div>
                <div className="pt-3 flex gap-2">
                  <button type="button" onClick={() => setCheckoutModalOpen(false)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md">Cancel</button>
                  <button type="submit" disabled={checkingOut} className="flex-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded-md text-white font-medium disabled:opacity-50">{checkingOut ? "Checking out..." : "Checkout"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteModalOpen && (
          <motion.div className={`${MODAL_BACKDROP_CLASS} z-[9999] flex items-center justify-center p-4 pt-[72px]`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteModalOpen(false)}>
            <motion.div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 text-center"><h2 className="text-xl font-semibold text-blue-900">Delete Item</h2></div>
              <div className="text-center"><p className="text-sm">Are you sure you want to delete <span className="font-semibold">{itemToDelete?.item_name}</span>?<br />This action cannot be undone.</p></div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setDeleteModalOpen(false)} className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded-md text-white font-medium disabled:opacity-50">{deleting ? "Deleting..." : "Delete"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}