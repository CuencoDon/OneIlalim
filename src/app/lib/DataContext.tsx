"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

export type Disaster = {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  type: "fire" | "accident" | "flood" | "hazard";
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

export interface InventoryCheckout {
  id: string;
  inventory_id: string;
  checked_out_by: string | null;
  responsible_person_name: string;
  quantity_checked_out: number;
  checkout_date: string;
  expected_return_date: string;
  actual_return_date: string | null;
  status: "active" | "returned";
  created_at: string;
  checked_out_by_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface InventoryItem {
  id: string;
  item_name: string;
  quantity: number;
  in_use: number;
  unit: string;
  is_consumable: boolean;
  description?: string | null;
  update_description?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_by_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  updated_by_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  checkouts?: InventoryCheckout[];
  last_return_date?: string | null;
}

type DataContextType = {
  disasters: Disaster[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  inventoryItems: InventoryItem[];
  inventoryLoading: boolean;
  inventoryError: string | null;
  fetchInventory: () => Promise<void>;
  addInventoryItem: (item: Partial<InventoryItem>) => Promise<void>;
  updateInventoryItem: (id: string, updates: { quantity: number; update_description: string }) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  checkoutItem: (inventoryId: string, quantity: number, responsiblePerson: string, expectedReturnDate: string) => Promise<void>;
  returnCheckout: (checkoutId: string) => Promise<void>;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, tabVisible } = useAuth();

  const [disasters, setDisasters] = useState<Disaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDisasters = useCallback(async () => {
    if (!user) {
      setDisasters([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("disasters")
        .select("*")
        .order("reported_at", { ascending: false });
      if (error) throw error;
      setDisasters(data || []);
    } catch (err) {
      console.error("Failed to fetch disasters:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch disasters");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const refetch = useCallback(() => { fetchDisasters(); }, [fetchDisasters]);

  useEffect(() => { fetchDisasters(); }, [fetchDisasters]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("disasters-central")
      .on("postgres_changes", { event: "*", schema: "public", table: "disasters" }, () => fetchDisasters())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchDisasters]);

  useEffect(() => { if (tabVisible) refetch(); }, [tabVisible, refetch]);

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    if (!user) {
      setInventoryItems([]);
      setInventoryLoading(false);
      return;
    }
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from("inventory")
        .select("*, created_by_profile:profiles!created_by(first_name, last_name), updated_by_profile:profiles!updated_by(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (itemsError) throw itemsError;
      const { data: activeCheckouts, error: activeError } = await supabase
        .from("inventory_checkouts")
        .select("*, checked_out_by_profile:profiles!checked_out_by(first_name, last_name)")
        .eq("status", "active");
      if (activeError) throw activeError;
      const { data: returnedCheckouts, error: returnedError } = await supabase
        .from("inventory_checkouts")
        .select("inventory_id, actual_return_date")
        .eq("status", "returned")
        .order("actual_return_date", { ascending: false });
      if (returnedError) throw returnedError;
      const lastReturnMap: Record<string, string> = {};
      (returnedCheckouts || []).forEach((c: any) => {
        if (!lastReturnMap[c.inventory_id] || c.actual_return_date > lastReturnMap[c.inventory_id]) {
          lastReturnMap[c.inventory_id] = c.actual_return_date;
        }
      });
      const items = (itemsData || []).map((item: any) => ({
        ...item,
        checkouts: (activeCheckouts || []).filter((c: any) => c.inventory_id === item.id),
        in_use: item.in_use ?? 0,
        last_return_date: lastReturnMap[item.id] || null,
      }));
      setInventoryItems(items);
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
      setInventoryError(err instanceof Error ? err.message : "Failed to fetch inventory");
    } finally {
      setInventoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchInventory();
    const channel = supabase
      .channel("inventory-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => fetchInventory())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_checkouts" }, () => fetchInventory())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchInventory]);

  const addInventoryItem = useCallback(async (item: Partial<InventoryItem>) => {
    const newItem = { ...item, created_by: user?.id };
    const { error } = await supabase.from("inventory").insert([newItem]);
    if (error) throw error;
  }, [user]);

  const updateInventoryItem = useCallback(async (id: string, updates: { quantity: number; update_description: string }) => {
    const { error } = await supabase
      .from("inventory")
      .update({ quantity: updates.quantity, update_description: updates.update_description, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }, [user]);

  const deleteInventoryItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) throw error;
  }, []);

  const checkoutItem = useCallback(async (inventoryId: string, quantity: number, responsiblePerson: string, expectedReturnDate: string) => {
    const item = inventoryItems.find(i => i.id === inventoryId);
    if (!item) throw new Error("Item not found");
    const available = item.quantity - (item.in_use || 0);
    if (quantity > available) throw new Error("Not enough available quantity");
    const { error } = await supabase.from("inventory_checkouts").insert([{
      inventory_id: inventoryId, checked_out_by: user?.id, responsible_person_name: responsiblePerson,
      quantity_checked_out: quantity, expected_return_date: expectedReturnDate, status: 'active',
    }]);
    if (error) throw error;
  }, [user, inventoryItems]);

  const returnCheckout = useCallback(async (checkoutId: string) => {
    const { error } = await supabase
      .from("inventory_checkouts")
      .update({ status: 'returned', actual_return_date: new Date().toISOString() })
      .eq("id", checkoutId);
    if (error) throw error;
  }, []);

  return (
    <DataContext.Provider value={{
      disasters, isLoading, error, refetch,
      inventoryItems, inventoryLoading, inventoryError, fetchInventory,
      addInventoryItem, updateInventoryItem, deleteInventoryItem,
      checkoutItem, returnCheckout,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error("useData must be used within DataProvider");
  return context;
}