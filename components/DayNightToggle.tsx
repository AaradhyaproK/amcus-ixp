import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface DayNightToggleProps {
  className?: string;
}

const DayNightToggle: React.FC<DayNightToggleProps> = ({ className = '' }) => {
  const { theme, setTheme } = useTheme();
  
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <div 
      onClick={handleToggle}
      className={`relative flex items-center h-[32px] w-[76px] sm:h-[40px] sm:w-[100px] shrink-0 rounded-full cursor-pointer transition-colors duration-300 shadow-inner ${isDark ? 'bg-black' : 'bg-[#c2c2c2]'} ${className}`}
      title={isDark ? "Switch to Day Mode" : "Switch to Night Mode"}
    >
      {/* Label */}
      <span 
        className={`absolute text-[8px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-300 pointer-events-none ${isDark ? 'left-2.5 sm:left-2.5 text-white' : 'right-2.5 sm:right-2.5 text-black'}`}
        style={{ fontFamily: "'Arial Black', 'Arial Bold', sans-serif" }}
      >
        {isDark ? 'Night' : 'Day'}
      </span>

      {/* Notch */}
      <div 
        className={`absolute w-[26px] h-[26px] sm:w-[32px] sm:h-[32px] bg-white rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${isDark ? 'right-[3px] sm:right-1' : 'left-[3px] sm:left-1'}`}
      >
        {isDark ? (
          <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        )}
      </div>
    </div>
  );
};

export default DayNightToggle;