import React, { useEffect } from 'react';
import { useToastContext, ToastMessage } from '../contexts/ToastContext';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const Toast: React.FC<{ message: ToastMessage; onDismiss: (id: string) => void }> = ({ message, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(message.id);
    }, 5000); // Auto-dismiss after 5 seconds
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  const baseClasses = "max-w-sm w-full bg-white dark:bg-gray-700 shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden";
  const typeClasses = {
    success: "border-l-4 border-green-500",
    error: "border-l-4 border-red-500",
    info: "border-l-4 border-blue-500",
  };

  const Icon = ({ type }: { type: ToastMessage['type'] }) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-6 w-6 text-green-500 dark:text-green-400" aria-hidden="true" />;
      case 'error':
        return <XCircleIcon className="h-6 w-6 text-red-500 dark:text-red-400" aria-hidden="true" />;
      case 'info':
        return <InformationCircleIcon className="h-6 w-6 text-blue-500 dark:text-blue-400" aria-hidden="true" />;
      default:
        return null;
    }
  };

  return (
    <div className={`${baseClasses} ${typeClasses[message.type]}`}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon type={message.type} />
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{message.message}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={() => onDismiss(message.id)}
              className="inline-flex text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-700"
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastContext();

  if (!toasts.length) return null;

  return (
    <div
      aria-live="assertive"
      className="fixed inset-0 flex flex-col items-end justify-start px-4 py-6 pointer-events-none sm:p-6 sm:items-end sm:justify-start z-50 space-y-2"
      style={{ paddingTop: 'env(safe-area-inset-top, 1.5rem)', paddingRight: 'env(safe-area-inset-right, 1.5rem)' }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
