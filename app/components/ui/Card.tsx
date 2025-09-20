import { type HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered';
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ 
    className = '', 
    variant = 'default', 
    hoverable = false,
    padding = 'md',
    children, 
    ...props 
  }, ref) => {
    const baseStyles = 'rounded-xl transition-all duration-200';
    
    const variants = {
      default: 'bg-white shadow-md border border-gray-100',
      glass: 'bg-white/80 backdrop-blur-glass border border-white/20 shadow-lg',
      bordered: 'bg-white border-2 border-gray-200'
    };

    const hoverStyles = hoverable ? 'hover:shadow-xl hover:scale-[1.02] cursor-pointer' : '';
    
    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8'
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${hoverStyles} ${paddingStyles[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', children, ...props }, ref) => (
    <h3 ref={ref} className={`text-lg font-bold text-gray-900 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  )
);

CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className = '', children, ...props }, ref) => (
    <p ref={ref} className={`text-sm text-gray-600 mt-1 ${className}`} {...props}>
      {children}
    </p>
  )
);

CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`mt-4 pt-4 border-t border-gray-100 ${className}`} {...props}>
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
