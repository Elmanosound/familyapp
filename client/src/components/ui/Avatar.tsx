import { clsx } from 'clsx';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx('rounded-full object-cover', sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        'rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 flex items-center justify-center font-medium',
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
