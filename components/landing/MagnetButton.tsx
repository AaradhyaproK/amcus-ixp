import React from 'react';
import { motion } from 'framer-motion';

const MagnetButton: React.FC<{ children: React.ReactNode; variant?: 'primary' | 'secondary'; className?: string }> = ({ children, variant = 'primary', className = '' }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`rounded-full font-medium transition-colors ${variant === 'primary'
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
        } ${className}`}
    >
      {children}
    </motion.button>
  );
};

export default MagnetButton;