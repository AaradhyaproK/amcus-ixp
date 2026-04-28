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
    <div className={className}>
      <label htmlFor="language-select" className="text-sm text-gray-600 dark:text-gray-400">Interview Language</label>
      <select id="language-select" value={selectedLanguage} onChange={(e) => onLanguageChange(e.target.value)} className="w-full p-3 mt-1 border rounded dark:bg-gray-700 dark:border-gray-600">
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>{lang.name}</option>
        ))}
      </select>
    </div>
  );
};