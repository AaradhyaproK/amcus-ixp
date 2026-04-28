import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import gsap from 'gsap';

// Types
type MessageBoxType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface MessageBoxOptions {
    type: MessageBoxType;
    title?: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
}

interface MessageBoxContextType {
    show: (options: MessageBoxOptions) => void;
    showSuccess: (message: string, title?: string) => void;
    showError: (message: string, title?: string) => void;
    showWarning: (message: string, title?: string) => void;
    showInfo: (message: string, title?: string) => void;
    showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

const MessageBoxContext = createContext<MessageBoxContextType | null>(null);

// Hook to use the MessageBox
export const useMessageBox = () => {
    const context = useContext(MessageBoxContext);
    if (!context) {
        throw new Error('useMessageBox must be used within a MessageBoxProvider');
    }
    return context;
};

// Icon component based on type
const getIcon = (type: MessageBoxType) => {
    const iconClasses = 'w-6 h-6';
    switch (type) {
        case 'success':
            return <CheckCircle className={`${iconClasses} text-emerald-500`} />;
        case 'error':
            return <XCircle className={`${iconClasses} text-red-500`} />;
        case 'warning':
            return <AlertTriangle className={`${iconClasses} text-amber-500`} />;
        case 'info':
            return <Info className={`${iconClasses} text-blue-500`} />;
        case 'confirm':
            return <AlertTriangle className={`${iconClasses} text-violet-500`} />;
        default:
            return <Info className={`${iconClasses} text-blue-500`} />;
    }
};

// Get default title based on type
const getDefaultTitle = (type: MessageBoxType) => {
    switch (type) {
        case 'success': return 'Success';
        case 'error': return 'Error';
        case 'warning': return 'Warning';
        case 'info': return 'Information';
        case 'confirm': return 'Confirm Action';
        default: return 'Message';
    }
};

// Get accent color classes based on type
const getAccentClasses = (type: MessageBoxType) => {
    switch (type) {
        case 'success':
            return {
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/20',
                button: 'bg-emerald-600 hover:bg-emerald-500'
            };
        case 'error':
            return {
                bg: 'bg-red-500/10',
                border: 'border-red-500/20',
                button: 'bg-red-600 hover:bg-red-500'
            };
        case 'warning':
            return {
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/20',
                button: 'bg-amber-600 hover:bg-amber-500'
            };
        case 'info':
            return {
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/20',
                button: 'bg-blue-600 hover:bg-blue-500'
            };
        case 'confirm':
            return {
                bg: 'bg-violet-500/10',
                border: 'border-violet-500/20',
                button: 'bg-violet-600 hover:bg-violet-500'
            };
        default:
            return {
                bg: 'bg-gray-500/10',
                border: 'border-gray-500/20',
                button: 'bg-gray-600 hover:bg-gray-500'
            };
    }
};

// The Modal Component
const MessageBoxModal: React.FC<{
    options: MessageBoxOptions;
    onClose: () => void;
}> = ({ options, onClose }) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const { type, title, message, onConfirm, onCancel, confirmText, cancelText } = options;
    const accentClasses = getAccentClasses(type);

    // Animate in
    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.2, ease: 'power2.out' }
            );
            gsap.fromTo(modalRef.current,
                { opacity: 0, scale: 0.9, y: 20 },
                { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.7)' }
            );
        });
        return () => ctx.revert();
    }, []);

    const handleClose = useCallback(() => {
        // Animate out
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' });
        gsap.to(modalRef.current, {
            opacity: 0, scale: 0.9, y: 20, duration: 0.2, ease: 'power2.in',
            onComplete: onClose
        });
    }, [onClose]);

    const handleConfirm = useCallback(() => {
        onConfirm?.();
        handleClose();
    }, [onConfirm, handleClose]);

    const handleCancel = useCallback(() => {
        onCancel?.();
        handleClose();
    }, [onCancel, handleClose]);

    // Handle escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (type === 'confirm') {
                    handleCancel();
                } else {
                    handleClose();
                }
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [type, handleCancel, handleClose]);

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === overlayRef.current) {
                    if (type === 'confirm') handleCancel();
                    else handleClose();
                }
            }}
        >
            <div
                ref={modalRef}
                className="saas-modal-card w-full max-w-md bg-white dark:bg-zinc-900 rounded-[12px] shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex items-center gap-3 p-4 ${accentClasses.bg} border-b ${accentClasses.border}`}>
                    <div className={`p-2 rounded-full ${accentClasses.bg}`}>
                        {getIcon(type)}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex-1">
                        {title || getDefaultTitle(type)}
                    </h3>
                    {type !== 'confirm' && (
                        <button
                            onClick={handleClose}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className={`flex justify-end gap-3 p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5`}>
                    {type === 'confirm' ? (
                        <>
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                            >
                                {cancelText || 'Cancel'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`px-4 py-2 text-sm font-bold text-white ${accentClasses.button} rounded-lg shadow-lg transition-all transform hover:-translate-y-0.5`}
                            >
                                {confirmText || 'Confirm'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleClose}
                            className={`px-4 py-2 text-sm font-bold text-white ${accentClasses.button} rounded-lg shadow-lg transition-all transform hover:-translate-y-0.5`}
                        >
                            OK
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

// Provider Component
export const MessageBoxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeBox, setActiveBox] = useState<MessageBoxOptions | null>(null);

    const show = useCallback((options: MessageBoxOptions) => {
        setActiveBox(options);
    }, []);

    const showSuccess = useCallback((message: string, title?: string) => {
        show({ type: 'success', message, title });
    }, [show]);

    const showError = useCallback((message: string, title?: string) => {
        show({ type: 'error', message, title });
    }, [show]);

    const showWarning = useCallback((message: string, title?: string) => {
        show({ type: 'warning', message, title });
    }, [show]);

    const showInfo = useCallback((message: string, title?: string) => {
        show({ type: 'info', message, title });
    }, [show]);

    const showConfirm = useCallback((message: string, onConfirm: () => void, title?: string) => {
        show({ type: 'confirm', message, title, onConfirm });
    }, [show]);

    const handleClose = useCallback(() => {
        setActiveBox(null);
    }, []);

    return (
        <MessageBoxContext.Provider value={{ show, showSuccess, showError, showWarning, showInfo, showConfirm }}>
            {children}
            {activeBox && <MessageBoxModal options={activeBox} onClose={handleClose} />}
        </MessageBoxContext.Provider>
    );
};

export default MessageBoxProvider;
