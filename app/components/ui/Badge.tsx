import { type HTMLAttributes, forwardRef } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'ph-blue' | 'ph-red' | 'ph-yellow' | 'executive' | 'legislative' | 'constitutional' | 'judiciary';
  size?: 'sm' | 'md' | 'lg';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ 
    className = '', 
    variant = 'default', 
    size = 'md',
    children, 
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center font-medium rounded-full transition-all duration-200';
    
    const variants = {
      default: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-amber-100 text-amber-800',
      danger: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800',
      'ph-blue': 'bg-primary-100 text-primary-800',
      'ph-red': 'bg-danger-100 text-danger-800',
      'ph-yellow': 'bg-accent-100 text-accent-800',
      executive: 'bg-danger-100 text-danger-800',
      legislative: 'bg-primary-100 text-primary-800',
      constitutional: 'bg-constitutional-100 text-constitutional-800',
      judiciary: 'bg-judiciary-100 text-judiciary-800'
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
      lg: 'px-3 py-1.5 text-base'
    };

    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
