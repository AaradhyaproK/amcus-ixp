import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

const ConnectionStatus: React.FC = () => {
    const [status, setStatus] = useState<{
        online: boolean;
        downlink: number | null;
        effectiveType: string | null;
    }>({
        online: navigator.onLine,
        downlink: null,
        effectiveType: null,
    });

    useEffect(() => {
        const updateStatus = () => {
            const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

            setStatus({
                online: navigator.onLine,
                downlink: connection ? connection.downlink : null,
                effectiveType: connection ? connection.effectiveType : null,
            });
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);

        const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (connection) {
            connection.addEventListener('change', updateStatus);
        }

        // Initial call
        updateStatus();

        return () => {
            window.removeEventListener('online', updateStatus);
            window.removeEventListener('offline', updateStatus);
            if (connection) {
                connection.removeEventListener('change', updateStatus);
            }
        };
    }, []);

    if (!status.online) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-xs font-medium text-red-600 dark:text-red-400">
                <WifiOff size={14} />
                <span>Offline</span>
            </div>
        );
    }

    // If no detailed info available, just show Online
    if (status.downlink === null) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-xs font-medium text-green-600 dark:text-green-400">
                <Wifi size={14} />
                <span>Online</span>
            </div>
        );
    }

    let colorClass = "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20";
    let label = "Good";
    let icon = <Wifi size={14} />;

    if (status.downlink < 1) {
        colorClass = "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20";
        label = "Poor";
    } else if (status.downlink < 5) {
        colorClass = "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
        label = "Fair";
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium transition-colors ${colorClass}`}>
            {icon}
            <span>{label}</span>
            <span className="opacity-70">|</span>
            <span>{status.downlink} Mbps</span>
        </div>
    );
};

export default ConnectionStatus;
