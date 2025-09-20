import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'flag';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className = '', 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    disabled,
    children, 
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium tracking-tight transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg hover:shadow-xl focus:ring-primary-500',
      secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-md hover:shadow-lg focus:ring-gray-500',
      danger: 'bg-danger-500 hover:bg-danger-600 text-white shadow-lg hover:shadow-xl focus:ring-danger-500',
      ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-500',
      flag: 'bg-flag-gradient hover:opacity-90 text-white shadow-lg hover:shadow-xl focus:ring-primary-500'
    };

    const sizes = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base'
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} ${loading ? 'animate-pulse' : ''}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24">
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
