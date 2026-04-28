import React, { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const BentoGrid = ({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) => {
    return (
        <div
            className={cn(
                "grid w-full auto-rows-[22rem] grid-cols-1 md:grid-cols-3 gap-4",
                className,
            )}
        >
            {children}
        </div>
    );
};

interface BentoCardProps {
    name: string;
    className: string;
    background: ReactNode;
    Icon: any;
    description: string;
    href: string;
    cta: string;
    iconClassName?: string;
}

const BentoCard: React.FC<BentoCardProps> = ({
    name,
    className,
    background,
    Icon,
    description,
    href,
    cta,
    iconClassName,
}) => (
    <div
        className={cn(
            "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl",
            // light styles
            "bg-white border border-slate-200 shadow-sm",
            // dark styles
            "dark:bg-slate-900/50 dark:border-slate-800 dark:backdrop-blur-sm",
            className,
        )}
    >
        <div>{background}</div>
        <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 p-6 transition-all duration-300 group-hover:-translate-y-10">
            <Icon className={cn("h-12 w-12 origin-left transform-gpu transition-all duration-300 ease-in-out group-hover:scale-75", iconClassName)} />
            <h3 className="text-xl font-semibold text-neutral-700 dark:text-neutral-300">
                {name}
            </h3>
            <p className="max-w-lg text-neutral-400">{description}</p>
        </div>

        <div
            className={cn(
                "pointer-events-none absolute bottom-0 flex w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100",
            )}
        >
            <button className="pointer-events-auto flex items-center gap-2 text-sm font-medium hover:underline text-neutral-700 dark:text-neutral-300">
                <a href={href} className="flex items-center gap-2" rel="noreferrer">
                    {cta}
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                </a>
            </button>
        </div>
        <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[.03] group-hover:dark:bg-neutral-800/10" />
    </div>
);

export { BentoCard, BentoGrid };
