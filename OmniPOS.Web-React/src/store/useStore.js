import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios from 'axios';
import * as signalR from '@microsoft/signalr';

const syncChannel = new BroadcastChannel('omnipos-sync');

// GUID Helper for non-secure contexts (VPS over HTTP)
const generateGUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export const useStore = create(
    persist(
        (set, get) => ({
            currentTenantId: '00000000-0000-0000-0000-000000001111',
            deviceId: `tablet-${Math.floor(Math.random() * 1000)}`,
            posVersion: "v3.2-persistence-fix",
            currentView: 'Dashboard',

            // User & Role State (Authenticated)
            user: null,
            token: null,
            isAuthenticated: false,
            isAdmin: false,

            orders: [],
            processedAmendmentIds: [],
            reservations: [],
            notifications: [],
            customers: [
                { id: 'C1', tenantId: '00000000-0000-0000-0000-000000001111', name: 'John Doe', email: 'john@example.com', phone: '+44 7711 223344', totalOrders: 5, totalSpend: 150.50, lastVisit: new Date().toISOString(), createdAt: new Date().toISOString() },
                { id: 'C2', tenantId: '00000000-0000-0000-0000-000000001111', name: 'Jane Smith', email: 'jane@example.com', phone: '+44 7722 334455', totalOrders: 2, totalSpend: 45.00, lastVisit: new Date().toISOString(), createdAt: new Date().toISOString() }
            ],
            tenants: [
                { id: '00000000-0000-0000-0000-000000001111', name: 'IYI Luxury Dining - London', owner: 'Nauman Baig', address: '123 Knightsbridge, London SW1X 7RJ', contact: '+44 20 7123 4567', status: 'Active', createdAt: new Date().toISOString() }
            ],
            branding: {
                appName: 'OmniPOS',
                siteUrl: '',
                logoUrl: '',
                primaryColor: '#38bdf8', // Default Sky Blue
                secondaryColor: '#818cf8', // Default Indigo
                themeMode: 'dark', // dark or light
                wiseHandle: '', // For automated "Approve/Reject" links
                revolutHandle: '', // For automated Revolut payment links
                cardPaymentUrl: '', // For card payment (e.g. Stripe link)
                availableColors: [
                    '#38bdf8', '#818cf8', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'
                ]
            },

            fetchBranding: async () => {
                try {
                    const response = await fetch('/api/Settings/branding', {
                        headers: {
                            'X-Tenant-ID': get().currentTenantId,
                            'Authorization': `Bearer ${get().token}`
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        console.log('[useStore] Raw Branding Data:', data);
                        const baseUrl = ''; // Relative path for proxy

                        // Derive isAdmin if user exists
                        if (get().user && !get().isAdmin) {
                            set({ isAdmin: ['Admin', 'Owner', 'Manager'].includes(get().user.role) });
                        }

                        // Map PascalCase from .NET to camelCase for the store
                        const mappedBranding = {
                            appName: data.appName || data.AppName || get().branding.appName,
                            siteUrl: data.siteUrl || data.SiteUrl || get().branding.siteUrl,
                            logoUrl: data.logoUrl || data.LogoUrl || get().branding.logoUrl,
                            primaryColor: data.primaryColor || data.PrimaryColor || get().branding.primaryColor,
                            secondaryColor: data.secondaryColor || data.SecondaryColor || get().branding.secondaryColor,
                            themeMode: data.themeMode || data.ThemeMode || get().branding.themeMode,
                            wiseHandle: data.wiseHandle || data.WiseHandle || get().branding.wiseHandle,
                            revolutHandle: data.revolutHandle || data.RevolutHandle || get().branding.revolutHandle,
                            cardPaymentUrl: data.cardPaymentUrl || data.CardPaymentUrl || get().branding.cardPaymentUrl
                        };

                        if (mappedBranding.logoUrl && mappedBranding.logoUrl.startsWith('/uploads')) {
                            mappedBranding.logoUrl = `${baseUrl}${mappedBranding.logoUrl}`;
                        }

                        set({ branding: { ...get().branding, ...mappedBranding } });
                    }
                } catch (error) {
                    console.error('Failed to fetch branding:', error);
                }
            },
            logs: ['> OmniPOS v3.2 - Persistence Fix Active...', '> System ready...', '> Role-Based Security Node active...'],

            // Cash Register State
            cashRegister: {
                isOpen: false,
                openingBalance: 0,
                currentBalance: 0,
                lastClosedAt: null,
                lastOpenedAt: null
            },

            openRegister: (amount) => set((state) => ({
                cashRegister: {
                    ...state.cashRegister,
                    isOpen: true,
                    openingBalance: parseFloat(amount),
                    currentBalance: parseFloat(amount),
                    lastOpenedAt: new Date().toISOString()
                },
                logs: [...state.logs, `> Cash register opened with £${parseFloat(amount).toFixed(2)}`]
            })),

            closeRegister: () => set((state) => ({
                cashRegister: {
                    ...state.cashRegister,
                    isOpen: false,
                    lastClosedAt: new Date().toISOString()
                },
                logs: [...state.logs, `> Cash register closed. Final balance: £${state.cashRegister.currentBalance.toFixed(2)}`]
            })),

            // 1. Table Management
            tables: [
                { id: 'T1', num: '1', pos: { x: 50, y: 50 }, status: 'Occupied', cap: 4, shape: 'Square' },
                { id: 'T2', num: '2', pos: { x: 200, y: 50 }, status: 'Available', cap: 2, shape: 'Square' },
                { id: 'T3', num: '3', pos: { x: 50, y: 180 }, status: 'Reserved', cap: 6, shape: 'Circle' },
                { id: 'T4', num: '4', pos: { x: 200, y: 180 }, status: 'Dirty', cap: 4, shape: 'Square' },
            ],

            // 2. Menu Management (Real Data from iyi.kematconsulting.co.uk)
            categories: ['Starters', 'IYI Specials', 'BBQ', 'Desserts', 'Drinks'],
            menuItems: [
                { id: 'M1', name: 'Chicken Hummus', cat: 'Starters', price: 5.00, stock: 'High', image: 'https://images.unsplash.com/photo-1577906030526-f3a1522dd17c?auto=format&fit=crop&q=80&w=200' },
                { id: 'M2', name: 'Lamb Avocado Hummus', cat: 'Starters', price: 8.99, stock: 'Medium', image: 'https://images.unsplash.com/photo-1628294895913-91332768565c?auto=format&fit=crop&q=80&w=200' },
                { id: 'M3', name: 'Lamb Hummus', cat: 'Starters', price: 9.99, stock: 'High', image: 'https://images.unsplash.com/photo-1599307734110-d8301ec9744f?auto=format&fit=crop&q=80&w=200' },
                { id: 'M4', name: 'Plain Avocado Hummus', cat: 'Starters', price: 7.00, stock: 'High', image: 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&q=80&w=200' },
                { id: 'M5', name: 'Chapli Kebab', cat: 'IYI Specials', price: 9.99, stock: 'High', image: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&q=80&w=200' },
                { id: 'M6', name: 'Ranjha Gosht', cat: 'IYI Specials', price: 19.99, stock: 'Medium', image: 'https://images.unsplash.com/photo-1544124499-58ec34ee8a63?auto=format&fit=crop&q=80&w=200' },
                { id: 'M7', name: 'Chicken Kebab Barg', cat: 'BBQ', price: 15.99, stock: 'High', image: 'https://images.unsplash.com/photo-1594002226034-2190bc1f0b0b?auto=format&fit=crop&q=80&w=200' },
                { id: 'M8', name: 'Chicken Shish Kebab', cat: 'BBQ', price: 15.99, stock: 'High', image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&q=80&w=200' },
                { id: 'M9', name: 'Chicken Wings', cat: 'BBQ', price: 15.99, stock: 'High', image: 'https://images.unsplash.com/photo-1527477396000-e2cb862f6281?auto=format&fit=crop&q=80&w=200' },
                { id: 'M10', name: 'Baklava', cat: 'Desserts', price: 6.99, stock: 'Medium', image: 'https://images.unsplash.com/photo-1519676867240-f031ee49986b?auto=format&fit=crop&q=80&w=200' },
                { id: 'M11', name: 'Künefe', cat: 'Desserts', price: 6.99, stock: 'High', image: 'https://images.unsplash.com/photo-1582264424206-8d5918ba0362?auto=format&fit=crop&q=80&w=200' },
            ],

            // Auth Actions
            login: async (username, password) => {
                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        set({
                            user: data.user,
                            token: data.token,
                            isAuthenticated: true,
                            currentTenantId: data.user.tenantId
                        });
                        get().addLog(`User ${data.user.fullName} logged in.`);
                        get().fetchBranding();
                        get().initSignalR();
                        return { success: true };
                    } else {
                        const err = await response.json();
                        return { success: false, message: err.message || 'Authentication failed' };
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    return { success: false, message: 'Server connection error' };
                }
            },

            logout: () => {
                set({ user: null, token: null, isAuthenticated: false });
                get().addLog('User logged out.');
            },

            // 3. Inventory & Stock
            inventoryItems: [
                { id: 'I1', name: 'Wagyu Beef', sku: 'SKU-001', level: 15.5, unit: 'kg', status: 'Healthy' },
                { id: 'I2', name: 'Truffle Oil', sku: 'SKU-009', level: 0.8, unit: 'liters', status: 'Critical' },
                { id: 'I3', name: 'Sea Salt', sku: 'SKU-044', level: 5.0, unit: 'kg', status: 'Low' },
            ],

            // 4. Staff & Payroll
            roles: [
                { id: 'R1', name: 'Owner', permissions: ['All'] },
                { id: 'R2', name: 'Manager', permissions: ['All'] },
                { id: 'R3', name: 'Front of House', permissions: ['Orders', 'Tables'] },
                { id: 'R4', name: 'Waiter', permissions: ['Orders', 'Tables'] },
                { id: 'R5', name: 'Till', permissions: ['Orders', 'Tables', 'Payments'] },
                { id: 'R6', name: 'Chef', permissions: ['Kitchen', 'Inventory'] },
                { id: 'R7', name: 'Assistant Chef', permissions: ['Kitchen'] },
            ],
            employees: [
                { id: 'E1', name: 'Nauman B.', role: 'Admin', payRate: 25.00, workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], status: 'Active' },
                { id: 'E2', name: 'Emily W.', role: 'Waiter', payRate: 15.00, workingDays: ['Tue', 'Wed', 'Thu', 'Sat', 'Sun'], status: 'Active' },
            ],
            shifts: [
                { id: 'S1', employeeId: 'E1', staff: 'Nauman B.', role: 'Admin', start: '09:00', end: '17:00', status: 'Active', date: new Date().toISOString().split('T')[0] },
                { id: 'S2', employeeId: 'E2', staff: 'Emily W.', role: 'Server', start: '11:00', end: '19:00', status: 'Active', date: new Date().toISOString().split('T')[0] },
            ],
            staffingRequirements: [
                { id: 'REQ1', role: 'Waiter', day: 'Mon', minStaff: 3, startTime: '17:00', endTime: '22:00' },
                { id: 'REQ2', role: 'Chef', day: 'Mon', minStaff: 2, startTime: '12:00', endTime: '22:00' },
            ],

            // Actions
            setUser: (user) => {
                const isAdmin = ['Admin', 'Owner', 'Manager'].includes(user?.role);
                set({ user, isAdmin, isAuthenticated: !!user });
            },
            setTenant: (id) => set({ currentTenantId: id }),
            setView: (view) => set({ currentView: view }),

            addLog: (msg) => set((state) => ({
                logs: [...state.logs.slice(-50), `> ${msg}`]
            })),

            addNotification: (notification) => set((state) => {
                const timestamp = notification.timestamp || new Date().toISOString();
                const id = notification.id || notification.notificationId || `${notification.title}-${notification.message}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

                // Check for duplicate (same content within 3 seconds)
                const now = Date.now();
                const isDuplicate = state.notifications.some(n =>
                    n.title === notification.title &&
                    n.message === notification.message &&
                    (now - new Date(n.timestamp).getTime()) < 3000
                );

                if (isDuplicate) return state;

                const canonicalRole = (role) => {
                    if (!role) return '';
                    if (['Chef', 'Assistant Chef', 'Kitchen'].includes(role)) return 'Kitchen';
                    return role;
                };

                const userRole = state.user?.role || '';
                const userCanonical = canonicalRole(userRole);

                const notifications = [
                    { ...notification, id, timestamp },
                    ...state.notifications
                ].slice(0, 20); // Keep 20 to prevent pushing out unread ones during bulk updates (like Payment)

                syncChannel.postMessage({ type: 'SYNC_NOTIFICATIONS', payload: notifications });

                // Play notification sound
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();

                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);

                    oscillator.frequency.value = 800; // First tone
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.1);

                    const oscillator2 = audioContext.createOscillator();
                    const gainNode2 = audioContext.createGain();
                    oscillator2.connect(gainNode2);
                    gainNode2.connect(audioContext.destination);

                    oscillator2.frequency.value = 1000;
                    gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.1);
                    gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                    oscillator2.start(audioContext.currentTime + 0.1);
                    oscillator2.stop(audioContext.currentTime + 0.2);
                } catch (error) {
                    console.warn('[Notification] Could not play sound:', error);
                }

                return { notifications };
            }),

            clearNotification: (id) => set((state) => ({
                notifications: state.notifications.filter(n => n.id !== id && n.notificationId !== id)
            })),

            // Table Actions
            addTable: (table) => set((state) => ({
                tables: [...state.tables, { ...table, id: generateGUID() }],
                logs: [...state.logs, `> Added table ${table.num}`]
            })),

            addTableAsync: async (tableData) => {
                const { token, currentTenantId, fetchTables, addLog } = get();
                if (!token) return;

                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;
                const newId = generateGUID();

                // OPTIMISTIC UPDATE: Add to local state immediately
                const tempTable = {
                    id: newId,
                    num: tableData.num,
                    pos: tableData.pos,
                    status: tableData.status || 'Available',
                    cap: tableData.cap,
                    shape: tableData.shape || 'Square',
                    syncing: true
                };

                set((state) => ({
                    tables: [...state.tables, tempTable],
                    logs: [...state.logs, `> Adding Table ${tableData.num} (Optimistic)...`]
                }));

                const payload = {
                    restaurantTableId: newId,
                    tenantId: tidHeader,
                    tableNumber: String(tableData.num),
                    capacity: Number(tableData.cap),
                    status: tableData.status || 'Available',
                    posX: Math.round(tableData.pos.x),
                    posY: Math.round(tableData.pos.y)
                };

                try {
                    const response = await fetch('/api/table', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        addLog(`Table ${tableData.num} saved to server successfully`);
                        // Final sync to ensure everything is perfect
                        await fetchTables();
                        return true;
                    } else {
                        const err = await response.text();
                        addLog(`SERVER REJECTED TABLE: ${err}`);
                        // Rollback on failure
                        set((state) => ({
                            tables: state.tables.filter(t => t.id !== newId)
                        }));
                        return false;
                    }
                } catch (error) {
                    addLog(`NETWORK ERROR ADDING TABLE: ${error.message}`);
                    set((state) => ({
                        tables: state.tables.filter(t => t.id !== newId)
                    }));
                    return false;
                }
            },

            updateTable: (id, updates) => set((state) => ({
                tables: state.tables.map(t => t.id === id ? { ...t, ...updates } : t)
            })),

            updateTableAsync: async (id, updates) => {
                const { token, currentTenantId, tables, fetchTables, addLog } = get();
                if (!token) return;

                const table = tables.find(t => t.id === id);
                if (!table) return;

                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                // OPTIMISTIC UPDATE
                const oldTable = { ...table };
                set((state) => ({
                    tables: state.tables.map(t => t.id === id ? { ...t, ...updates } : t)
                }));

                const payload = {
                    restaurantTableId: id,
                    tenantId: tidHeader,
                    tableNumber: String(updates.num || table.num),
                    capacity: Number(updates.cap || table.cap),
                    status: updates.status || table.status,
                    posX: Math.round(updates.pos?.x ?? table.pos.x),
                    posY: Math.round(updates.pos?.y ?? table.pos.y)
                };

                try {
                    const response = await fetch(`/api/table/${id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        addLog(`Table ${payload.tableNumber} updated on server`);
                    } else {
                        const err = await response.text();
                        addLog(`UPDATE FAILED: ${err}`);
                        // Rollback
                        set((state) => ({
                            tables: state.tables.map(t => t.id === id ? oldTable : t)
                        }));
                    }
                } catch (error) {
                    addLog(`UPDATE ERROR: ${error.message}`);
                    set((state) => ({
                        tables: state.tables.map(t => t.id === id ? oldTable : t)
                    }));
                }
            },

            deleteTable: (id) => set((state) => ({
                tables: state.tables.filter(t => t.id !== id),
                logs: [...state.logs, `> Deleted table ${id}`]
            })),

            deleteTableAsync: async (id) => {
                const { token, currentTenantId, tables, fetchTables, addLog } = get();
                if (!token) return;

                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;
                const oldTables = [...tables];

                // OPTIMISTIC DELETE
                set((state) => ({
                    tables: state.tables.filter(t => t.id !== id),
                    logs: [...state.logs, `> Deleting Table (Optimistic)...`]
                }));

                try {
                    const response = await fetch(`/api/table/${id}`, {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        }
                    });

                    if (response.ok) {
                        addLog(`Table deleted from server`);
                        // No need to fetch as we already deleted optimistically
                    } else {
                        const err = await response.text();
                        addLog(`DELETE FAILED: ${err}`);
                        set({ tables: oldTables });
                    }
                } catch (error) {
                    addLog(`DELETE ERROR: ${error.message}`);
                    set({ tables: oldTables });
                }
            },

            // Menu Actions
            addMenuItem: (item) => set((state) => ({
                menuItems: [...state.menuItems, { ...item, id: `M${Date.now()}` }],
                logs: [...state.logs, `> Added menu item ${item.name}`]
            })),
            updateMenuItem: (id, updates) => set((state) => ({
                menuItems: state.menuItems.map(m => m.id === id ? { ...m, ...updates } : m)
            })),
            deleteMenuItem: (id) => set((state) => ({
                menuItems: state.menuItems.filter(m => m.id !== id),
                logs: [...state.logs, `> Deleted menu item ${id}`]
            })),
            updateMenuStock: (id, stock) => set((state) => ({
                menuItems: state.menuItems.map(m => m.id === id ? { ...m, stock } : m),
                logs: [...state.logs, `> Stock for ${state.menuItems.find(m => m.id === id)?.name} updated to ${stock}`]
            })),

            // Inventory Actions
            updateStock: (id, level) => set((state) => ({
                inventoryItems: state.inventoryItems.map(i => {
                    if (i.id === id) {
                        let status = 'Healthy';
                        if (level <= 1) status = 'Critical';
                        else if (level <= 5) status = 'Low';
                        return { ...i, level, status };
                    }
                    return i;
                })
            })),
            addInventoryItem: (item) => set((state) => ({
                inventoryItems: [...state.inventoryItems, { ...item, id: `I${Date.now()}` }],
                logs: [...state.logs, `> Added inventory item ${item.name}`]
            })),
            deleteInventoryItem: (id) => set((state) => ({
                inventoryItems: state.inventoryItems.filter(i => i.id !== id),
                logs: [...state.logs, `> Deleted inventory item ${id}`]
            })),

            // Role Actions
            addRole: (role) => set((state) => ({
                roles: [...state.roles, { ...role, id: `R${Date.now()}` }],
                logs: [...state.logs, `> Created new role: ${role.name}`]
            })),
            updateRole: (id, updates) => set((state) => ({
                roles: state.roles.map(r => r.id === id ? { ...r, ...updates } : r)
            })),
            deleteRole: (id) => set((state) => ({
                roles: state.roles.filter(r => r.id !== id),
                logs: [...state.logs, `> Deleted role: ${id}`]
            })),

            // Employee Actions
            addEmployee: (emp) => set((state) => ({
                employees: [...state.employees, { ...emp, id: `E${Date.now()}` }],
                logs: [...state.logs, `> Added employee ${emp.name}`]
            })),
            updateEmployee: (id, updates) => set((state) => ({
                employees: state.employees.map(e => e.id === id ? { ...e, ...updates } : e)
            })),
            deleteEmployee: (id) => set((state) => ({
                employees: state.employees.filter(e => e.id !== id),
                logs: [...state.logs, `> Deleted employee ${id}`]
            })),

            // Staffing Requirement Actions
            updateStaffingRequirement: (id, updates) => set((state) => ({
                staffingRequirements: state.staffingRequirements.map(r => r.id === id ? { ...r, ...updates } : r)
            })),
            addStaffingRequirement: (req) => set((state) => {
                const days = req.applyToAll ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : [req.day];
                const newReqs = days.map(day => ({
                    ...req,
                    id: `REQ${Date.now()}-${day}`,
                    day,
                    applyToAll: undefined
                }));
                const filtered = state.staffingRequirements.filter(sr =>
                    !newReqs.some(nr => nr.day === sr.day && nr.role === sr.role && nr.startTime === sr.startTime)
                );
                return { staffingRequirements: [...filtered, ...newReqs] };
            }),

            // Shift Actions
            addShift: (shift) => set((state) => ({
                shifts: [...state.shifts, { ...shift, id: `S${Date.now()}` }],
                logs: [...state.logs, `> Scheduled shift for ${shift.staff}`]
            })),
            updateShift: (id, updates) => set((state) => ({
                shifts: state.shifts.map(s => s.id === id ? { ...s, ...updates } : s)
            })),

            // Ordering System (Complex)
            createOrder: (orderData) => {
                try {
                    get().addLog(`Starting createOrder for ${orderData.tableId || 'Walk-in'}...`);
                    const { currentTenantId, deviceId } = get();

                    // Standardize on valid GUIDs to ensure backend/sync compatibility
                    const id = generateGUID();

                    const clock = { [deviceId]: 1 };

                    const newOrder = {
                        id,
                        tenantId: currentTenantId,
                        ...orderData,
                        status: 'Placed', // Initial state
                        syncStatus: 'Offline',
                        pendingAmendments: [],
                        clock,
                        createdAt: new Date().toISOString()
                    };

                    set((state) => {
                        const existingCustomer = state.customers.find(c =>
                            c.tenantId === currentTenantId && (
                                (orderData.customerEmail && c.email === orderData.customerEmail) ||
                                (orderData.customerPhone && c.phone === orderData.customerPhone)
                            )
                        );

                        let updatedCustomers = state.customers;
                        if (existingCustomer) {
                            updatedCustomers = state.customers.map(c =>
                                c.id === existingCustomer.id
                                    ? { ...c, lastVisit: new Date().toISOString(), totalOrders: c.totalOrders + 1 }
                                    : c
                            );
                        } else if (orderData.customerName) {
                            updatedCustomers = [...state.customers, {
                                id: generateGUID(),
                                tenantId: currentTenantId,
                                name: orderData.customerName,
                                email: orderData.customerEmail || '',
                                phone: orderData.customerPhone || '',
                                totalOrders: 1,
                                totalSpend: 0,
                                lastVisit: new Date().toISOString(),
                                createdAt: new Date().toISOString()
                            }];
                        }


                        // Local notification (backend doesn't send SignalR notifications)
                        const tableNum = orderData.tableId
                            ? orderData.tableId.split(',').filter(Boolean).map(tid => state.tables.find(t => t.id === tid)?.num).join(', ')
                            : 'Walk-in';

                        get().addNotification({
                            title: 'New Order Placed!',
                            message: `Order #${id.slice(0, 4)} for Table ${tableNum} has been placed.`,
                            type: 'info',
                            roleFilter: ['Admin', 'Manager', 'Kitchen', 'Owner']
                        });

                        const orders = [...state.orders, newOrder];
                        const updatedTables = orderData.tableId
                            ? state.tables.map(t =>
                                orderData.tableId.split(',').includes(t.id)
                                    ? { ...t, status: 'Occupied' }
                                    : t
                            )
                            : state.tables;

                        syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: orders });
                        syncChannel.postMessage({ type: 'SYNC_TABLES', payload: updatedTables });
                        syncChannel.postMessage({ type: 'SYNC_CUSTOMERS', payload: updatedCustomers });

                        get().addLog(`Order state updated locally. ID: ${id.slice(0, 8)}`);
                        return {
                            orders,
                            customers: updatedCustomers,
                            tables: updatedTables
                        };
                    });
                    get().addLog(`Triggering immediate sync for order ${id.slice(0, 4)}...`);
                    get().syncOrders();
                } catch (err) {
                    get().addLog(`FATAL UI ERROR: ${err.message}`);
                }
            },

            proposeAmendment: (orderId, amendments) => set((state) => {
                const order = state.orders.find(o => o.id === orderId);
                if (!order) return state;

                const updatedOrders = state.orders.map(o =>
                    o.id === orderId
                        ? {
                            ...o,
                            pendingAmendments: amendments,
                            syncStatus: 'Offline',
                            clock: { ...o.clock, [state.deviceId || 'unknown']: (o.clock[state.deviceId || 'unknown'] || 0) + 1 }
                        }
                        : o
                );

                const tableNum = order.tableId
                    ? order.tableId.split(',').filter(Boolean).map(tid => state.tables.find(t => t.id === tid)?.num).join(', ')
                    : 'Walk-in';

                get().addNotification({
                    title: 'Amendment Proposed',
                    message: `Order #${orderId.slice(0, 4)} (Table ${tableNum}) has new proposed changes.`,
                    type: 'info',
                    roleFilter: ['Admin', 'Manager', 'Kitchen', 'Chef', 'Assistant Chef', 'Owner']
                });

                get().addLog(`Amendment proposed for order ${orderId.slice(0, 4)}`);
                syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: updatedOrders });

                // Trigger sync immediately after setting the state
                setTimeout(() => get().syncOrders(), 100);

                return { orders: updatedOrders };
            }),

            respondToAmendment: async (orderId, approved) => {
                const { orders, currentTenantId, token } = get();
                if (!token) {
                    get().addLog('Error: Cannot respond to amendment - Not authenticated');
                    return;
                }
                const order = orders.find(o => o.id === orderId);
                if (!order || !order.pendingAmendments) return;

                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                try {
                    let updatedMetadataJson = '';
                    let updatedTotalAmount = 0;

                    if (approved) {
                        const newItems = [...order.items, ...order.pendingAmendments.filter(a => a.type === 'add').map(a => a.item)];
                        const itemsAfterDeletes = newItems.filter(item =>
                            !order.pendingAmendments.some(a => a.type === 'delete' && a.itemId === item.id)
                        );
                        updatedTotalAmount = itemsAfterDeletes.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
                        updatedMetadataJson = JSON.stringify(itemsAfterDeletes);
                    }

                    const response = await fetch(`/api/OfflineSync/order/${orderId}/respond-amendment`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            approve: approved,
                            updatedMetadataJson,
                            updatedTotalAmount
                        })
                    });

                    if (response.ok) {
                        set((state) => {
                            const deviceId = state.deviceId || 'unknown-device';
                            const updatedOrders = state.orders.map(o => {
                                if (o.id === orderId) {
                                    const newClock = { ...o.clock, [deviceId]: (o.clock[deviceId] || 0) + 1 };
                                    return {
                                        ...o,
                                        pendingAmendments: [],
                                        items: approved ? JSON.parse(updatedMetadataJson || JSON.stringify(o.items)) : o.items,
                                        amount: approved ? updatedTotalAmount.toFixed(2) : o.amount,
                                        clock: newClock,
                                        syncStatus: 'Offline'
                                    };
                                }
                                return o;
                            });

                            syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: updatedOrders });

                            return {
                                processedAmendmentIds: [...state.processedAmendmentIds, orderId],
                                orders: updatedOrders,
                                logs: [...state.logs, `\u003e Amendment ${approved ? 'APPROVED' : 'DECLINED'} for #${orderId.slice(0, 4)}`]
                            };
                        });

                        get().addNotification({
                            title: approved ? 'Amendment Approved' : 'Amendment Declined',
                            message: `Kitchen has ${approved ? 'accepted' : 'rejected'} changes for #${orderId.slice(0, 4)}`,
                            type: approved ? 'success' : 'warning',
                            roleFilter: ['Admin', 'Manager', 'Waiter', 'Till']
                        });

                        get().fetchOrders();
                    } else {
                        const err = await response.text();
                        get().addLog(`Failed to respond to amendment: ${err}`);
                    }
                } catch (error) {
                    console.error('Error responding to amendment:', error);
                    get().addLog(`Amendment response error: ${error.message}`);
                }
            },

            updateOrderFinancials: async (id, payload) => {
                const { token, currentTenantId, addLog } = get();
                if (!token) return;

                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                try {
                    const response = await fetch(`/api/Order/${id}/financials`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        // Optimistic update local state
                        set(state => ({
                            orders: state.orders.map(o => o.id === id ? { ...o, ...payload } : o)
                        }));
                        addLog(`Financials updated for order ${id.slice(0, 4)}`);
                    } else {
                        const err = await response.text();
                        addLog(`Financial update failed: ${err}`);
                    }
                } catch (error) {
                    addLog(`Financial update error: ${error.message}`);
                }
            },

            updateOrderStatus: async (id, newStatus) => {
                const order = get().orders.find(o => o.id === id);
                if (!order) {
                    set((state) => ({ logs: [...state.logs, `! Order ${id} not found`] }));
                    return;
                }

                // Update local state immediately for responsive UI
                set((state) => {
                    const updatedOrders = state.orders.map(o => o.id === id ? { ...o, status: newStatus } : o);
                    const shouldFreeTable = ['Cancelled', 'Declined', 'Paid'].includes(newStatus);
                    const updatedTables = (shouldFreeTable && order?.tableId)
                        ? state.tables.map(t =>
                            order.tableId.split(',').includes(t.id)
                                ? { ...t, status: 'Available' }
                                : t
                        )
                        : state.tables;

                    return {
                        orders: updatedOrders,
                        tables: updatedTables,
                        logs: [...state.logs, `> Order ${id} changed to ${newStatus}`]
                    };
                });

                // Add notification for status change
                const tableNum = order.tableId
                    ? order.tableId.split(',').filter(Boolean).map(tid => get().tables.find(t => t.id === tid)?.num).join(', ')
                    : 'Walk-in';

                const statusNotifications = {
                    'Accepted': {
                        title: 'Order Accepted',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been accepted by Kitchen`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till']
                    },
                    'Ready': {
                        title: 'Order Ready!',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) is ready for delivery`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till']
                    },
                    'Delivered': {
                        title: 'Order Delivered',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been delivered to customer`,
                        type: 'info',
                        roleFilter: ['Admin', 'Manager', 'Kitchen']
                    },
                    'Cancelled': {
                        title: 'Order Cancelled',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been cancelled`,
                        type: 'warning',
                        roleFilter: ['Admin', 'Manager', 'Kitchen', 'Waiter']
                    },
                    'Declined': {
                        title: 'Order Declined',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been declined by Kitchen`,
                        type: 'warning',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till']
                    },
                    'Paid': {
                        title: 'Payment Received',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been paid by ${order.paymentMethod || 'Cash'}`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till', 'Owner']
                    },
                    'Amended-Preparing': {
                        title: 'Amendment Accepted',
                        message: `Kitchen has ACCEPTED changes for #${id.slice(0, 4)} (Table ${tableNum})`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till', 'Chef', 'Assistant Chef', 'Kitchen']
                    },
                    'Amended-Ready': {
                        title: 'Amended Order Ready',
                        message: `AMENDED Order #${id.slice(0, 4)} (Table ${tableNum}) is ready for delivery`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till']
                    },
                    'Amended-Served': {
                        title: 'Amended Order Served',
                        message: `AMENDED Order #${id.slice(0, 4)} (Table ${tableNum}) has been delivered`,
                        type: 'info',
                        roleFilter: ['Admin', 'Manager', 'Kitchen']
                    }
                };

                if (statusNotifications[newStatus]) {
                    get().addNotification(statusNotifications[newStatus]);
                }

                // Call backend API to persist the change
                try {
                    const response = await fetch(`/api/Order/${id}/status`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': get().currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : get().currentTenantId,
                            'Authorization': `Bearer ${get().token}`
                        },
                        body: JSON.stringify({ newStatus })
                    });

                    if (!response.ok) {
                        console.error('[updateOrderStatus] Backend update failed:', response.status);
                        set((state) => ({ logs: [...state.logs, `! Failed to update order status on server`] }));
                    } else {
                        console.log('[updateOrderStatus] Backend updated successfully');
                        // Fetch latest data to sync all users
                        setTimeout(() => get().fetchOrders(), 100);
                    }
                } catch (error) {
                    console.error('[updateOrderStatus] Error calling backend:', error);
                    set((state) => ({ logs: [...state.logs, `! Error updating order: ${error.message}`] }));
                }
            },

            completePayment: async (id, method, adjustments = {}) => {
                const order = get().orders.find(o => o.id === id);
                if (!order) {
                    set((state) => ({ logs: [...state.logs, `! Order ${id} not found`] }));
                    return;
                }

                console.log('[completePayment] Processing payment:', { id, method, adjustments });

                // Update local state immediately
                set((state) => {
                    const updatedOrders = state.orders.map(o =>
                        o.id === id
                            ? {
                                ...o,
                                status: 'Paid',
                                paymentMethod: method,
                                paidAt: new Date().toISOString(),
                                serviceCharge: parseFloat(adjustments.serviceCharge || 0),
                                discount: parseFloat(adjustments.discount || 0),
                                discountType: adjustments.discountType || 'none',
                                finalTotal: (adjustments.finalTotal !== undefined && adjustments.finalTotal !== null) ? parseFloat(adjustments.finalTotal) : parseFloat(o.amount),
                                discountReason: adjustments.discountReason || '',
                                syncStatus: 'Offline'
                            }
                            : o
                    );

                    const customer = state.customers.find(c => c.name === order.customerName);
                    const updatedCustomers = customer
                        ? state.customers.map(c => c.id === customer.id ? { ...c, totalSpend: c.totalSpend + parseFloat(adjustments.finalTotal || order.amount) } : c)
                        : state.customers;

                    const shouldFreeTable = true; // Always free table on Paid
                    const updatedTables = order.tableId
                        ? state.tables.map(t =>
                            order.tableId.split(',').includes(t.id)
                                ? { ...t, status: 'Available' }
                                : t
                        )
                        : state.tables;

                    const updatedCashRegister = method === 'Cash'
                        ? { ...state.cashRegister, currentBalance: state.cashRegister.currentBalance + parseFloat(adjustments.finalTotal || order.amount) }
                        : state.cashRegister;

                    syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: updatedOrders });
                    syncChannel.postMessage({ type: 'SYNC_TABLES', payload: updatedTables });
                    syncChannel.postMessage({ type: 'SYNC_CUSTOMERS', payload: updatedCustomers });
                    syncChannel.postMessage({ type: 'SYNC_REGISTER', payload: updatedCashRegister });

                    const tableNum = order.tableId
                        ? state.tables.find(t => t.id === order.tableId.split(',')[0])?.num
                        : 'Walk-in';

                    get().addNotification({
                        title: 'Payment Completed',
                        message: `Order #${id.slice(0, 4)} (Table ${tableNum}) has been marked as Paid (${method}).`,
                        type: 'success',
                        roleFilter: ['Admin', 'Manager', 'Waiter', 'Till', 'Owner']
                    });

                    return {
                        orders: updatedOrders,
                        tables: updatedTables,
                        customers: updatedCustomers,
                        cashRegister: updatedCashRegister,
                        logs: [...state.logs, `> Order ${id} marked as Paid`]
                    };
                });

                // Call backend API to persist payment
                try {
                    const response = await fetch(`/api/Order/${id}/status`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': get().currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : get().currentTenantId,
                            'Authorization': `Bearer ${get().token}`
                        },
                        body: JSON.stringify({
                            newStatus: 'Paid',
                            paymentMethod: method,
                            serviceCharge: adjustments.serviceCharge,
                            discount: adjustments.discount,
                            discountType: adjustments.discountType,
                            finalTotal: adjustments.finalTotal,
                            discountReason: adjustments.discountReason
                        })
                    });

                    if (!response.ok) {
                        console.error('[completePayment] Backend update failed:', response.status);
                        set((state) => ({ logs: [...state.logs, `! Failed to complete payment on server`] }));
                    } else {
                        console.log('[completePayment] Payment completed successfully');
                        // Fetch latest data to sync all users
                        setTimeout(() => get().fetchOrders(), 100);
                    }
                } catch (error) {
                    console.error('[completePayment] Error calling backend:', error);
                    set((state) => ({ logs: [...state.logs, `! Error completing payment: ${error.message}`] }));
                }
            },



            updateOrder: (id, updates) => set((state) => {
                const deviceId = get().deviceId;
                const orders = state.orders.map(o => {
                    if (o.id === id) {
                        const newClock = { ...o.clock, [deviceId]: (o.clock?.[deviceId] || 0) + 1 };
                        return { ...o, ...updates, clock: newClock, syncStatus: 'Offline' };
                    }
                    return o;
                });
                syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: orders });
                return {
                    orders,
                    logs: [...state.logs, `> Order ${id} updated & clocked`]
                };
            }),

            deleteOrder: async (id) => {
                // Remove locally first for instant UI feedback
                set((state) => {
                    const order = state.orders.find(o => o.id === id);
                    if (!order) return state;

                    const updatedOrders = state.orders.filter(o => o.id !== id);

                    // Reconcile cash register if it was a cash payment
                    let updatedCashRegister = state.cashRegister;
                    if (order.status === 'Paid' && order.paymentMethod === 'Cash') {
                        const amountToSubtract = parseFloat((order.finalTotal !== undefined && order.finalTotal !== null) ? order.finalTotal : order.amount);
                        updatedCashRegister = {
                            ...state.cashRegister,
                            currentBalance: Math.max(0, state.cashRegister.currentBalance - amountToSubtract)
                        };
                    }
                    const updatedTables = order.tableId
                        ? state.tables.map(t =>
                            order.tableId.split(',').includes(t.id)
                                ? { ...t, status: 'Available' }
                                : t
                        )
                        : state.tables;

                    // Reconcile customer spend and order count
                    const updatedCustomers = order.customerName
                        ? state.customers.map(c =>
                            c.name === order.customerName
                                ? {
                                    ...c,
                                    totalSpend: order.status === 'Paid' ? Math.max(0, c.totalSpend - parseFloat(order.finalTotal || order.amount)) : c.totalSpend,
                                    totalOrders: Math.max(0, c.totalOrders - 1)
                                }
                                : c
                        )
                        : state.customers;

                    syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: updatedOrders });
                    syncChannel.postMessage({ type: 'SYNC_TABLES', payload: updatedTables });
                    syncChannel.postMessage({ type: 'SYNC_CUSTOMERS', payload: updatedCustomers });
                    syncChannel.postMessage({ type: 'SYNC_REGISTER', payload: updatedCashRegister });

                    return {
                        orders: updatedOrders,
                        tables: updatedTables,
                        customers: updatedCustomers,
                        cashRegister: updatedCashRegister,
                        logs: [...state.logs, `> Order ${id} removed locally`]
                    };
                });

                // Call backend for permanent removal
                try {
                    const response = await fetch(`/api/OfflineSync/order/${id}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Tenant-ID': get().currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : get().currentTenantId,
                            'Authorization': `Bearer ${get().token}`
                        }
                    });

                    if (response.ok) {
                        set(state => ({
                            logs: [...state.logs, `> Order ${id} deleted from server`]
                        }));
                    } else {
                        const errorText = await response.text();
                        set((state) => ({
                            logs: [...state.logs, `! Server delete failed for order ${id}: ${errorText || response.statusText}`]
                        }));
                        console.error('Failed to delete order from server:', errorText || response.statusText);
                    }
                } catch (error) {
                    set((state) => ({
                        logs: [...state.logs, `! Error deleting order ${id}: ${error.message}`]
                    }));
                    console.error('Failed to delete order from server:', error);
                }
            },



            updateCustomer: (id, updates) => set((state) => {
                const customers = state.customers.map(c => c.id === id ? { ...c, ...updates } : c);
                syncChannel.postMessage({ type: 'SYNC_CUSTOMERS', payload: customers });
                return {
                    customers,
                    logs: [...state.logs, `> Customer ${id} data updated`]
                };
            }),

            deleteCustomer: async (id) => {
                set((state) => {
                    const customer = state.customers.find(c => c.id === id);
                    if (!customer) return state;

                    const name = customer.name.toLowerCase().trim();

                    // Purge orders
                    const updatedOrders = state.orders.filter(o =>
                        !o.customerName ||
                        o.customerName.toLowerCase().trim() !== name
                    );

                    // Purge reservations
                    const updatedReservations = state.reservations.filter(r =>
                        !r.customerName ||
                        r.customerName.toLowerCase().trim() !== name
                    );

                    const updatedCustomers = state.customers.filter(c => c.id !== id);

                    syncChannel.postMessage({ type: 'SYNC_CUSTOMERS', payload: updatedCustomers });
                    syncChannel.postMessage({ type: 'SYNC_ORDERS', payload: updatedOrders });
                    syncChannel.postMessage({ type: 'SYNC_RESERVATIONS', payload: updatedReservations });

                    return {
                        customers: updatedCustomers,
                        orders: updatedOrders,
                        reservations: updatedReservations,
                        logs: [...state.logs, `> Customer ${customer.name} and all associated data purged`]
                    };
                });

                // Call backend for permanent removal
                try {
                    await fetch(`/api/OfflineSync/customer/${id}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Tenant-ID': get().currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : get().currentTenantId,
                            'Authorization': `Bearer ${get().token}`
                        }
                    });
                } catch (error) {
                    console.error('Failed to delete customer from server:', error);
                }
            },

            // Reservation Actions
            addReservation: (resData) => set((state) => {
                const reservations = [...state.reservations, {
                    ...resData,
                    id: `RES-${Math.floor(Math.random() * 10000)}`,
                    tenantId: state.currentTenantId,
                    status: 'Confirmed',
                    createdAt: new Date().toISOString()
                }];
                syncChannel.postMessage({ type: 'SYNC_RESERVATIONS', payload: reservations });
                return {
                    reservations,
                    logs: [...state.logs, `> Table ${resData.tableId} reserved for ${resData.customerName} on ${resData.date}`]
                };
            }),
            deleteReservation: (id) => set((state) => {
                const reservations = state.reservations.filter(r => r.id !== id);
                syncChannel.postMessage({ type: 'SYNC_RESERVATIONS', payload: reservations });
                return {
                    reservations,
                    logs: [...state.logs, `> Reservation ${id} cancelled`]
                };
            }),

            updateReservation: (id, updates) => set((state) => {
                const reservations = state.reservations.map(r => r.id === id ? { ...r, ...updates } : r);
                syncChannel.postMessage({ type: 'SYNC_RESERVATIONS', payload: reservations });
                return { reservations };
            }),

            // Tenant Actions
            addTenant: (tenant) => set((state) => ({
                tenants: [...state.tenants, { ...tenant, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
                logs: [...state.logs, `> Added new tenant: ${tenant.name}`]
            })),

            updateTenant: (id, updates) => set((state) => ({
                tenants: state.tenants.map(t => t.id === id ? { ...t, ...updates } : t),
                logs: [...state.logs, `> Updated tenant details: ${id}`]
            })),

            deleteTenant: (id) => set((state) => {
                const updatedTenants = state.tenants.filter(t => t.id !== id);
                let newActiveTenant = state.currentTenantId;

                // If we deleted the active tenant, pick another one or reset
                if (state.currentTenantId === id) {
                    newActiveTenant = updatedTenants.length > 0 ? updatedTenants[0].id : '';
                }

                return {
                    tenants: updatedTenants,
                    currentTenantId: newActiveTenant,
                    logs: [...state.logs, `> Deleted tenant: ${id}`]
                };
            }),

            setBrandingLocal: (updates) => set((state) => ({
                branding: { ...state.branding, ...updates }
            })),

            updateBranding: async (updates) => {
                const tid = get().currentTenantId;
                console.log('[useStore] Updating branding for tenant:', tid, 'with:', updates);

                if (!tid) {
                    console.error('[useStore] Cannot update branding: currentTenantId is missing');
                    throw new Error('Tenant identification is missing in the application state.');
                }

                try {
                    // Update locally first for immediate feedback
                    set((state) => ({
                        branding: { ...state.branding, ...updates },
                        logs: [...state.logs, `> Branding updated: ${Object.keys(updates).join(', ')}`]
                    }));

                    // Prepare PascalCase payload for C# backend if needed
                    const payload = {
                        AppName: updates.appName,
                        LogoUrl: updates.logoUrl,
                        PrimaryColor: updates.primaryColor,
                        SecondaryColor: updates.secondaryColor,
                        ThemeMode: updates.themeMode,
                        WiseHandle: updates.wiseHandle,
                        RevolutHandle: updates.revolutHandle,
                        CardPaymentUrl: updates.cardPaymentUrl
                    };

                    // Persist to backend
                    const tidHeader = tid.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : tid;
                    const response = await fetch('/api/Settings/branding', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${get().user.token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('[useStore] Branding update failed:', response.status, errorText);
                        throw new Error(`Failed to save to backend: ${response.status} ${errorText}`);
                    }
                } catch (error) {
                    set((state) => ({ logs: [...state.logs, `! Error saving branding: ${error.message}`] }));
                    console.error('[useStore] Error in updateBranding:', error);
                    throw error;
                }
            },

            uploadLogo: async (file) => {
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('/api/Settings/upload-logo', {
                        method: 'POST',
                        headers: {
                            'X-Tenant-ID': get().currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : get().currentTenantId,
                            'Authorization': `Bearer ${get().user.token}`
                        },
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const baseUrl = '';
                        const absoluteUrl = data.logoUrl.startsWith('/uploads') ? `${baseUrl}${data.logoUrl}` : data.logoUrl;

                        set((state) => ({
                            branding: { ...state.branding, logoUrl: absoluteUrl },
                            logs: [...state.logs, `> Logo uploaded successfully: ${absoluteUrl}`]
                        }));
                        return absoluteUrl;
                    } else {
                        const errorText = await response.text();
                        set((state) => ({
                            logs: [...state.logs, `! Upload failed: ${errorText || response.statusText}`]
                        }));
                        throw new Error(errorText || 'Upload failed');
                    }
                } catch (error) {
                    set((state) => ({
                        logs: [...state.logs, `! Error uploading logo: ${error.message}`]
                    }));
                    throw error;
                }
            },

            syncOrders: async () => {
                const { orders, currentTenantId, deviceId, addLog, user } = get();
                const token = sessionStorage.getItem('omnipos_token');

                // Standardize Tenant ID for production filter
                const targetTenant = (currentTenantId && currentTenantId.includes('-'))
                    ? currentTenantId
                    : '00000000-0000-0000-0000-000000001111';

                const unsynced = orders.filter(o => o.syncStatus === 'Offline' && (o.tenantId === targetTenant || o.tenantId === 'tenant-1'));

                if (unsynced.length === 0) {
                    addLog("No offline orders found to sync.");
                    return;
                }

                addLog(`Sync engine: Preparing ${unsynced.length} orders...`);

                const payload = unsynced.map(o => {
                    const tableNum = o.tableId
                        ? o.tableId.split(',').filter(Boolean).map(tid => get().tables.find(t => t.id === tid)?.num).join(', ')
                        : 'Walk-in';

                    return {
                        orderId: o.id,
                        staffId: null, // 'U1' is not a valid GUID, setting to null for MVP
                        customerName: o.customerName || 'Walk-in',
                        tableId: o.tableId,
                        tableNumber: tableNum,
                        totalAmount: parseFloat(o.amount),
                        status: o.status,
                        metadataJson: JSON.stringify(o.items),
                        notes: o.notes || '',
                        pendingAmendmentsJson: JSON.stringify(o.pendingAmendments || []),
                        vectorClock: JSON.stringify(o.clock),
                        createdAt: o.createdAt,
                        discountReason: o.discountReason || '',
                        serviceCharge: parseFloat(o.serviceCharge || 0),
                        discount: parseFloat(o.discount || 0),
                        discountType: o.discountType || 'none',
                        finalTotal: (o.finalTotal !== undefined && o.finalTotal !== null) ? parseFloat(o.finalTotal) : parseFloat(o.amount),
                        paidAt: o.paidAt || null,
                        isAmended: o.isAmended || false
                    };
                });

                console.log('[useStore] Final Sync Payload:', payload);
                addLog(`Sync engine: Posting to /api/OfflineSync/sync-orders...`);

                try {
                    const response = await fetch('/api/OfflineSync/sync-orders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId,
                            'Authorization': `Bearer ${user.token || token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    addLog(`Sync HTTP Status: ${response.status} ${response.statusText}`);

                    if (response.ok) {
                        const results = await response.json();
                        addLog(`Sync Result: ${results.length} server acknowledgments received.`);

                        set((state) => ({
                            orders: state.orders.map(o => {
                                const result = results.find(r => r.orderId === o.id);
                                if (result && result.status !== 'Conflict - Server Wins') {
                                    return {
                                        ...o,
                                        syncStatus: 'Synchronized',
                                        clock: { ...o.clock, [deviceId]: (o.clock[deviceId] || 0) + 1 }
                                    };
                                }
                                return o;
                            })
                        }));
                        addLog("Sync complete. State reconciled.");
                    } else {
                        const errText = await response.text();
                        addLog(`Sync rejected: ${errText.slice(0, 50)}...`);
                        throw new Error(errText);
                    }
                } catch (error) {
                    addLog(`Sync fatal error: ${error.message}`);
                }
            },

            // Fetch tables from backend
            fetchTables: async () => {
                const token = get().token;
                const currentTenantId = get().currentTenantId;
                if (!token || !currentTenantId) return;

                try {
                    const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;
                    console.log('[fetchTables] Fetching with Tenant:', tidHeader, 'Role:', get().user?.role);
                    const response = await fetch('/api/table', {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const mappedTables = data.map(t => ({
                            id: t.restaurantTableId,
                            num: t.tableNumber,
                            pos: { x: t.posX, y: t.posY },
                            status: t.status,
                            cap: t.capacity,
                            shape: 'Square'
                        }));
                        set({ tables: mappedTables });
                    }
                } catch (error) {
                    console.error('Failed to fetch tables:', error);
                }
            },

            fetchNotifications: async () => {
                const { token, currentTenantId } = get();
                if (!token) return;
                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;
                try {
                    const response = await fetch('/api/notification', {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        }
                    });
                    if (response.ok) {
                        set({ notifications: await response.json() });
                    }
                } catch (error) {
                    console.error('Failed to fetch notifications:', error);
                }
            },

            markNotificationRead: async (id) => {
                const { token, currentTenantId } = get();
                if (!token) return;
                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;
                try {
                    await fetch(`/api/notification/${id}/read`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'X-Tenant-ID': tidHeader
                        }
                    });
                    set((state) => ({
                        notifications: state.notifications.map(n =>
                            (n.notificationId === id || n.id === id) ? { ...n, isRead: true } : n
                        )
                    }));
                } catch (error) {
                    console.error('Failed to mark notification as read:', error);
                }
            },

            initSignalR: async () => {
                const token = get().token;
                const user = get().user;
                if (!token || !user) {
                    console.log('[SignalR] No token or user, skipping init');
                    return;
                }

                try {
                    const { HubConnectionBuilder, LogLevel } = await import('@microsoft/signalr');
                    const connection = new HubConnectionBuilder()
                        .withUrl('/hubs/notifications', {
                            accessTokenFactory: () => token
                        })
                        .withAutomaticReconnect()
                        .configureLogging(LogLevel.Information)
                        .build();

                    connection.on('ReceiveNotification', (notification) => {
                        console.log('[SignalR] Received notification:', notification);
                        get().addNotification(notification);
                    });

                    connection.on('ReceiveOrderUpdate', (data) => {
                        console.log('[SignalR] Order update received, fetching latest data...', data);
                        get().fetchOrders();
                    });

                    await connection.start();
                    console.log('[SignalR] Connected successfully');

                    // Join role-specific groups
                    const roleMapping = {
                        'Chef': 'Kitchen',
                        'Assistant Chef': 'Kitchen',
                        'Kitchen': 'Kitchen',
                        'Waiter': 'Waiter',
                        'Till': 'Till'
                    };
                    const effectiveRole = roleMapping[user.role] || user.role;
                    await connection.invoke('JoinRoleGroup', effectiveRole);
                    await connection.invoke('JoinTenantGroup');
                    console.log(`[SignalR] Joined groups: ${effectiveRole} and GlobalTenant`);

                    set({ hubConnection: connection });
                    // Listen for real-time table updates
                    connection.on('ReceiveTableUpdate', (action, data) => {
                        console.log(`[SignalR] Table ${action}:`, data);
                        const { fetchTables } = get();
                        // Instead of complex logic, let's just refetch to remain source-of-truth
                        fetchTables();
                    });

                    // Global notifications handler is already registered above via ReceiveNotification
                    // Removing redundant listener to prevent double notification state updates

                } catch (error) {
                    console.error('[SignalR] Connection failed:', error);
                }
            },

            fetchEmployees: async () => {
                const { currentTenantId, token } = get();
                if (!token) return;

                try {
                    const response = await fetch('/api/staff', {
                        headers: {
                            'X-Tenant-ID': currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId,
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (response.ok) {
                        const staffData = await response.json();
                        const employees = staffData.map(s => ({
                            id: s.staffId,
                            name: s.fullName,
                            username: s.username,
                            role: s.role,
                            email: s.email,
                            payRate: s.payRate || 0,
                            workingDays: JSON.parse(s.workingDays || '[]'),
                            status: s.status || 'Active'
                        }));
                        set({ employees });
                        console.log('[useStore] Synced employees from Staff API:', employees.length);
                    }
                } catch (error) {
                    console.error('[useStore] Failed to fetch employees:', error);
                }
            },

            addStaffAsync: async (staffData) => {
                const { token, currentTenantId, fetchEmployees, addLog } = get();
                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                // Sanitize staffData (e.g., ensure payRate is a valid number)
                const sanitizedData = {
                    ...staffData,
                    payRate: parseFloat(staffData.payRate) || 0
                };

                try {
                    const response = await fetch('/api/staff', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(sanitizedData)
                    });

                    if (response.ok) {
                        addLog(`Staff member ${sanitizedData.fullName} created successfully`);
                        await fetchEmployees();
                        return true;
                    } else {
                        const status = response.status;
                        const err = await response.text();
                        addLog(`Staff creation failed (${status}): ${err}`);
                        console.error(`[addStaffAsync] Server error ${status}:`, err);
                        return false;
                    }
                } catch (error) {
                    addLog(`Network error creating staff: ${error.message}`);
                    console.error('[addStaffAsync] Network error:', error);
                    return false;
                }
            },

            updateStaffRoleAsync: async (id, role, payRate, workingDays) => {
                const { token, currentTenantId, fetchEmployees, addLog } = get();
                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                try {
                    const response = await fetch(`/api/staff/${id}/role`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ role, payRate, workingDays })
                    });

                    if (response.ok) {
                        addLog(`Staff role updated successfully`);
                        await fetchEmployees();
                        return true;
                    } else {
                        const err = await response.text();
                        addLog(`Role update failed: ${err}`);
                        return false;
                    }
                } catch (error) {
                    addLog(`Network error updating role: ${error.message}`);
                    return false;
                }
            },

            changeStaffPasswordAsync: async (id, newPassword) => {
                const { token, currentTenantId, addLog } = get();
                const tidHeader = currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId;

                try {
                    const response = await fetch(`/api/staff/${id}/password`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ newPassword })
                    });

                    if (response.ok) {
                        addLog(`Staff password updated successfully`);
                        return true;
                    } else {
                        const err = await response.text();
                        addLog(`Password change failed: ${err}`);
                        return false;
                    }
                } catch (error) {
                    addLog(`Network error changing password: ${error.message}`);
                    return false;
                }
            },


            fetchOrders: async () => {
                const { currentTenantId, user, token } = get();
                try {
                    const response = await fetch('/api/OfflineSync/orders', {
                        headers: {
                            'X-Tenant-ID': currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId,
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (response.ok) {
                        const serverOrders = await response.json();
                        const mappedOrders = serverOrders.map(so => {
                            const itemsJson = so.metadataJson || so.MetadataJson || '[]';
                            const clockJson = so.vectorClock || so.VectorClock || '{}';
                            const totalAmount = so.totalAmount !== undefined ? so.totalAmount : so.TotalAmount;
                            let items = [];
                            try {
                                items = JSON.parse(itemsJson);
                                if (!Array.isArray(items)) items = [];
                            } catch (e) {
                                console.error('[useStore] Failed to parse items JSON:', itemsJson);
                            }

                            const mappedOrder = {
                                id: so.orderId || so.OrderId,
                                tenantId: currentTenantId,
                                customerName: so.customerName || so.CustomerName,
                                tableId: so.tableId || so.TableId,
                                amount: totalAmount?.toFixed?.(2) || totalAmount || '0.00',
                                status: so.workflowStatus || so.WorkflowStatus || so.status || so.Status,
                                syncStatus: 'Synchronized',
                                items: items,
                                notes: so.notes || so.Notes || '',
                                guestCount: so.guestCount || so.GuestCount || 1,
                                paymentMethod: so.paymentMethod || so.PaymentMethod || '',
                                pendingAmendments: JSON.parse(so.pendingAmendmentsJson || so.PendingAmendmentsJson || '[]'),
                                clock: JSON.parse(clockJson),
                                createdAt: so.createdAt || so.CreatedAt,
                                discountReason: so.discountReason || so.DiscountReason || '',
                                serviceCharge: parseFloat(so.serviceCharge || so.ServiceCharge || 0),
                                discount: parseFloat(so.discount || so.Discount || 0),
                                discountType: so.discountType || so.DiscountType || 'none',
                                finalTotal: (so.finalTotal !== undefined && so.finalTotal !== null) ? parseFloat(so.finalTotal) :
                                    (so.FinalTotal !== undefined && so.FinalTotal !== null) ? parseFloat(so.FinalTotal) : parseFloat(totalAmount || 0),
                                paidAt: so.paidAt || so.PaidAt || null,
                                isAmended: so.isAmended || so.IsAmended || false
                            };

                            if (mappedOrder.serviceCharge > 0 || mappedOrder.discount > 0) {
                                console.log(`[fetchOrders] Mapped order ${mappedOrder.id} with adjustments:`, {
                                    srv: mappedOrder.serviceCharge,
                                    disc: mappedOrder.discount,
                                    final: mappedOrder.finalTotal
                                });
                            }

                            // GUARD: If we have locally processed this amendment, ignore server's stale pending state
                            if (get().processedAmendmentIds.includes(mappedOrder.id)) {
                                if (mappedOrder.pendingAmendments && mappedOrder.pendingAmendments.length > 0) {
                                    mappedOrder.pendingAmendments = [];
                                    mappedOrder.syncStatus = 'Synchronized';
                                }
                            }
                            return mappedOrder;
                        });

                        // Clean up the guard list - remove IDs that are now clean on the server
                        const cleanServerIds = mappedOrders
                            .filter(mo => (!mo.pendingAmendments || mo.pendingAmendments.length === 0) && get().processedAmendmentIds.includes(mo.id))
                            .map(mo => mo.id);

                        if (cleanServerIds.length > 0) {
                            set(state => ({
                                processedAmendmentIds: state.processedAmendmentIds.filter(id => !cleanServerIds.includes(id))
                            }));
                        }

                        set((state) => {
                            const localOffline = state.orders.filter(o => o.syncStatus === 'Offline');

                            // SIMPLIFIED: Always accept server state as source of truth
                            // Only keep local orders that aren't on server yet
                            const serverOrderIds = mappedOrders.map(mo => mo.id);
                            const remainingOffline = localOffline.filter(lo => !serverOrderIds.includes(lo.id));

                            // Merge: offline orders + all server orders
                            const merged = [...remainingOffline, ...mappedOrders];
                            merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                            console.log('[fetchOrders] Updated orders:', merged.length, 'total');
                            return { orders: merged };
                        });
                    }
                } catch (error) {
                    console.error('Failed to fetch orders:', error);
                }
            },

            updateBranding: async (updates) => {
                const { currentTenantId, token } = get();
                console.log('[useStore] Updating branding for tenant:', currentTenantId, 'with:', updates);

                if (!currentTenantId) {
                    console.error('[useStore] Cannot update branding: currentTenantId is missing');
                    throw new Error('Tenant identification is missing in the application state.');
                }
                set((state) => ({
                    branding: { ...state.branding, ...updates },
                    logs: [...state.logs, `> Branding updated locally`]
                }));

                const tid = currentTenantId;
                const payload = {
                    tenantId: tid,
                    appName: get().branding.appName,
                    primaryColor: get().branding.primaryColor,
                    secondaryColor: get().branding.secondaryColor,
                    themeMode: get().branding.themeMode,
                    logoUrl: get().branding.logoUrl
                };

                try {
                    const tidHeader = tid.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : tid;
                    const response = await fetch('/api/Settings/branding', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Tenant-ID': tidHeader,
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('[useStore] Branding update failed:', response.status, errorText);
                        throw new Error(`Failed to save to backend: ${response.status} ${errorText}`);
                    }
                } catch (error) {
                    set((state) => ({ logs: [...state.logs, `! Error saving branding: ${error.message}`] }));
                    console.error('[useStore] Error in updateBranding:', error);
                    throw error;
                }
            },

            uploadLogo: async (file) => {
                const { currentTenantId, token } = get();
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('/api/Settings/upload-logo', {
                        method: 'POST',
                        headers: {
                            'X-Tenant-ID': currentTenantId?.includes?.('tenant') ? '00000000-0000-0000-0000-000000001111' : currentTenantId,
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const baseUrl = '';
                        const absoluteUrl = data.logoUrl.startsWith('/uploads') ? `${baseUrl}${data.logoUrl}` : data.logoUrl;

                        set((state) => ({
                            branding: { ...state.branding, logoUrl: absoluteUrl },
                            logs: [...state.logs, `> Logo uploaded successfully: ${absoluteUrl}`]
                        }));
                        return absoluteUrl;
                    } else {
                        const errorText = await response.text();
                        set((state) => ({
                            logs: [...state.logs, `! Upload failed: ${errorText || response.statusText}`]
                        }));
                        throw new Error(errorText || 'Upload failed');
                    }
                } catch (error) {
                    set((state) => ({
                        logs: [...state.logs, `! Error uploading logo: ${error.message}`]
                    }));
                    throw error;
                }
            },

            employees: [],
            staffingRequirements: [
                { id: 'REQ1', role: 'Waiter', day: 'Mon', minStaff: 3, startTime: '17:00', endTime: '22:00' },
                { id: 'REQ2', role: 'Chef', day: 'Mon', minStaff: 2, startTime: '12:00', endTime: '22:00' },
            ],
            updateStaffingRequirement: (id, updates) => set((state) => ({
                staffingRequirements: state.staffingRequirements.map(r => r.id === id ? { ...r, ...updates } : r)
            })),
            addStaffingRequirement: (req) => set((state) => {
                const days = req.applyToAll ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : [req.day];
                const newReqs = days.map(day => ({
                    ...req,
                    id: `REQ${Date.now()}-${day}`,
                    day,
                    applyToAll: undefined
                }));
                const filtered = state.staffingRequirements.filter(sr =>
                    !newReqs.some(nr => nr.day === sr.day && nr.role === sr.role && nr.startTime === sr.startTime)
                );
                return { staffingRequirements: [...filtered, ...newReqs] };
            }),

            hubConnection: null,
            activeOrderId: null
        }),
        {
            name: 'omnipos-storage-v3', // Forced reset for staffing logic
            storage: createJSONStorage(() => sessionStorage),
        }
    )
);

// Synchronization Listener for Multi-Tab Support
syncChannel.onmessage = (event) => {
    const { type, payload } = event.data;
    const store = useStore.getState();

    switch (type) {
        case 'SYNC_ORDERS':
            useStore.setState({ orders: payload });
            break;
        case 'SYNC_TABLES':
            useStore.setState({ tables: payload });
            break;
        case 'SYNC_NOTIFICATIONS':
            useStore.setState({ notifications: payload });
            break;
        case 'SYNC_CUSTOMERS':
            useStore.setState({ customers: payload });
            break;
        case 'SYNC_RESERVATIONS':
            useStore.setState({ reservations: payload });
            break;
        case 'SYNC_REGISTER':
            useStore.setState({ cashRegister: payload });
            break;
        default:
            break;
    }
};
