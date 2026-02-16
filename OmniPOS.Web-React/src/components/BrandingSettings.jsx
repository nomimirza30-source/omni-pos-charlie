import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Palette, Globe, Upload, Check, Layout, Type } from 'lucide-react';
import { motion } from 'framer-motion';

const BrandingSettings = () => {
    const branding = useStore(state => state.branding);
    const updateBranding = useStore(state => state.updateBranding);
    const uploadLogo = useStore(state => state.uploadLogo);
    const setBrandingLocal = useStore(state => state.setBrandingLocal);
    const [appName, setAppName] = useState(branding.appName);
    const [siteUrl, setSiteUrl] = useState(branding.siteUrl);
    const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
    const [primaryColor, setPrimaryColor] = useState(branding.primaryColor);
    const [secondaryColor, setSecondaryColor] = useState(branding.secondaryColor);
    const [themeMode, setThemeMode] = useState(branding.themeMode);
    const [wiseHandle, setWiseHandle] = useState(branding.wiseHandle || '');
    const [revolutHandle, setRevolutHandle] = useState(branding.revolutHandle || '');
    const [cardPaymentUrl, setCardPaymentUrl] = useState(branding.cardPaymentUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Sync local state when branding from store changes (e.g. on fetch or initial load)
    React.useEffect(() => {
        console.log('[BrandingSettings] Store branding changed, syncing local state');
        setAppName(branding.appName);
        setSiteUrl(branding.siteUrl);
        setLogoUrl(branding.logoUrl);
        setPrimaryColor(branding.primaryColor);
        setSecondaryColor(branding.secondaryColor);
        setThemeMode(branding.themeMode);
        setWiseHandle(branding.wiseHandle || '');
        setRevolutHandle(branding.revolutHandle || '');
        setCardPaymentUrl(branding.cardPaymentUrl || '');
    }, [branding.appName, branding.siteUrl, branding.logoUrl, branding.primaryColor, branding.secondaryColor, branding.themeMode, branding.wiseHandle, branding.revolutHandle, branding.cardPaymentUrl]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const uploadedUrl = await uploadLogo(file);
            setLogoUrl(uploadedUrl);
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateBranding({
                appName,
                siteUrl,
                logoUrl,
                primaryColor,
                secondaryColor,
                themeMode,
                wiseHandle,
                revolutHandle,
                cardPaymentUrl
            });
            alert('Branding settings saved successfully!');
        } catch (error) {
            alert('Failed to save branding: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleColorChange = (type, color) => {
        if (type === 'primary') {
            setPrimaryColor(color);
            setBrandingLocal({ primaryColor: color });
        } else {
            setSecondaryColor(color);
            setBrandingLocal({ secondaryColor: color });
        }
    };

    return (
        <div className="flex flex-col gap-8 animate-fade-in text-text">
            <div className="glass-card p-8 rounded-3xl relative overflow-hidden bg-bg/50 border border-white/5">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Palette size={120} />
                </div>

                <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
                    <Palette className="text-primary" />
                    White Labeling
                </h2>
                <p className="text-slate-400 text-sm mb-8">Customize the platform look and feel for your brand.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* General & Theme Settings */}
                    <div className="flex flex-col gap-8">
                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Application Name</label>
                            <div className="relative">
                                <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
                                    placeholder="Enter App Name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">System Public URL (for QR Codes)</label>
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={siteUrl}
                                    onChange={(e) => setSiteUrl(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
                                    placeholder="e.g., http://192.168.1.100:5173 or https://pos.example.com"
                                />
                            </div>
                            <p className="text-[9px] text-muted mt-2 pl-1">Important: Use your computer's IP address (like http://192.168.1.100:5173) so phones can connect.</p>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Wise Business Handle</label>
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={wiseHandle}
                                    onChange={(e) => setWiseHandle(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
                                    placeholder="e.g. iyiluxurydining"
                                />
                            </div>
                            <p className="text-[9px] text-muted mt-2 pl-1">This enables automated "Approve/Reject" links in the payment app.</p>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Revolut Business Handle</label>
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={revolutHandle}
                                    onChange={(e) => setRevolutHandle(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
                                    placeholder="e.g. iyiluxury"
                                />
                            </div>
                            <p className="text-[9px] text-muted mt-2 pl-1">This enables automated Revolut payment links.</p>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Card Payment URL (e.g. Stripe)</label>
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={cardPaymentUrl}
                                    onChange={(e) => setCardPaymentUrl(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
                                    placeholder="e.g. https://buy.stripe.com/..."
                                />
                            </div>
                            <p className="text-[9px] text-muted mt-2 pl-1">This enables the "Pay by Card" button on the payment page.</p>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Logo (URL or File)</label>
                            <div className="relative mb-4">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={logoUrl}
                                    onChange={(e) => setLogoUrl(e.target.value)}
                                    className="w-full bg-glass/20 border border-white/10 rounded-2xl p-4 pl-12 text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold text-sm"
                                    placeholder="https://example.com/logo.png"
                                />
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => document.getElementById('logo-upload').click()}
                                    disabled={isUploading}
                                    className="flex-1 bg-glass/20 border border-dashed border-white/20 rounded-2xl p-3 text-muted hover:text-text hover:border-primary/50 transition-all flex flex-col items-center gap-1 group"
                                >
                                    <Upload className={`${isUploading ? 'animate-bounce text-primary' : 'group-hover:text-primary'} transition-colors`} size={20} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                        {isUploading ? 'Uploading...' : 'Upload File'}
                                    </span>
                                </button>
                                <input
                                    id="logo-upload"
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                                {logoUrl && (
                                    <div className="w-16 h-16 rounded-xl bg-glass/20 border border-white/10 p-2 overflow-hidden flex items-center justify-center">
                                        <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Display Mode</label>
                            <div className="bg-glass/20 p-2 rounded-2xl border border-white/10 flex gap-2">
                                <button
                                    onClick={() => setThemeMode('dark')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold text-xs ${themeMode === 'dark' ? 'bg-primary text-slate-950' : 'text-muted hover:text-text hover:bg-glass/20'}`}
                                >
                                    <Palette size={16} /> Dark Mode
                                </button>
                                <button
                                    onClick={() => setThemeMode('light')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold text-xs ${themeMode === 'light' ? 'bg-primary text-slate-950' : 'text-muted hover:text-text hover:bg-glass/20'}`}
                                >
                                    <Layout size={16} /> Light Mode
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Color Picker */}
                    <div className="flex flex-col gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block">Primary Theme Color</label>
                            <div className="grid grid-cols-7 gap-2">
                                {branding.availableColors.map(color => (
                                    <motion.button
                                        key={color}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => handleColorChange('primary', color)}
                                        className={`h-8 rounded-lg relative flex items-center justify-center border-2 transition-all ${primaryColor === color ? 'border-primary shadow-lg scale-110 z-10' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {primaryColor === color && <Check className="text-white drop-shadow-md" size={12} />}
                                    </motion.button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3 mt-4 bg-glass/20 p-3 rounded-xl border border-text/10">
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) => handleColorChange('primary', e.target.value)}
                                    className="h-8 w-12 bg-transparent border-none cursor-pointer rounded overflow-hidden"
                                />
                                <span className="text-[10px] font-mono text-muted uppercase font-black tracking-widest">{primaryColor}</span>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-black text-muted tracking-widest mb-3 block mt-4">Secondary Theme Color</label>
                            <div className="grid grid-cols-7 gap-2">
                                {branding.availableColors.map(color => (
                                    <motion.button
                                        key={color}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => handleColorChange('secondary', color)}
                                        className={`h-8 rounded-lg relative flex items-center justify-center border-2 transition-all ${secondaryColor === color ? 'border-secondary shadow-lg scale-110 z-10' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {secondaryColor === color && <Check className="text-white drop-shadow-md" size={12} />}
                                    </motion.button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3 mt-4 bg-glass/20 p-3 rounded-xl border border-text/10">
                                <input
                                    type="color"
                                    value={secondaryColor}
                                    onChange={(e) => handleColorChange('secondary', e.target.value)}
                                    className="h-8 w-12 bg-transparent border-none cursor-pointer rounded overflow-hidden"
                                />
                                <span className="text-[10px] font-mono text-muted uppercase font-black tracking-widest">{secondaryColor}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-primary text-slate-950 px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Branding'}
                    </button>
                </div>
            </div>

            {/* Preview Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass-card p-6 rounded-3xl border-l-4 border-secondary bg-glass/20 border border-text/10">
                    <h3 className="text-xs uppercase font-black text-muted tracking-tighter mb-4">Content Preview</h3>
                    <div className="space-y-4">
                        <div className="h-10 w-full bg-glass/40 rounded-xl border border-text/10 flex items-center px-4">
                            <div className="h-2 w-24 bg-primary/30 rounded" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-24 bg-glass/40 rounded-2xl border border-text/10" />
                            <div className="h-24 bg-glass/40 rounded-2xl border border-text/10" />
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 rounded-3xl col-span-2 bg-bg/50 border border-white/5 border-l-4 border-primary flex flex-col items-center justify-center gap-6">
                    <h3 className="text-xs uppercase font-black text-muted tracking-tighter self-start mb-auto">Visual Logic</h3>
                    <div className="flex gap-4">
                        <button
                            className="bg-primary text-slate-950 px-4 py-2 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: primaryColor }}
                        >
                            Primary Button
                        </button>
                        <button
                            className="text-white px-4 py-2 rounded-xl text-xs font-bold"
                            style={{ backgroundColor: secondaryColor }}
                        >
                            Secondary Button
                        </button>
                        <button
                            className="border px-4 py-2 rounded-xl text-xs font-bold transition-all"
                            style={{ borderColor: primaryColor, color: primaryColor, backgroundColor: `${primaryColor}10` }}
                        >
                            Outline Button
                        </button>
                        <div className="flex-1 h-2 rounded-full self-center relative overflow-hidden" style={{ backgroundColor: `${primaryColor}33` }}>
                            <div className="absolute top-0 left-0 w-2/3 h-full" style={{ backgroundColor: primaryColor }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrandingSettings;
