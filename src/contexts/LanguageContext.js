import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentLanguage, setCurrentLanguage as setGlobalLanguage } from '../utils/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguageState] = useState(getCurrentLanguage());
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const changeLanguage = (newLanguage) => {
    setGlobalLanguage(newLanguage);
    setCurrentLanguageState(newLanguage);
    setUpdateTrigger(prev => prev + 1);
  };

  const forceUpdate = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  // Listen for language changes from other components
  useEffect(() => {
    const interval = setInterval(() => {
      const newLanguage = getCurrentLanguage();
      if (newLanguage !== currentLanguage) {
        setCurrentLanguageState(newLanguage);
        setUpdateTrigger(prev => prev + 1);
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [currentLanguage]);

  return (
    <LanguageContext.Provider value={{
      currentLanguage,
      changeLanguage,
      forceUpdate,
      updateTrigger
    }}>
      {children}
    </LanguageContext.Provider>
  );
};
