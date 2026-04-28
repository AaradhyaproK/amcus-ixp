import { cn } from "../../lib/utils";
import React, { useState, useEffect } from "react";

export interface OrbitingCirclesProps {
    className?: string;
    children?: React.ReactNode;
    reverse?: boolean;
    duration?: number;
    delay?: number;
    radius?: number;
    mobileRadius?: number;
    path?: boolean;
}

export default function OrbitingCircles({
    className,
    children,
    reverse,
    duration = 20,
    delay = 10,
    radius = 50,
    mobileRadius,
    path = true,
}: OrbitingCirclesProps) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 640); // sm breakpoint
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const activeRadius = isMobile && mobileRadius ? mobileRadius : radius;

    return (
        <>
            <style>{`
        @keyframes orbit {
          0% {
            transform: rotate(0deg) translateY(calc(var(--radius) * 1px)) rotate(0deg);
          }
          100% {
            transform: rotate(360deg) translateY(calc(var(--radius) * 1px)) rotate(-360deg);
          }
        }
        .animate-orbit {
          animation: orbit calc(var(--duration)*1s) linear infinite;
        }
      `}</style>
            {path && (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    version="1.1"
                    className="pointer-events-none absolute inset-0 size-full"
                >
                    <circle
                        className="stroke-black/10 stroke-1 dark:stroke-white/10"
                        cx="50%"
                        cy="50%"
                        r={activeRadius}
                        fill="none"
                        strokeDasharray={"4 4"}
                    />
                </svg>
            )}

            <div
                style={
                    {
                        "--duration": duration,
                        "--radius": activeRadius,
                        "--delay": -delay,
                    } as React.CSSProperties
                }
                className={cn(
                    "absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border-none bg-transparent [animation-delay:calc(var(--delay)*1000ms)]",
                    { "[animation-direction:reverse]": reverse },
                    className,
                )}
            >
                {children}
            </div>
        </>
    );
}
