import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface DashboardStats {
    total: number;
    shortlisted: number;
    hired: number;
    rejected: number;
}

interface DashboardChartsProps {
    stats: DashboardStats;
    activityData?: { name: string; value: number }[];
}

const DashboardCharts: React.FC<DashboardChartsProps> = ({ stats, activityData: propData }) => {
    // Use real-time data if provided, otherwise mock (though we aim to always provide real)
    const activityData = propData || [
        { name: 'JAN', value: Math.floor(stats.total * 0.2) },
        { name: 'FEB', value: Math.floor(stats.total * 0.25) },
        { name: 'MAR', value: Math.floor(stats.total * 0.3) },
        { name: 'APR', value: Math.floor(stats.total * 0.5) },
        { name: 'MAY', value: Math.floor(stats.total * 0.4) },
        { name: 'JUN', value: Math.floor(stats.total * 0.6) },
        { name: 'JUL', value: stats.total },
    ];

    const StatRow = ({ label, count, color, percentage }: { label: string, count: number, color: string, percentage: string }) => (
        <div className="flex items-center justify-between mb-6 last:mb-0">
            <div className="flex items-center gap-4">
                {/* Circular Progress Placeholder - Visual only as per reference style */}
                <div className={`w-12 h-12 rounded-full border-4 ${color} flex items-center justify-center bg-transparent`} style={{ borderRightColor: 'transparent', borderBottomColor: 'transparent' }}>
                    {/* Inner circle could go here or svg */}
                </div>
                <div>
                    <h4 className="text-gray-900 dark:text-white font-bold">{label}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{count} Candidates</p>
                </div>
            </div>
            <span className={`font-bold ${color.replace('border-', 'text-')}`}>{percentage}</span>
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Overview - Bar Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-[#1A1A1A] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-gray-900 dark:text-white font-bold text-lg">Activity Overview</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Monthly recruitment funnel performance</p>
                    </div>
                    <div className="flex bg-gray-100 dark:bg-[#222] rounded-lg p-1">
                        <button className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-md shadow-sm">Shortlisted</button>
                        <button className="px-3 py-1 text-gray-500 dark:text-gray-400 text-xs font-medium hover:text-gray-900 dark:hover:text-white transition-colors">Hired</button>
                    </div>
                </div>

                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityData} barSize={40}>
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 10, fill: '#6B7280' }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{
                                    backgroundColor: 'var(--popover)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--popover-foreground)',
                                    borderRadius: '8px',
                                    boxShadow: '0 12px 30px rgb(var(--foreground-rgb) / 0.12)'
                                }}
                                itemStyle={{ color: 'var(--popover-foreground)' }}
                            />
                            <Bar
                                dataKey="value"
                                fill="var(--chart-1)"
                                radius={[4, 4, 0, 0]}
                            >
                                {/* Highlight last bar with brighter blue like reference */}
                                {activityData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === activityData.length - 1 ? 'var(--chart-1)' : 'var(--chart-3)'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Status Breakdown */}
            <div className="bg-white dark:bg-[#1A1A1A] p-6 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none">
                <h3 className="text-gray-900 dark:text-white font-bold text-lg mb-8">Status Breakdown</h3>

                <div className="space-y-4">
                    <StatRow
                        label="Hired"
                        count={stats.hired}
                        color="border-emerald-500"
                        percentage={`${stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0}%`}
                    />
                    <StatRow
                        label="Shortlisted"
                        count={stats.shortlisted}
                        color="border-blue-500"
                        percentage={`${stats.total > 0 ? Math.round((stats.shortlisted / stats.total) * 100) : 0}%`}
                    />
                    <StatRow
                        label="Rejected"
                        count={stats.rejected}
                        color="border-gray-400 dark:border-gray-600"
                        percentage={`${stats.total > 0 ? Math.round((stats.rejected / stats.total) * 100) : 0}%`}
                    />
                </div>

                <button className="w-full mt-8 py-3 rounded-xl border border-gray-200 dark:border-white/10 text-sm text-gray-500 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    View Detailed Report
                </button>
            </div>
        </div>
    );
};

export default DashboardCharts;
