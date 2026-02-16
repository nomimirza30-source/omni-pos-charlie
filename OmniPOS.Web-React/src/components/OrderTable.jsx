import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { QrCode, Cloud, CloudOff, User, Users, MapPin, Eye, CheckCircle2, XCircle, Timer, Edit3, Plus, Minus, Trash2, Save, Send, PackageCheck, Banknote, CreditCard, ArrowLeft, Clock, Printer, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';
import { generateReceipt } from '../utils/receiptGenerator';
import QRCode from 'qrcode';

const OrderTable = () => {
    const { orders, currentTenantId, tables, user, updateOrderStatus, updateOrder, deleteOrder, menuItems, completePayment, fetchOrders, syncOrders, branding, proposeAmendment, respondToAmendment, activeOrderId, updateOrderFinancials } = useStore();
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [qrError, setQrError] = useState(null);

    React.useEffect(() => {
        if (activeOrderId) {
            const targetOrder = orders.find(o => o.id === activeOrderId);
            if (targetOrder) {
                setSelectedOrder(targetOrder);
                // Clear the active ID so it doesn't re-trigger
                useStore.setState({ activeOrderId: null });
            }
        }
    }, [activeOrderId, orders]);

    React.useEffect(() => {
        // Initial fetch when component mounts
        fetchOrders();
        syncOrders();
        // Global polling is now handled in App.jsx
    }, []);
    const [isAmendMode, setIsAmendMode] = useState(false);
    const [isPaymentMode, setIsPaymentMode] = useState(false);
    const [paymentSubMethod, setPaymentSubMethod] = useState(null);
    const [cashReceived, setCashReceived] = useState('');
    const [wiseQRCode, setWiseQRCode] = useState(null);
    const qrCanvasRef = useRef(null);
    const [amendedItems, setAmendedItems] = useState([]);

    // Payment Adjustments State
    const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
    const [serviceChargePercent, setServiceChargePercent] = useState(10);
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [discountType, setDiscountType] = useState('percentage'); // 'percentage' or 'amount'
    const [discountValue, setDiscountValue] = useState(0);
    const [discountReason, setDiscountReason] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showMenuSearch, setShowMenuSearch] = useState(false);

    const currentOrders = orders.filter(o => o.tenantId === currentTenantId && o.status !== 'Paid');

    console.log('[OrderTable] Current Tenant:', currentTenantId);
    console.log('[OrderTable] All Orders:', orders);
    console.log('[OrderTable] Filtered Orders:', currentOrders);

    const orderInStore = orders.find(o => o.id === selectedOrder?.id);
    const displayOrder = orderInStore || selectedOrder;

    const handleQR = (id) => {
        alert(`Scan-to-Pay Link Generated for ${id}\n\nhttps://pay.omnipos.com/checkout?order=${id}&sig=HMAC_SHA256_SIGNED_PAYLOAD`);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Amended-Preparing':
            case 'Preparing': return 'bg-primary/10 text-primary border-primary/20';
            case 'Amended-Ready':
            case 'Ready': return 'bg-success/10 text-success border-success/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]';
            case 'Amended-Served':
            case 'Served': return 'bg-success/5 text-success/60 border-success/10';
            case 'Paid': return 'bg-success text-text border-success';
            case 'Declined':
            case 'Cancelled': return 'text-red-400 bg-red-400/10 border-red-400/20';
            default: return 'text-muted bg-glass/20 border-text/10';
        }
    };

    const startAmend = (order) => {
        console.log('[OrderTable] Amending Order:', order);
        setSelectedOrder(order);
        setAmendedItems([...(order.items || [])]);
        setIsAmendMode(true);
        setIsPaymentMode(false);
    };

    const startPayment = (order) => {
        setSelectedOrder(order);
        setIsPaymentMode(true);
        setIsAmendMode(false);
        setPaymentSubMethod(null);
        setCashReceived('');
        setWiseQRCode(null);
        // Reset payment adjustments
        setServiceChargeEnabled(false);
        setServiceChargePercent(10);
        setDiscountEnabled(false);
        setDiscountType('percentage');
        setDiscountValue(0);
        setDiscountReason('');
    };

    // Payment Calculations (must be before useEffect that uses finalTotal)
    const subtotal = selectedOrder ? parseFloat(selectedOrder.amount || 0) : 0;
    const serviceChargeAmount = serviceChargeEnabled ? subtotal * (serviceChargePercent / 100) : 0;

    // Role-based discount limits
    const maxDiscountPercent = (user?.role === 'Admin' || user?.role === 'Owner') ? 45 : 20;
    let discountAmount = 0;
    if (discountEnabled) {
        if (discountType === 'percentage') {
            const limitedPercent = Math.min(discountValue, maxDiscountPercent);
            discountAmount = subtotal * (limitedPercent / 100);
        } else {
            discountAmount = Math.min(parseFloat(discountValue) || 0, subtotal);
        }
    }

    const finalTotal = Math.max(0, subtotal + serviceChargeAmount - discountAmount);
    const changeDue = (cashReceived && selectedOrder) ? (parseFloat(cashReceived) - finalTotal) : 0;

    const [isSyncingFinancials, setIsSyncingFinancials] = useState(false);

    // Auto-Sync Financials to Server (Debounced)
    useEffect(() => {
        if (!isPaymentMode || !selectedOrder) return;

        const timer = setTimeout(async () => {
            setIsSyncingFinancials(true);
            await updateOrderFinancials(selectedOrder.id, {
                serviceCharge: serviceChargeAmount,
                discount: discountAmount,
                discountType: discountEnabled ? discountType : 'none',
                discountReason: discountEnabled ? discountReason : '',
                finalTotal: finalTotal
            });
            setIsSyncingFinancials(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [isPaymentMode, selectedOrder?.id, serviceChargeAmount, discountAmount, discountType, discountReason, finalTotal]);

    // Generate QR Code when Bank or Card payment is selected
    useEffect(() => {
        if ((paymentSubMethod === 'Bank' || paymentSubMethod === 'Card') && selectedOrder && qrCanvasRef.current) {
            setQrError(null);

            let baseUrl = branding?.cardPaymentUrl || window.location.origin;

            // FIX: If running on localhost, swap with actual LAN IP so phone can connect
            // For this specific debugging session, hardcoding the LAN IP
            baseUrl = 'http://192.168.1.100:5173';

            const qrUrl = `${baseUrl}/pay/${selectedOrder.id}`;

            console.log('[OrderTable] Generating Web QR:', qrUrl);

            QRCode.toCanvas(
                qrCanvasRef.current,
                qrUrl,
                {
                    width: 280,
                    margin: 2,
                    color: {
                        dark: '#334155',
                        light: '#ffffff'
                    },
                    errorCorrectionLevel: 'M'
                },
                (error) => {
                    if (error) {
                        console.error('QR Gen Error:', error);
                        setQrError('Failed to generate QR code');
                    }
                }
            );
        }
    }, [paymentSubMethod, selectedOrder, branding]);


    const handleProcessPayment = (method) => {
        const adjustments = {
            serviceCharge: serviceChargeAmount,
            discount: discountAmount,
            discountType: discountEnabled ? discountType : 'none',
            discountReason: discountEnabled ? discountReason : '',
            finalTotal: finalTotal
        };
        completePayment(selectedOrder.id, method, adjustments);
        setSelectedOrder(null);
        setIsPaymentMode(false);
    };

    const updateAmendedQty = (itemId, delta) => {
        setAmendedItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const newQty = Math.max(1, item.qty + delta);
                return { ...item, qty: newQty };
            }
            return item;
        }));
    };

    const removeItemFromAmended = (itemId) => {
        setAmendedItems(prev => prev.filter(i => i.id !== itemId));
    };

    const addItemToAmended = (product) => {
        const existing = amendedItems.find(i => i.id === product.id);
        if (existing) {
            updateAmendedQty(product.id, 1);
        } else {
            setAmendedItems(prev => [...prev, { ...product, id: product.id, name: product.name, price: product.price, qty: 1 }]);
        }
        setSearchTerm('');
        setShowMenuSearch(false);
    };

    const saveAmendment = () => {
        const amendments = [];

        // Items added or modified (quantity change)
        amendedItems.forEach(amended => {
            const original = selectedOrder.items.find(i => i.id === amended.id);
            if (!original || original.qty !== amended.qty) {
                // For simplicity in this POS, if quantity changes, we treat as a new "amendment item" entry
                // Usually better to have 'originalQty' vs 'newQty', but here we follow user's "add/delete" requirement
                amendments.push({ type: 'add', item: amended });
            }
        });

        // Items deleted
        selectedOrder.items.forEach(original => {
            if (!amendedItems.find(i => i.id === original.id)) {
                amendments.push({ type: 'delete', itemId: original.id });
            }
        });

        if (amendments.length > 0) {
            proposeAmendment(selectedOrder.id, amendments);
        }

        setIsAmendMode(false);
        setSelectedOrder(null);
    };

    return (
        <div className="glass-card rounded-3xl overflow-hidden bg-glass/40">
            <div className="p-6 border-b border-text/10 flex items-center justify-between bg-glass/20">
                <div>
                    <h2 className="text-xl font-bold text-text">
                        {['Kitchen', 'Chef', 'Assistant Chef'].includes(user.role) ? 'Kitchen Management (KDS)' : 'Digital POS Orders'}
                    </h2>
                    <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-1">
                        Active lifecycle tracking & settlement
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-[10px] font-black uppercase text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20 tracking-widest">
                        {currentOrders.length} Pending
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-muted text-[10px] uppercase font-black tracking-widest border-b border-text/10 bg-glass/40">
                            <th className="px-6 py-4">Order</th>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Table</th>
                            <th className="px-6 py-4">Items / Total</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence mode="popLayout">
                            {currentOrders.length === 0 ? (
                                <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <td colSpan="5" className="px-6 py-20 text-center">
                                        <div className="text-muted font-bold mb-2 italic">All orders settled!</div>
                                        <div className="text-[10px] text-muted/60 uppercase tracking-widest">Awaiting new transactions</div>
                                    </td>
                                </motion.tr>
                            ) : (
                                currentOrders.map((order) => (
                                    <motion.tr
                                        key={order.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                        className="group border-t border-text/10 hover:bg-glass/20 transition-all text-sm"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1.5 rounded-lg border ${getStatusColor(order.status)}`}>
                                                    {order.status.includes('Preparing') ? <Timer size={10} className="animate-spin" /> :
                                                        order.status.includes('Ready') ? <CheckCircle2 size={10} /> :
                                                            order.status.includes('Served') ? <CheckCircle2 size={10} /> :
                                                                <Clock size={10} />
                                                    }
                                                </div>
                                                <div className="font-bold text-text text-[10px]">{order.status}</div>
                                                {order.isAmended && (
                                                    <div className="bg-warning/20 text-warning text-[8px] font-black px-1.5 py-0.5 rounded border border-warning/30 uppercase tracking-tighter">
                                                        Amended
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-[8px] font-mono opacity-40 uppercase mt-1">{order.id.slice(0, 8)}...</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-text group-hover:text-primary transition-colors">
                                                {order.customerName || 'Walk-in'}
                                            </div>
                                            <div className="text-[9px] opacity-40 uppercase text-muted">{order.customerEmail || 'No Email'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-secondary font-black">
                                                <MapPin size={12} />
                                                {order.tableId?.split(',').filter(Boolean).map(tid => tables.find(t => t.id === tid)?.num).join(', ') || 'Walk-in'}
                                            </div>
                                            <div className="flex flex-col gap-1 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border ${getStatusColor(order.status)}`}>
                                                        {order.status}
                                                    </div>
                                                    {order.status === 'Paid' && order.paymentMethod && (
                                                        <div className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter bg-success/10 text-success border border-success/20">
                                                            Paid via {order.paymentMethod}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-[9px] text-muted font-black uppercase tracking-tight pl-0.5">
                                                    {order.guestCount || 1} Guests
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-text font-bold">{order.items?.length || 0} Items</div>
                                            <div className="text-[10px] text-muted font-black">£{order.amount}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end gap-2">
                                                {/* Common Action: View */}
                                                <button
                                                    onClick={() => { setSelectedOrder(order); setIsAmendMode(false); setIsPaymentMode(false); }}
                                                    className="p-2 bg-glass/20 hover:bg-primary/20 text-muted hover:text-primary rounded-xl transition-all"
                                                    title="View Order Details"
                                                >
                                                    <Eye size={18} />
                                                </button>

                                                {/* Unified Lifecycle Actions with Role Restrictions */}
                                                {(['Admin', 'Manager', 'Kitchen', 'Chef', 'Assistant Chef', 'Waiter', 'Server', 'Wait Staff', 'Till', 'Owner'].includes(user.role)) && (
                                                    <>
                                                        {/* Accept Action: Allow 'Placed' or 'Pending' for Kitchen/Admin/Owner */}
                                                        {((['Placed', 'Pending'].includes(order.status)) || (order.isAmended && order.status === 'Placed')) &&
                                                            (['Admin', 'Manager', 'Kitchen', 'Chef', 'Assistant Chef', 'Owner'].includes(user.role)) && (
                                                                <>
                                                                    <button
                                                                        onClick={() => updateOrderStatus(order.id, 'Declined')}
                                                                        className="p-2 bg-red-400/10 hover:bg-red-400/20 text-red-400 rounded-xl transition-all"
                                                                        title="Decline"
                                                                    >
                                                                        <XCircle size={18} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            console.log('[OrderTable] Accepting order:', order.id);
                                                                            // Backend handles auto-prefixing status if isAmended is true
                                                                            updateOrderStatus(order.id, 'Preparing');
                                                                        }}
                                                                        className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-xl hover:bg-primary/30 transition-all font-black text-[10px] uppercase shadow-lg shadow-primary/5"
                                                                    >
                                                                        Accept
                                                                    </button>
                                                                </>
                                                            )}
                                                        {(order.status === 'Preparing' || order.status === 'Amended-Preparing') && ['Admin', 'Manager', 'Kitchen', 'Chef', 'Assistant Chef', 'Owner'].includes(user.role) && (
                                                            <button
                                                                onClick={() => updateOrderStatus(order.id, 'Ready')}
                                                                className="flex items-center gap-2 px-3 py-1.5 bg-success/20 text-success border border-success/30 rounded-xl hover:bg-success/30 transition-all font-black text-[10px] uppercase"
                                                            >
                                                                <CheckCircle2 size={14} /> Ready
                                                            </button>
                                                        )}
                                                        {(order.status === 'Ready' || order.status === 'Amended-Ready') && ['Admin', 'Manager', 'Waiter', 'Server', 'Wait Staff', 'Owner'].includes(user.role) && (
                                                            <button
                                                                onClick={() => updateOrderStatus(order.id, 'Served')}
                                                                className="flex items-center gap-2 px-3 py-1.5 bg-success text-text rounded-xl hover:shadow-lg hover:shadow-success/20 transition-all font-black text-[10px] uppercase"
                                                            >
                                                                <CheckCircle2 size={14} /> Deliver
                                                            </button>
                                                        )}

                                                        {/* Amend is available for active orders for all staff */}
                                                        {['Placed', 'Preparing', 'Served'].includes(order.status) && (
                                                            <button
                                                                onClick={() => startAmend(order)}
                                                                className="p-2 bg-glass/20 hover:bg-primary/20 text-muted hover:text-primary rounded-xl transition-all"
                                                                title="Amend Order"
                                                            >
                                                                <Edit3 size={18} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {/* Delete Cancelled/Declined Orders (Admin, Owner, Manager only) */}
                                                {['Cancelled', 'Declined'].includes(order.status) && ['Admin', 'Owner', 'Manager'].includes(user.role) && (
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm('Permanently remove this cancelled order record?')) {
                                                                deleteOrder(order.id);
                                                            }
                                                        }}
                                                        className="p-2 bg-red-400/10 hover:bg-red-400/30 text-red-400 rounded-xl transition-all border border-red-400/20"
                                                        title="Permanent Delete"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}

                                                {/* Admin Only: Payment/Checkout */}
                                                {(user.role === 'Admin' || user.role === 'Till' || user.role === 'Manager') && (order.status === 'Served' || order.status === 'Amended-Served') && (
                                                    <button
                                                        onClick={() => startPayment(order)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-slate-900 rounded-xl hover:shadow-lg hover:shadow-secondary/20 transition-all font-black text-[10px] uppercase animate-pulse"
                                                        title="Settle Order"
                                                    >
                                                        <Banknote size={16} /> Pay
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* View/Amend/Payment Modal */}
            <Modal
                isOpen={!!selectedOrder}
                onClose={() => {
                    setSelectedOrder(null);
                    setIsAmendMode(false);
                    setIsPaymentMode(false);
                    setPaymentSubMethod(null);
                    setCashReceived('');
                }}
                title={isAmendMode ? "Amend Digital Order" : isPaymentMode ? "SETTLE TRANSACTION (DEBUG MODE)" : "Digital Order Details"}
            >
                {displayOrder && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-start border-b border-text/10 pb-4">
                            <div>
                                <h3 className="font-black text-xl text-text">{displayOrder.customerName || 'Walk-in'}</h3>
                                <p className="text-xs text-muted">{displayOrder.customerEmail || 'No email'}</p>
                            </div>
                            <div className="text-right">
                                <span className="block text-primary font-black text-sm uppercase">
                                    {displayOrder.tableId?.split(',').filter(Boolean).map(tid => tables.find(t => t.id === tid)?.num).join(', ') || 'Walk-in'}
                                </span>
                                <span className="block text-[9px] text-muted font-black mt-0.5">{displayOrder.guestCount || 1} Guests</span>
                                <span className="block text-[8px] text-muted/60 font-mono mt-0.5">{displayOrder.createdAt ? new Date(displayOrder.createdAt).toLocaleTimeString() : 'Recent'}</span>
                                <button
                                    onClick={() => generateReceipt(displayOrder, branding)}
                                    className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-glass/20 hover:bg-primary/20 text-[9px] font-black uppercase text-muted hover:text-primary rounded-lg transition-all border border-text/10"
                                >
                                    <PackageCheck size={12} /> Print Receipt
                                </button>
                            </div>
                        </div>

                        {displayOrder.notes && (
                            <div className="bg-warning/10 border border-warning/20 p-4 rounded-2xl">
                                <h4 className="text-[10px] font-black text-warning uppercase tracking-widest mb-1">Special Instructions</h4>
                                <p className="text-sm text-text italic">"{displayOrder.notes}"</p>
                            </div>
                        )}


                        {!isPaymentMode && (
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-black text-muted uppercase tracking-widest pl-1">
                                    {isAmendMode ? "Edit Items & Quantities" : "Items Ordered"}
                                </h4>

                                {isAmendMode && (
                                    <div className="relative mb-4">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Search menu to add new items..."
                                                className="flex-1 bg-glass/20 border border-text/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    setSearchTerm(e.target.value);
                                                    setShowMenuSearch(e.target.value.length > 0);
                                                }}
                                                onFocus={() => searchTerm.length > 0 && setShowMenuSearch(true)}
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => { setSearchTerm(''); setShowMenuSearch(false); }}
                                                    className="px-3 bg-glass/20 hover:bg-glass/40 rounded-xl text-xs font-bold transition-all"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {showMenuSearch && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="absolute z-[100] left-0 right-0 mt-2 bg-slate-900/95 backdrop-blur-xl border border-text/10 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
                                                >
                                                    {menuItems.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                                                        <div className="p-4 text-center text-xs text-muted">No items found</div>
                                                    ) : (
                                                        menuItems
                                                            .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                                            .map(item => (
                                                                <button
                                                                    key={item.id}
                                                                    onClick={() => addItemToAmended(item)}
                                                                    className="w-full flex items-center gap-3 p-3 hover:bg-primary/10 transition-all border-b border-text/5 text-left"
                                                                >
                                                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-glass/20">
                                                                        <img src={item.image} className="w-full h-full object-cover" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="text-sm font-bold text-text">{item.name}</div>
                                                                        <div className="text-[10px] text-primary font-black">£{item.price.toFixed(2)}</div>
                                                                    </div>
                                                                    <Plus size={16} className="text-primary" />
                                                                </button>
                                                            ))
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <div className="bg-glass/20 rounded-2xl p-4 space-y-3">
                                    {(isAmendMode ? amendedItems : displayOrder.items)?.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm border-b border-text/10 last:border-0 pb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-glass/40 overflow-hidden">
                                                    <img src={menuItems.find(m => m.id === item.id)?.image} className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-text font-bold">{item.name}</span>
                                                        {item.spice && (
                                                            <span className={`text-[7px] font-black px-1 rounded uppercase border ${item.spice === 'Extra Spicy' ? 'bg-red-500/10 text-red-500 border-red-500/50' :
                                                                item.spice === 'Spicy' ? 'bg-orange-500/10 text-orange-500 border-orange-500/50' :
                                                                    item.spice === 'Medium' ? 'bg-warning/10 text-warning border-warning/50' :
                                                                        'bg-success/10 text-success border-success/50'
                                                                }`}>
                                                                {item.spice}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-muted">Unit Price: £{item.price.toFixed(2)}</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                {isAmendMode ? (
                                                    <div className="flex items-center gap-2">
                                                        {(!selectedOrder || selectedOrder.status !== 'Served' || !selectedOrder.items.find(i => i.id === item.id)) && (
                                                            <button onClick={() => updateAmendedQty(item.id, -1)} className="p-1 hover:bg-red-500/20 text-muted hover:text-red-400 rounded-md transition-all"><Minus size={14} /></button>
                                                        )}
                                                        <span className="font-black text-text px-2 mb-0.5">{item.qty}</span>
                                                        <button onClick={() => updateAmendedQty(item.id, 1)} className="p-1 hover:bg-success/20 text-muted hover:text-success rounded-md transition-all"><Plus size={14} /></button>
                                                        {(!selectedOrder || selectedOrder.status !== 'Served' || !selectedOrder.items.find(i => i.id === item.id)) && (
                                                            <button onClick={() => removeItemFromAmended(item.id)} className="ml-2 p-1 text-muted hover:text-red-400"><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-right">
                                                        <span className="font-black text-primary">x{item.qty}</span>
                                                        <div className="font-mono text-[10px] text-muted">£{(item.price * item.qty).toFixed(2)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isAmendMode && amendedItems.length === 0 && (
                                        <div className="text-center py-4 text-muted italic">No items in amended order.</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pending Amendments Section (Approval UI) */}
                        {displayOrder.pendingAmendments?.length > 0 && !isAmendMode && !isPaymentMode && (
                            <div className="space-y-3 animate-in fade-in zoom-in duration-300">
                                <div className="flex items-center justify-between pl-1">
                                    <h4 className="text-[10px] font-black text-warning uppercase tracking-widest flex items-center gap-2">
                                        <Timer size={12} className="animate-pulse" /> Pending Approval
                                    </h4>
                                    <span className="text-[8px] bg-warning/20 text-warning px-2 py-0.5 rounded-full font-black uppercase">
                                        Proposed Changes
                                    </span>
                                </div>

                                <div className="bg-warning/5 border border-warning/20 rounded-2xl p-4 space-y-2">
                                    {displayOrder.pendingAmendments.map((amend, idx) => (
                                        <div key={idx} className={`flex justify-between items-center p-2 rounded-lg border ${amend.type === 'add' ? 'bg-success/10 border-success/30' : 'bg-red-500/10 border-red-500/30 line-through opacity-60'}`}>
                                            <div className="flex items-center gap-2">
                                                {amend.type === 'add' ? <Plus size={12} className="text-success" /> : <Minus size={12} className="text-red-400" />}
                                                <span className="text-xs font-bold text-text">
                                                    {amend.type === 'add' ? `${amend.item.name} (x${amend.item.qty})` :
                                                        displayOrder.items.find(i => i.id === amend.itemId)?.name || 'Removed Item'}
                                                </span>
                                            </div>
                                            <span className="text-[9px] font-black opacity-60">
                                                {amend.type === 'add' ? `+£${(amend.item.price * amend.item.qty).toFixed(2)}` : 'REMOVAL'}
                                            </span>
                                        </div>
                                    ))}

                                    {/* Action Buttons for Kitchen/Admin/Manager/Owner */}
                                    {(['Kitchen', 'Chef', 'Assistant Chef', 'Admin', 'Manager', 'Owner'].includes(user.role)) && (
                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <button
                                                onClick={() => respondToAmendment(displayOrder.id, false)}
                                                className="py-2.5 bg-red-400/20 text-red-400 font-black text-[10px] uppercase rounded-xl border border-red-400/30 hover:bg-red-400/30 transition-all"
                                            >
                                                Decline
                                            </button>
                                            <button
                                                onClick={() => respondToAmendment(displayOrder.id, true)}
                                                className="py-2.5 bg-success text-text font-black text-[10px] uppercase rounded-xl shadow-lg shadow-success/20 hover:scale-[1.02] transition-all"
                                            >
                                                Approve
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {!isPaymentMode && (
                            <div className="flex justify-between items-center bg-primary/10 p-5 rounded-2xl border border-primary/20">
                                <span className="font-black text-muted text-xs uppercase">
                                    {isAmendMode ? "Amended Total" : "Grand Total Due"}
                                </span>
                                <span className="text-2xl font-black text-primary">
                                    £{isAmendMode
                                        ? amendedItems.reduce((sum, i) => sum + (i.price * i.qty), 0).toFixed(2)
                                        : displayOrder.amount}
                                </span>
                            </div>
                        )}

                        {/* Main Settlement Action */}
                        {(displayOrder.status === 'Served' || displayOrder.status === 'Amended-Served') && !isPaymentMode && (
                            <button
                                onClick={() => startPayment(displayOrder)}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-primary/20 transition-all group overflow-hidden relative"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                <CreditCard size={20} />
                                <span>PROCEED TO PAYMENT</span>
                            </button>
                        )}

                        {/* Payment Modal */}
                        {isPaymentMode && (
                            <div className="space-y-4">
                                <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
                                    <h3 className="text-lg font-black text-primary uppercase tracking-wide flex items-center gap-2">
                                        <Banknote size={20} />
                                        Payment Breakdown
                                    </h3>

                                    {/* Subtotal */}
                                    <div className="flex justify-between items-center pb-3 border-b border-primary/10">
                                        <span className="text-sm font-bold text-muted">Subtotal</span>
                                        <span className="text-lg font-black text-text">£{subtotal.toFixed(2)}</span>
                                    </div>

                                    {/* Service Charge */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="serviceCharge"
                                                checked={serviceChargeEnabled}
                                                onChange={(e) => setServiceChargeEnabled(e.target.checked)}
                                                className="w-5 h-5 accent-primary cursor-pointer"
                                            />
                                            <label htmlFor="serviceCharge" className="text-sm font-bold text-text cursor-pointer flex-1">
                                                Service Charge
                                            </label>
                                            {serviceChargeEnabled && (
                                                <span className="text-sm font-black text-success">+£{serviceChargeAmount.toFixed(2)}</span>
                                            )}
                                        </div>
                                        {serviceChargeEnabled && (
                                            <div className="flex items-center gap-2 pl-8">
                                                <input
                                                    type="number"
                                                    value={serviceChargePercent}
                                                    onChange={(e) => setServiceChargePercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                                    className="w-20 px-3 py-2 bg-white border border-primary/20 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                />
                                                <span className="text-sm font-bold text-muted">%</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Discount */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="discount"
                                                checked={discountEnabled}
                                                onChange={(e) => setDiscountEnabled(e.target.checked)}
                                                className="w-5 h-5 accent-warning cursor-pointer"
                                            />
                                            <label htmlFor="discount" className="text-sm font-bold text-text cursor-pointer flex-1">
                                                Discount
                                            </label>
                                            {discountEnabled && (
                                                <span className="text-sm font-black text-warning">-£{discountAmount.toFixed(2)}</span>
                                            )}
                                        </div>
                                        {discountEnabled && (
                                            <div className="pl-8 space-y-3">
                                                {/* Discount Type Selector */}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setDiscountType('percentage')}
                                                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase transition-all ${discountType === 'percentage'
                                                            ? 'bg-warning text-text shadow-lg'
                                                            : 'bg-warning/20 text-warning border border-warning/30'
                                                            }`}
                                                    >
                                                        Percentage
                                                    </button>
                                                    <button
                                                        onClick={() => setDiscountType('amount')}
                                                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase transition-all ${discountType === 'amount'
                                                            ? 'bg-warning text-text shadow-lg'
                                                            : 'bg-warning/20 text-warning border border-warning/30'
                                                            }`}
                                                    >
                                                        Amount
                                                    </button>
                                                </div>

                                                {/* Discount Input */}
                                                <div className="flex items-center gap-2">
                                                    {discountType === 'amount' && <span className="text-sm font-bold text-muted">£</span>}
                                                    <input
                                                        type="number"
                                                        value={discountValue}
                                                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                                        className="flex-1 px-3 py-2 bg-white border border-warning/20 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-warning/50"
                                                        min="0"
                                                        max={discountType === 'percentage' ? maxDiscountPercent : subtotal}
                                                        step={discountType === 'percentage' ? '1' : '0.01'}
                                                    />
                                                    {discountType === 'percentage' && <span className="text-sm font-bold text-muted">%</span>}
                                                </div>

                                                {/* Role-based Limit Warning */}
                                                {/* Role-based Limit Warning - Hide for Admin/Owner/Manager/Till */}
                                                {/* Discount Reason Input */}
                                                <div className="mt-4">
                                                    <label className="text-[10px] font-black uppercase text-muted mb-2 block">Reason for Discount</label>
                                                    <textarea
                                                        className="w-full bg-white border border-warning/20 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-warning/50"
                                                        placeholder="Enter reason for applying discount..."
                                                        value={discountReason}
                                                        onChange={(e) => setDiscountReason(e.target.value)}
                                                        rows={2}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Final Total */}
                                    <div className="flex justify-between items-center pt-3 border-t-2 border-primary/30">
                                        <div className="flex flex-col">
                                            <span className="text-base font-black text-primary uppercase">Final Total</span>
                                            {isSyncingFinancials && (
                                                <span className="text-[10px] text-muted animate-pulse font-bold tracking-widest uppercase">
                                                    Syncing...
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-3xl font-black text-primary">£{finalTotal.toFixed(2)}</span>
                                    </div>

                                    {/* Print Bill Button */}
                                    <div className="mt-4">
                                        <button
                                            onClick={() => {
                                                // Create a temporary order object with current payment details
                                                const billPreview = {
                                                    ...displayOrder,
                                                    serviceCharge: serviceChargeAmount,
                                                    discount: discountAmount,
                                                    discountType: discountType,
                                                    discountReason: discountReason,
                                                    finalTotal: finalTotal,
                                                    amount: subtotal,
                                                    status: 'Pending Payment'
                                                };
                                                generateReceipt(billPreview, branding);
                                            }}
                                            className="w-full bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/30 font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                            title="Print bill for customer review before payment"
                                        >
                                            <Printer size={20} />
                                            <span>PRINT BILL</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Payment Method Selection or Cash Calculator */}
                                {!paymentSubMethod ? (
                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            onClick={() => setPaymentSubMethod('Cash')}
                                            className="bg-success text-text font-black py-4 rounded-xl flex flex-col items-center justify-center gap-2 shadow-lg shadow-success/20 hover:scale-[1.02] transition-all"
                                        >
                                            <Banknote size={24} />
                                            <span>CASH</span>
                                        </button>
                                        <button
                                            onClick={() => setPaymentSubMethod('Card')}
                                            className="bg-primary text-text font-black py-4 rounded-xl flex flex-col items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                                        >
                                            <CreditCard size={24} />
                                            <span>CARD QR</span>
                                        </button>
                                        <button
                                            onClick={() => setPaymentSubMethod('Bank')}
                                            className="bg-indigo-500 text-white font-black py-4 rounded-xl flex flex-col items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all"
                                        >
                                            <QrCode size={24} />
                                            <span>BANK QR</span>
                                        </button>
                                    </div>
                                ) : paymentSubMethod === 'Cash' ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black text-success uppercase tracking-widest pl-1">Cash Calculator</h4>
                                            <button onClick={() => { setPaymentSubMethod(null); setCashReceived(''); }} className="text-[10px] font-black text-muted hover:text-text uppercase tracking-widest">Change Method</button>
                                        </div>

                                        <div className="bg-glass/20 p-4 rounded-2xl border border-success/20 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black text-muted uppercase block mb-2">Amount Received</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-success">£</span>
                                                    <input
                                                        type="number"
                                                        value={cashReceived}
                                                        onChange={(e) => setCashReceived(e.target.value)}
                                                        className="w-full bg-white border-2 border-success/30 rounded-xl py-4 pl-10 pr-4 text-2xl font-black text-slate-900 focus:outline-none focus:border-success shadow-inner"
                                                        placeholder="0.00"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-5 gap-2">
                                                {[5, 10, 20, 50].map(val => (
                                                    <button
                                                        key={val}
                                                        onClick={() => setCashReceived(val.toString())}
                                                        className="py-2 bg-success/10 hover:bg-success text-success hover:text-text border border-success/30 rounded-lg text-xs font-black transition-all"
                                                    >
                                                        £{val}
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => setCashReceived(finalTotal.toFixed(2))}
                                                    className="py-2 bg-primary/10 hover:bg-primary text-primary hover:text-text border border-primary/30 rounded-lg text-[10px] font-black transition-all uppercase"
                                                >
                                                    Exact
                                                </button>
                                            </div>

                                            {parseFloat(cashReceived) > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className={`p-4 rounded-xl flex justify-between items-center ${changeDue < 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-success/20 border border-success/30 shadow-lg shadow-success/5'}`}
                                                >
                                                    <span className="text-xs font-black uppercase text-muted">{changeDue < 0 ? 'Remaining' : 'Change Due'}</span>
                                                    <span className={`text-2xl font-black ${changeDue < 0 ? 'text-red-400' : 'text-success'}`}>
                                                        £{Math.abs(changeDue).toFixed(2)}
                                                    </span>
                                                </motion.div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleProcessPayment('Cash')}
                                            disabled={parseFloat(cashReceived) < finalTotal}
                                            className="w-full bg-success text-text font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-xl shadow-success/20 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:grayscale disabled:hover:scale-100"
                                        >
                                            <Banknote size={20} />
                                            <span>COMPLETE CASH PAYMENT</span>
                                        </button>
                                    </div>
                                ) : (paymentSubMethod === 'Bank' || paymentSubMethod === 'Card') ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center justify-between">
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest pl-1 ${paymentSubMethod === 'Card' ? 'text-primary' : 'text-indigo-400'}`}>
                                                {paymentSubMethod === 'Card' ? 'Card Payment (Camera Scan)' : 'Bank Transfer (App Scan)'}
                                            </h4>
                                            <button onClick={() => setPaymentSubMethod(null)} className="text-[10px] font-black text-muted hover:text-text uppercase tracking-widest">Change Method</button>
                                        </div>

                                        <div className={`bg-gradient-to-br rounded-2xl p-6 space-y-4 border ${paymentSubMethod === 'Card' ? 'from-primary/10 to-primary/5 border-primary/20' : 'from-indigo-500/10 to-indigo-500/5 border-indigo-500/20'}`}>
                                            <div className="text-center space-y-3">
                                                <div className="flex justify-center">
                                                    <div className="bg-white p-4 rounded-2xl shadow-xl min-h-[200px] flex items-center justify-center">
                                                        <canvas ref={qrCanvasRef} className="mx-auto" />
                                                        {qrError && (
                                                            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-4">
                                                                <p className="text-red-500 text-xs font-bold text-center">{qrError}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className={`text-xs font-black uppercase tracking-wide ${paymentSubMethod === 'Card' ? 'text-primary' : 'text-indigo-400'}`}>
                                                        {paymentSubMethod === 'Card' ? 'Scan with Phone Camera' : 'Scan From Banking App'}
                                                    </p>
                                                    <p className="text-[10px] text-muted font-medium">
                                                        {paymentSubMethod === 'Card' ? 'Customer scans this with their regular camera app' : 'Customer scans this inside their Revolut/Wise/Bank app'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 space-y-2">
                                                <div className="flex justify-between items-center text-slate-900">
                                                    <span className="text-xs font-bold opacity-60">Total Amount</span>
                                                    <span className="text-lg font-black">£{finalTotal.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-slate-800">
                                                    <span className="text-xs font-bold opacity-60">Reference</span>
                                                    <span className="text-xs font-black">Order-{selectedOrder?.id.slice(0, 8)}</span>
                                                </div>
                                            </div>

                                            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
                                                <p className="text-[10px] text-warning font-bold text-center">
                                                    ⚠️ Confirm payment on your business device before completing
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleProcessPayment(paymentSubMethod)}
                                            className={`w-full text-text font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all ${paymentSubMethod === 'Card' ? 'bg-primary shadow-primary/20' : 'bg-indigo-500 shadow-indigo-500/20'}`}
                                        >
                                            {paymentSubMethod === 'Card' ? <CreditCard size={20} /> : <QrCode size={20} />}
                                            <span>CONFIRM {paymentSubMethod.toUpperCase()} PAYMENT RECEIVED</span>
                                        </button>
                                    </div>
                                ) : null}

                                {/* Cancel Button */}
                                <button
                                    onClick={() => setIsPaymentMode(false)}
                                    className="w-full bg-background border border-muted/20 text-muted font-bold py-3 rounded-xl hover:bg-muted/10 transition-all flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft size={16} />
                                    Cancel Payment
                                </button>
                            </div>
                        )}

                        {isAmendMode && (
                            <button
                                onClick={saveAmendment}
                                disabled={amendedItems.length === 0}
                                className="w-full bg-primary text-text font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all disabled:opacity-50"
                            >
                                <Save size={18} /> Save & Update Order
                            </button>
                        )}
                    </div>
                )}
            </Modal>
        </div >
    );
};

export default OrderTable;
