import { useEffect, useState } from 'react';
import { getAvatar } from '../utils/avatars';

interface UserAvatarProps {
  name?: string | null;
  username?: string | null;
  image?: string | null;
  /** Index into the predefined avatar set. When set, takes priority over initials. */
  avatarIndex?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-lg',
};

const AVATAR_ICON_SIZES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const AVATAR_GRADIENTS = [
  'from-emerald-400 via-lime-300 to-yellow-200',
  'from-sky-400 via-cyan-300 to-blue-200',
  'from-amber-400 via-orange-300 to-rose-200',
  'from-rose-400 via-fuchsia-300 to-purple-200',
  'from-teal-400 via-emerald-300 to-lime-200',
] as const;

const UserAvatar = ({ name, username, image, avatarIndex, size = 'md', className = '' }: UserAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const hasAvatar = avatarIndex !== null && avatarIndex !== undefined;
  const seed = getStringSeed(name, username);
  const gradient = AVATAR_GRADIENTS[seed % AVATAR_GRADIENTS.length];
  const initials = getInitials(name, username);

  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 ${AVATAR_SIZES[size]} ${className}`}
    >
      {image && !imageFailed ? (
        <img
          src={image}
          alt={name ?? username ?? 'User avatar'}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : hasAvatar ? (
        (() => {
          const avatar = getAvatar(avatarIndex);
          const Icon = avatar.Icon;
          return (
            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${avatar.gradient}`}>
              <Icon className={`${AVATAR_ICON_SIZES[size]} text-slate-950`} strokeWidth={2.2} />
            </div>
          );
        })()
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient} font-black uppercase text-slate-950`}
        >
          {initials}
        </div>
      )}

      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/15" />
    </div>
  );
};

function getStringSeed(name?: string | null, username?: string | null): number {
  const input = `${name ?? ''}:${username ?? ''}`.trim() || 'forest-survival';
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getInitials(name?: string | null, username?: string | null): string {
  const source = (name?.trim() || username?.trim() || 'FS').replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
  if (!source) {
    return 'FS';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const single = parts[0];
    return single.slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? 'F'}${parts[1][0] ?? 'S'}`.toUpperCase();
}

export default UserAvatar;
