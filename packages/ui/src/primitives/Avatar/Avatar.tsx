import classes from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 'sm' }: AvatarProps) {
  return (
    <span className={classes.root} data-size={size} role="img" aria-label={name} title={name}>
      {initials(name)}
    </span>
  );
}
