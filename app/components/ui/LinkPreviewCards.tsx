import { forwardRef, type HTMLAttributes } from "react";

interface LinkPreviewCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered';
  hoverable?: boolean;
  link: string;
}

interface LinkImageProps extends HTMLAttributes<HTMLImageElement> {
  record_id: number;
  type: string;
  alt: string;
}

const LinkPreviewCard = forwardRef<HTMLDivElement, LinkPreviewCardProps>(
  ({
    className = '', 
    variant = 'default', 
    hoverable = false,
    link,
    children, 
    ...props 
  }, ref) => {
    const baseStyles = 'relative rounded-xl transition-all duration-200 overflow-hidden';

    const variants = {
      default: 'bg-white shadow-md border border-gray-100',
      glass: 'bg-white/80 backdrop-blur-glass border border-white/20 shadow-lg',
      bordered: 'bg-white border-2 border-gray-200'
    };

    const hoverStyles = hoverable ? 'hover:shadow-xl hover:scale-[1.02]' : '';

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${hoverStyles} ${className}`}
        {...props}
      >
        {children}
        <a 
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10" 
        >
        </a>
      </div>
    );
  }
)

LinkPreviewCard.displayName = 'LinkPreview';

const imageSrc = function (id: number, type: string): string {
  let baseUrl: string;

  if (typeof window !== 'undefined') {
      baseUrl = window.location.origin;
    } else {
      baseUrl =
        import.meta.env.VITE_SITE_URL || "https://saln-tracker-ph.netlify.app";
    }

  const baseImageDirectory = `${baseUrl}/resource_images`;
  const defaultPlaceholder = `${baseUrl}/resource_images/default-image.png`;

  if (type === 'pdf') {
    return defaultPlaceholder;
  }

  if (id > 0) {
    return `${baseImageDirectory}/${id}.png`;
  }
  
  return defaultPlaceholder;
}


const LinkImage = forwardRef<HTMLImageElement, LinkImageProps>(
  ({ className = '', record_id, type, alt, ...props }, ref) => {
    const finalImageSrc = imageSrc(Number(record_id), type);

    return (
      <img
        ref={ref}
        src={finalImageSrc}
        alt={alt}
        className={`w-full h-48 object-cover ${className}`}
        {...props}
      />
    );
  }
);

LinkImage.displayName = 'LinkImage';

const LinkPreviewHeadline = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', children, ...props }, ref) => (
    <h3 ref={ref} className={`text-lg font-bold text-gray-900 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  )
);

LinkPreviewHeadline.displayName = 'LinkPreviewHeadline';

const LinkPreviewContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  )
);

LinkPreviewContent.displayName = 'LinkPreviewContent';

const LinkPreviewTags = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div ref={ref} className={`m-2 p-2 border-t border-gray-100 mt-auto ${className}`} {...props}>
      {children}
    </div>
  )
);

LinkPreviewTags.displayName = 'LinkPreviewTags';

export { LinkPreviewCard, LinkImage, LinkPreviewHeadline, LinkPreviewTags, LinkPreviewContent};
