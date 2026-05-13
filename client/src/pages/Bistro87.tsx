import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  UtensilsCrossed, Plus, Edit, Trash2, ShoppingCart, CheckCircle,
  TrendingUp, Clock, ChefHat, BarChart3, X, RefreshCw
} from "lucide-react";
import { useVoiceContext } from "@/contexts/VoiceContext";

const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "event_catering"] as const;
const ORDER_STATUSES = ["pending", "preparing", "ready", "served", "cancelled"] as const;
const PAYMENT_METHODS = ["cash", "card", "online", "account"] as const;
const MENU_CATEGORIES = ["Starters", "Main", "Sides", "Desserts", "Drinks", "Specials"];

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300",
  preparing: "bg-blue-500/20 text-blue-300",
  ready: "bg-green-500/20 text-green-300",
  served: "bg-slate-500/20 text-slate-300",
  cancelled: "bg-red-500/20 text-red-300",
};

const statusNext: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "served",
};

export default function Bistro87() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("orders");
  const [orderFilter, setOrderFilter] = useState("pending");

  // --- Menu state ---
  const [menuDialog, setMenuDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [menuForm, setMenuForm] = useState({
    name: "", category: "Main", description: "", price: "",
    costPrice: "", isAvailable: true, isHalal: true, allergens: "", sortOrder: 0,
  });

  // --- New Order state ---
  const [orderDialog, setOrderDialog] = useState(false);
  const [orderForm, setOrderForm] = useState({
    tableNumber: "", customerName: "", orderType: "dine_in" as typeof ORDER_TYPES[number], notes: "",
  });
  const [cart, setCart] = useState<Array<{ menuItemId: number; itemName: string; quantity: number; unitPrice: number; notes: string }>>([]);

  // --- Queries ---
  const { setEntityContext } = useVoiceContext();
  useEffect(() => {
    setEntityContext(`Viewing Bistro 87 — ${activeTab} tab`);
    return () => setEntityContext(null);
  }, [setEntityContext, activeTab]);

  const { data: menuItems = [], refetch: refetchMenu } = trpc.bistro.listMenuItems.useQuery({});
  const { data: orders = [], refetch: refetchOrders } = trpc.bistro.listOrders.useQuery({ status: orderFilter === "all" ? undefined : orderFilter, limit: 100 });
  const { data: stats } = trpc.bistro.getRevenueStats.useQuery({ days: 30 });

  // --- Mutations ---
  const addMenuItem = trpc.bistro.addMenuItem.useMutation({ onSuccess: () => { refetchMenu(); setMenuDialog(false); toast("Menu item added"); } });
  const updateMenuItem = trpc.bistro.updateMenuItem.useMutation({ onSuccess: () => { refetchMenu(); setMenuDialog(false); toast("Menu item updated"); } });
  const deleteMenuItem = trpc.bistro.deleteMenuItem.useMutation({ onSuccess: () => { refetchMenu(); toast("Item removed"); } });
  const createOrder = trpc.bistro.createOrder.useMutation({ onSuccess: () => { refetchOrders(); setOrderDialog(false); setCart([]); toast("Order created"); } });
  const updateOrderStatus = trpc.bistro.updateOrderStatus.useMutation({ onSuccess: () => { refetchOrders(); } });
  const closeTill = trpc.bistro.closeDailyTill.useMutation({ onSuccess: () => { toast("Daily till closed"); } });

  // --- Grouped menu ---
  const groupedMenu = useMemo(() => {
    const g: Record<string, typeof menuItems> = {};
    for (const item of menuItems) {
      if (!g[item.category]) g[item.category] = [];
      g[item.category].push(item);
    }
    return g;
  }, [menuItems]);

  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function openAddMenu() {
    setEditItem(null);
    setMenuForm({ name: "", category: "Main", description: "", price: "", costPrice: "", isAvailable: true, isHalal: true, allergens: "", sortOrder: 0 });
    setMenuDialog(true);
  }

  function openEditMenu(item: any) {
    setEditItem(item);
    setMenuForm({
      name: item.name, category: item.category, description: item.description || "",
      price: String(item.price), costPrice: item.costPrice ? String(item.costPrice) : "",
      isAvailable: item.isAvailable, isHalal: item.isHalal, allergens: item.allergens || "", sortOrder: item.sortOrder || 0,
    });
    setMenuDialog(true);
  }

  function saveMenuItem() {
    const payload = {
      name: menuForm.name, category: menuForm.category, description: menuForm.description || undefined,
      price: parseFloat(menuForm.price), costPrice: menuForm.costPrice ? parseFloat(menuForm.costPrice) : undefined,
      isAvailable: menuForm.isAvailable, isHalal: menuForm.isHalal,
      allergens: menuForm.allergens || undefined, sortOrder: menuForm.sortOrder,
    };
    if (editItem) updateMenuItem.mutate({ id: editItem.id, ...payload });
    else addMenuItem.mutate(payload);
  }

  function addToCart(item: any) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, itemName: item.name, quantity: 1, unitPrice: Number(item.price), notes: "" }];
    });
  }

  function removeFromCart(menuItemId: number) {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId));
  }

  function placeOrder() {
    if (cart.length === 0) { toast.error("Add items to the order first"); return; }
    createOrder.mutate({ ...orderForm, items: cart });
  }

  function advanceStatus(order: any) {
    const next = statusNext[order.status];
    if (!next) return;
    updateOrderStatus.mutate({ id: order.id, status: next as any });
  }

  function markPaid(order: any, method: typeof PAYMENT_METHODS[number]) {
    updateOrderStatus.mutate({ id: order.id, status: "served", paymentMethod: method, paymentStatus: "paid" });
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/20">
            <UtensilsCrossed className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Bistro 87</h1>
            <p className="text-sm text-slate-400">Restaurant & Cafe Management</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchOrders(); refetchMenu(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => setOrderDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Order
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Revenue (30d)</p>
              <p className="text-xl font-bold text-orange-400">£{stats.totalRevenue.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Orders (30d)</p>
              <p className="text-xl font-bold text-white">{stats.totalOrders}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Avg Order Value</p>
              <p className="text-xl font-bold text-white">£{stats.avgOrderValue.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Menu Items</p>
              <p className="text-xl font-bold text-white">{menuItems.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1 mb-4">
          <TabsList className="bg-slate-800 border-slate-700 inline-flex w-max min-w-full h-auto gap-1 p-1">
            <TabsTrigger value="orders" className="whitespace-nowrap"><Clock className="h-4 w-4 mr-1" />Live Orders</TabsTrigger>
            <TabsTrigger value="menu" className="whitespace-nowrap"><ChefHat className="h-4 w-4 mr-1" />Menu</TabsTrigger>
            <TabsTrigger value="analytics" className="whitespace-nowrap"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>
        </div>

        {/* LIVE ORDERS TAB */}
        <TabsContent value="orders">
          <div className="flex gap-2 mb-4 flex-wrap overflow-x-auto pb-1">
            {["pending", "preparing", "ready", "served", "all"].map(s => (
              <Button key={s} size="sm" variant={orderFilter === s ? "default" : "outline"}
                className={`whitespace-nowrap ${orderFilter === s ? "bg-orange-600 hover:bg-orange-700" : ""}`}
                onClick={() => setOrderFilter(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          {orders.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No orders found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order: any) => (
                <Card key={order.id} className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-white text-sm">{order.orderRef}</p>
                        <p className="text-xs text-slate-400">
                          {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Walk-in"} &bull; {order.orderType.replace("_", " ")}
                        </p>
                      </div>
                      <Badge className={statusColor[order.status] || ""}>{order.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold text-orange-400 mb-3">£{Number(order.total).toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mb-3">{new Date(order.createdAt).toLocaleTimeString()}</p>
                    <div className="flex gap-2 flex-wrap">
                      {statusNext[order.status] && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs" onClick={() => advanceStatus(order)}>
                          Mark {statusNext[order.status]}
                        </Button>
                      )}
                      {order.status !== "cancelled" && order.paymentStatus !== "paid" && (
                        <Select onValueChange={(method) => markPaid(order, method as any)}>
                          <SelectTrigger className="h-7 text-xs w-28 bg-green-700/30 border-green-600">
                            <SelectValue placeholder="Mark Paid" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {order.paymentStatus === "paid" && (
                        <Badge className="bg-green-500/20 text-green-300 text-xs">Paid</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* MENU TAB */}
        <TabsContent value="menu">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={openAddMenu}>
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>
          {Object.entries(groupedMenu).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide mb-3">{category}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((item: any) => (
                  <Card key={item.id} className="bg-slate-800 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-medium text-white text-sm">{item.name}</p>
                        <p className="text-orange-400 font-bold">£{Number(item.price).toFixed(2)}</p>
                      </div>
                      {item.description && <p className="text-xs text-slate-400 mb-2">{item.description}</p>}
                      <div className="flex gap-1 flex-wrap mb-3">
                        {item.isHalal && <Badge className="bg-green-500/20 text-green-300 text-xs">Halal</Badge>}
                        {!item.isAvailable && <Badge className="bg-red-500/20 text-red-300 text-xs">Unavailable</Badge>}
                        {item.allergens && <Badge className="bg-yellow-500/20 text-yellow-300 text-xs">{item.allergens}</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => openEditMenu(item)}>
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-800"
                          onClick={() => deleteMenuItem.mutate({ id: item.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {menuItems.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No menu items yet. Add your first item.</p>
            </div>
          )}
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics">
          {stats && stats.topItems.length > 0 ? (
            <div className="space-y-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader><CardTitle className="text-white text-base">Top Selling Items (Last 30 Days)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.topItems.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 text-sm w-5">{i + 1}.</span>
                          <span className="text-white text-sm">{item.name}</span>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-slate-400">{item.qty} sold</span>
                          <span className="text-orange-400 font-medium">£{item.revenue.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No sales data yet. Complete some orders to see analytics.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ADD/EDIT MENU ITEM DIALOG */}
      <Dialog open={menuDialog} onOpenChange={setMenuDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{editItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Name *</Label>
                <Input className="bg-slate-800 border-slate-600 text-white mt-1"
                  value={menuForm.name} onChange={e => setMenuForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Category</Label>
                <Select value={menuForm.category} onValueChange={v => setMenuForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Description</Label>
              <Textarea className="bg-slate-800 border-slate-600 text-white mt-1 h-16"
                value={menuForm.description} onChange={e => setMenuForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Price (£) *</Label>
                <Input type="number" step="0.01" className="bg-slate-800 border-slate-600 text-white mt-1"
                  value={menuForm.price} onChange={e => setMenuForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Cost Price (£)</Label>
                <Input type="number" step="0.01" className="bg-slate-800 border-slate-600 text-white mt-1"
                  value={menuForm.costPrice} onChange={e => setMenuForm(f => ({ ...f, costPrice: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Allergens</Label>
              <Input className="bg-slate-800 border-slate-600 text-white mt-1" placeholder="e.g. Nuts, Dairy"
                value={menuForm.allergens} onChange={e => setMenuForm(f => ({ ...f, allergens: e.target.value }))} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={menuForm.isAvailable} onChange={e => setMenuForm(f => ({ ...f, isAvailable: e.target.checked }))} />
                Available
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={menuForm.isHalal} onChange={e => setMenuForm(f => ({ ...f, isHalal: e.target.checked }))} />
                Halal
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMenuDialog(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={saveMenuItem}
              disabled={!menuForm.name || !menuForm.price}>
              {editItem ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW ORDER DIALOG */}
      <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">New Order</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Order Details */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-300 text-xs">Table No.</Label>
                  <Input className="bg-slate-800 border-slate-600 text-white mt-1"
                    value={orderForm.tableNumber} onChange={e => setOrderForm(f => ({ ...f, tableNumber: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Customer Name</Label>
                  <Input className="bg-slate-800 border-slate-600 text-white mt-1"
                    value={orderForm.customerName} onChange={e => setOrderForm(f => ({ ...f, customerName: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Order Type</Label>
                <Select value={orderForm.orderType} onValueChange={v => setOrderForm(f => ({ ...f, orderType: v as any }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Notes</Label>
                <Textarea className="bg-slate-800 border-slate-600 text-white mt-1 h-16"
                  value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {/* Cart */}
              <div>
                <p className="text-sm font-medium text-slate-300 mb-2">Order Items</p>
                {cart.length === 0 ? (
                  <p className="text-xs text-slate-500">No items yet. Select from menu.</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.menuItemId} className="flex justify-between items-center bg-slate-800 rounded p-2">
                        <div>
                          <p className="text-white text-xs">{item.itemName}</p>
                          <p className="text-slate-400 text-xs">x{item.quantity} @ £{item.unitPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-400 text-xs">£{(item.unitPrice * item.quantity).toFixed(2)}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400"
                            onClick={() => removeFromCart(item.menuItemId)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-slate-700">
                      <span className="text-sm text-slate-300">Subtotal</span>
                      <span className="text-orange-400 font-bold">£{cartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Menu Picker */}
            <div className="overflow-y-auto max-h-80">
              <p className="text-sm font-medium text-slate-300 mb-2">Add from Menu</p>
              {Object.entries(groupedMenu).map(([cat, items]) => (
                <div key={cat} className="mb-3">
                  <p className="text-xs text-orange-400 uppercase tracking-wide mb-1">{cat}</p>
                  {items.filter((i: any) => i.isAvailable).map((item: any) => (
                    <button key={item.id} onClick={() => addToCart(item)}
                      className="w-full text-left flex justify-between items-center p-2 rounded hover:bg-slate-700 transition-colors">
                      <span className="text-white text-xs">{item.name}</span>
                      <span className="text-orange-400 text-xs">£{Number(item.price).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialog(false)}>Cancel</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={placeOrder}
              disabled={cart.length === 0 || createOrder.isPending}>
              <CheckCircle className="h-4 w-4 mr-1" /> Place Order (£{cartTotal.toFixed(2)})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
