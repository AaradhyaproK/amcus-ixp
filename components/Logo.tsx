import React from 'react';

interface LogoProps {
    className?: string;
    alt?: string;
    isDark?: boolean;
}

const lightLogoSrc = '/logo-partnership-light.png';
const darkLogoSrc = '/logo-partnership-dark.png';

const Logo: React.FC<LogoProps> = ({
    className = '',
    alt = 'InterviewXpert X DSource partnership logo',
    isDark
}) => {
    if (typeof isDark === 'boolean') {
        return (
            <img
                src={isDark ? darkLogoSrc : lightLogoSrc}
                alt={alt}
                className={`object-contain ${className}`}
            />
        );
    }

    return (
        <>
            <img
                src={lightLogoSrc}
                alt={alt}
                className={`object-contain dark:hidden ${className}`}
            />
            <img
                src={darkLogoSrc}
                alt={alt}
                className={`object-contain hidden dark:block ${className}`}
            />
        </>
    );
};

export default Logo;
