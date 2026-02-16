import React, { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Bell, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationTray = () => {
    const { notifications, clearNotification, user, setView } = useStore();

    const handleNotificationClick = React.useCallback((n) => {
        if (n.orderId) {
            useStore.setState({ activeOrderId: n.orderId });
            setView('Dashboard');
        }
        clearNotification(n.id);
    }, [clearNotification, setView]);

    const handleClear = React.useCallback((id) => {
        clearNotification(id);
    }, [clearNotification]);

    // Filter notifications based on user role
    const relevantNotifications = React.useMemo(() => {
        const canonicalRole = (role) => {
            if (!role) return '';
            if (['Chef', 'Assistant Chef', 'Kitchen'].includes(role)) return 'Kitchen';
            return role;
        };

        const userCanonical = canonicalRole(user?.role);

        return notifications.filter(n => {
            if (!n.roleFilter) return true;

            // Map filters canonical roles if they are kitchen related
            const canonicalFilters = n.roleFilter.map(r =>
                ['Chef', 'Assistant Chef', 'Kitchen'].includes(r) ? 'Kitchen' : r
            );

            return n.roleFilter.includes(user?.role) || canonicalFilters.includes(userCanonical);
        });
    }, [notifications, user?.role]);

    return (
        <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 w-80 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {relevantNotifications.map((n) => (
                    <NotificationItem
                        key={n.id}
                        notification={n}
                        onClick={() => handleNotificationClick(n)}
                        onClear={() => handleClear(n.id)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

const NotificationItem = ({ notification, onClear, onClick }) => {
    const title = notification.title || (notification.type === 'StatusChange' ? 'Order Update' : 'New Alert');
    const message = notification.message;
    const type = notification.type === 'StatusChange' ? 'info' : (notification.type || 'info');

    useEffect(() => {
        const timer = setTimeout(() => {
            onClear();
        }, 8000); // Auto-dismiss after 8s
        return () => clearTimeout(timer);
    }, [onClear]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-success" size={20} />;
            case 'error': return <AlertCircle className="text-red-400" size={20} />;
            default: return <Info className="text-primary" size={20} />;
        }
    };

    const getBorder = () => {
        switch (type) {
            case 'success': return 'border-success/30 bg-success/5';
            case 'error': return 'border-red-400/30 bg-red-400/5';
            default: return 'border-primary/30 bg-primary/5';
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            onClick={onClick}
            className={`pointer-events-auto cursor-pointer glass-card p-4 rounded-2xl border ${getBorder()} backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform`}
        >
            <div className="flex gap-3">
                <div className="mt-0.5">{getIcon()}</div>
                <div className="flex-1 min-w-0">
                    <div className="font-black text-xs text-text uppercase tracking-widest mb-1">{title}</div>
                    <div className="text-[11px] text-muted font-medium leading-relaxed">{message}</div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className="p-2 -mr-1 hover:bg-glass/20 rounded-xl transition-all text-muted hover:text-red-400 group/close"
                    title="Dismiss"
                >
                    <X size={16} className="group-hover/close:rotate-90 transition-transform duration-300" />
                </button>
            </div>

            {/* Progress Bar for dismissal */}
            <motion.div
                initial={{ width: '100%' }}
                animate={{ width: 0 }}
                transition={{ duration: 8, ease: 'linear' }}
                className={`absolute bottom-0 left-0 h-0.5 ${type === 'success' ? 'bg-success' : type === 'error' ? 'bg-red-400' : 'bg-primary'}`}
            />
        </motion.div>
    );
};

export default NotificationTray;
