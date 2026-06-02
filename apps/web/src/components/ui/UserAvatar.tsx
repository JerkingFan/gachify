import type { User } from "@/types";

type UserAvatarProps = {
  user: Pick<User, "display_name" | "avatar_url">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-sm",
  md: "h-12 w-12 text-lg",
  lg: "h-24 w-24 text-3xl",
  xl: "h-56 w-56 text-6xl",
};

export function UserAvatar({ user, size = "md", className = "" }: UserAvatarProps) {
  const initial = user.display_name?.[0]?.toUpperCase() ?? "♂";
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className={`shrink-0 rounded-full object-cover shadow-lg ${sizes[size]} ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-spotify-highlight font-bold text-spotify-green shadow-lg ${sizes[size]} ${className}`}
    >
      {initial}
    </div>
  );
}
