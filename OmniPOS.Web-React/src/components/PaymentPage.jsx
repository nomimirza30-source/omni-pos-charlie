import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, CheckCircle2, CreditCard, Building2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const PaymentPage = () => {
    const { token } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState('');
    const [paymentMethod, setPaymentMethod] = useState(null);

    useEffect(() => {
        // Fetch order details using the payment token
        fetch(`/api/payment/details/${token}`)
            .then(res => res.json())
            .then(data => {
                setOrder(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Error loading payment:', err);
                setLoading(false);
            });
    }, [token]);

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(''), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
                <div className="text-center">
                    <h1 className="text-2xl font-black text-white mb-2">Payment Not Found</h1>
                    <p className="text-muted">This payment link may have expired or is invalid.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-md mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-white mb-2">IYI Luxury Dining</h1>
                    <p className="text-muted">Complete Your Payment</p>
                    {/* Debug Info */}
                    <p className="text-[10px] text-red-400 mt-2 font-mono">
                        DEBUG: Handle=[{order.wiseHandle || 'NULL'}] API=[{order.wisePaymentUrl ? 'YES' : 'NO'}]
                    </p>
                </div>

                {/* Order Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 mb-6 border border-white/20"
                >
                    <h2 className="text-sm font-black text-primary uppercase tracking-widest mb-4">Order Summary</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-muted text-sm">Order Reference</span>
                            <span className="text-white font-bold">#{order.reference}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted text-sm">Table</span>
                            <span className="text-white font-bold">{order.tableNumber}</span>
                        </div>
                        <div className="h-px bg-white/10 my-4"></div>
                        <div className="flex justify-between items-center">
                            <span className="text-white font-black text-lg">Total Amount</span>
                            <span className="text-primary font-black text-3xl">£{order.amount.toFixed(2)}</span>
                        </div>
                    </div>
                </motion.div>

                {/* Payment Method Selection */}
                {!paymentMethod ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="space-y-4"
                    >
                        <h3 className="text-white font-black text-center mb-6">Choose Payment Method</h3>

                        <button
                            onClick={() => setPaymentMethod('bank')}
                            className="w-full bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/90 hover:to-secondary/70 text-white font-black py-6 rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-secondary/20 transition-all hover:scale-[1.02]"
                        >
                            <Building2 size={24} />
                            <span>Bank Transfer</span>
                        </button>

                        {/* Wise Payment Link */}
                        {(order.wisePaymentUrl || order.wiseHandle) && (
                            <button
                                onClick={() => {
                                    if (order.wisePaymentUrl) {
                                        window.open(order.wisePaymentUrl, '_blank');
                                    } else {
                                        // Support both personal handles (no prefix) and business (business/ prefix)
                                        const handlePath = order.wiseHandle.includes('/') ? order.wiseHandle : `me/${order.wiseHandle}`;
                                        window.open(`https://wise.com/pay/${handlePath}?amount=${order.amount.toFixed(2)}&currency=GBP`, '_blank');
                                    }
                                    setPaymentMethod('manual_confirm');
                                }}
                                className="w-full bg-[#9fea00] text-[#163300] font-black py-6 rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-[#9fea00]/20 transition-all hover:scale-[1.02]"
                            >
                                <img src="https://wise.com/public-resources/assets/logos/wise/brand_logo.svg" alt="Wise" className="h-6 w-auto" />
                                <span>Pay on Wise</span>
                            </button>
                        )}

                        {/* Custom Card Payment Link */}
                        {order.cardPaymentUrl && (
                            <button
                                onClick={() => {
                                    window.open(order.cardPaymentUrl, '_blank');
                                    setPaymentMethod('manual_confirm');
                                }}
                                className="w-full bg-indigo-600 text-white font-black py-6 rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-indigo-600/20 transition-all hover:scale-[1.02]"
                            >
                                <CreditCard size={24} />
                                <span>Pay Securely Online</span>
                            </button>
                        )}

                        <button
                            onClick={() => setPaymentMethod('card')}
                            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-slate-900 font-black py-6 rounded-2xl flex items-center justify-center gap-3 shadow-2xl shadow-primary/20 transition-all hover:scale-[1.02]"
                        >
                            <CreditCard size={24} />
                            <span>Direct Card (Legacy)</span>
                        </button>
                    </motion.div>
                ) : paymentMethod === 'manual_confirm' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20 text-center"
                    >
                        <h3 className="text-white font-black mb-4">Confirm Payment</h3>
                        <p className="text-muted mb-6">
                            A new tab has opened for you to complete the payment.<br />
                            Once you have paid, click the button below to confirm.
                        </p>

                        <button
                            onClick={() => {
                                setLoading(true);
                                fetch('/api/payment/public-process', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        orderId: token,
                                        amount: order.amount,
                                        paymentMethod: 'Link',
                                        cardDetails: null
                                    })
                                })
                                    .then(res => res.json())
                                    .then(data => {
                                        setLoading(false);
                                        if (data.success) {
                                            alert('Payment Confirmed!');
                                            setPaymentMethod('success');
                                        } else {
                                            alert('Confirmation Failed: ' + data.message);
                                        }
                                    })
                                    .catch(err => {
                                        setLoading(false);
                                        alert('Error confirming payment');
                                    });
                            }}
                            className="w-full bg-success text-white font-black py-4 rounded-xl shadow-lg shadow-success/20 hover:scale-[1.02] transition-all"
                        >
                            <CheckCircle2 size={24} className="inline mr-2" />
                            I Have Made The Payment
                        </button>

                        <button
                            onClick={() => setPaymentMethod(null)}
                            className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    </motion.div>
                ) : paymentMethod === 'bank' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20"
                    >
                        <h3 className="text-white font-black mb-6 flex items-center gap-2">
                            <Building2 size={20} />
                            Bank Transfer Details
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Account Name</label>
                                <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                                    <span className="text-white font-bold">IYI Luxury Dining</span>
                                    <button
                                        onClick={() => copyToClipboard('IYI Luxury Dining', 'name')}
                                        className="text-primary hover:text-primary/80 transition-colors"
                                    >
                                        {copied === 'name' ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">IBAN</label>
                                <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                                    <span className="text-white font-bold font-mono text-sm">GB75TRWI60846416565634</span>
                                    <button
                                        onClick={() => copyToClipboard('GB75TRWI60846416565634', 'iban')}
                                        className="text-primary hover:text-primary/80 transition-colors"
                                    >
                                        {copied === 'iban' ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Amount</label>
                                <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                                    <span className="text-primary font-black text-2xl">£{order.amount.toFixed(2)}</span>
                                    <button
                                        onClick={() => copyToClipboard(order.amount.toFixed(2), 'amount')}
                                        className="text-primary hover:text-primary/80 transition-colors"
                                    >
                                        {copied === 'amount' ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Reference</label>
                                <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                                    <span className="text-white font-bold">{order.reference}</span>
                                    <button
                                        onClick={() => copyToClipboard(order.reference, 'ref')}
                                        className="text-primary hover:text-primary/80 transition-colors"
                                    >
                                        {copied === 'ref' ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 bg-warning/10 border border-warning/30 rounded-xl p-4">
                            <p className="text-warning text-xs font-bold text-center">
                                ⚠️ Please include the reference number in your transfer
                            </p>
                        </div>

                        <button
                            onClick={() => setPaymentMethod(null)}
                            className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all"
                        >
                            ← Back to Payment Options
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20"
                    >
                        <h3 className="text-white font-black mb-6 flex items-center gap-2">
                            <CreditCard size={20} />
                            Pay with Card
                        </h3>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const cardDetails = {
                                cardNumber: formData.get('cardNumber'),
                                expiry: formData.get('expiry'),
                                cvv: formData.get('cvv'),
                                name: formData.get('name')
                            };

                            setLoading(true);
                            // Simulate API call
                            fetch('/api/payment/public-process', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    orderId: token,
                                    amount: order.amount,
                                    paymentMethod: 'Card',
                                    cardDetails
                                })
                            })
                                .then(async res => {
                                    const contentType = res.headers.get("content-type");
                                    if (!res.ok) {
                                        const text = await res.text();
                                        throw new Error(`Server Error (${res.status}): ${text}`);
                                    }
                                    if (contentType && contentType.indexOf("application/json") !== -1) {
                                        return res.json();
                                    } else {
                                        const text = await res.text();
                                        throw new Error(`Invalid JSON response: ${text}`);
                                    }
                                })
                                .then(data => {
                                    setLoading(false);
                                    if (data.success) {
                                        alert('Payment Successful!');
                                        setPaymentMethod('success');
                                    } else {
                                        alert('Payment Failed: ' + (data.message || 'Unknown error'));
                                    }
                                })
                                .catch(err => {
                                    setLoading(false);
                                    console.error('Payment Error:', err);
                                    alert(`Error processing payment: ${err.message}`);
                                });
                        }}>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Card Name</label>
                                    <input
                                        name="name"
                                        type="text"
                                        placeholder="MR J DOE"
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Long Card Number</label>
                                    <input
                                        name="cardNumber"
                                        type="text"
                                        placeholder="0000 0000 0000 0000"
                                        maxLength="19"
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors font-mono"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">Expiry</label>
                                        <input
                                            name="expiry"
                                            type="text"
                                            placeholder="MM/YY"
                                            maxLength="5"
                                            required
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-muted uppercase tracking-wide block mb-2">CVV</label>
                                        <input
                                            name="cvv"
                                            type="text"
                                            placeholder="123"
                                            maxLength="3"
                                            required
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-primary transition-colors font-mono"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary hover:bg-primary/90 text-slate-900 font-black py-4 rounded-xl shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] mt-4"
                                >
                                    {loading ? 'Processing...' : `Pay £${order.amount.toFixed(2)}`}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod(null)}
                                    className="w-full text-muted hover:text-white font-bold py-2 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default PaymentPage;
