import React from 'react';

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  className?: string;
}

const supportedLanguages = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी (Hindi)' },
  { code: 'mr', name: 'मराठी (Marathi)' },
];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onLanguageChange,
  className,
}) => {
  return (
    <div className={className || ''}>
      <label htmlFor="language-select" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Interview Language</label>
      <div className="relative">
        <select 
          id="language-select" 
          value={selectedLanguage} 
          onChange={(e) => onLanguageChange(e.target.value)} 
          className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
          <i className="fas fa-chevron-down text-xs"></i>
        </div>
      </div>
    </div>
  );
};