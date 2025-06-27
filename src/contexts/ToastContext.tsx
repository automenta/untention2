import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastMessage = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

type ToastContextType = {
  addToast: (message: string, type?: ToastMessage['type']) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  // const [toasts, setToasts] = useState<ToastMessage[]>([]); // Original 'toasts' unused if only addToast is provided
  const [, setToasts] = useState<ToastMessage[]>([]);


  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
    }, 5000); // Auto-dismiss after 5 seconds
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* ToastContainer will be a separate component that consumes setToasts or uses this context too */}
    </ToastContext.Provider>
  );
};

// This state needs to be accessible by ToastContainer
// A simple way without prop drilling or complex state managers for this example
// is to lift toasts state and setToasts to ToastProvider and make ToastContainer consume it via context
// Or, ToastContainer could be rendered directly by ToastProvider and receive toasts as props.
// For now, ToastContainer will be responsible for its own rendering based on this context.
// Let's adjust: ToastContext will also provide `toasts` and `removeToast`.

export interface FullToastContextType extends ToastContextType {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const FullToastContext = createContext<FullToastContextType | undefined>(undefined);

export const useFullToast = (): FullToastContextType => {
    const context = useContext(FullToastContext);
    if (!context) {
        throw new Error('useFullToast must be used within a FullToastProvider');
    }
    return context;
}

export const FullToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, message, type }]);
    // Auto-dismiss logic moved to ToastContainer or individual toasts for more control
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  return (
    <FullToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </FullToastContext.Provider>
  );
};

// Make useToast use the FullToastContext for simplicity now
export const useToastContext = useFullToast;
