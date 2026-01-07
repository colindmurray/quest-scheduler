import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/utils";

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    referrerPolicy="no-referrer"
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

function getInitial(name) {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() || "?";
}

function generateColorFromEmail(email) {
  if (!email) return { bg: "#e2e8f0", text: "#0f172a" };
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue} 60% 78%)`,
    text: `hsl(${hue} 35% 25%)`,
  };
}

const UserAvatar = React.forwardRef(
  ({ email, src, size = 40, className, ...props }, ref) => {
    const colors = generateColorFromEmail(email);
    return (
      <Avatar
        ref={ref}
        className={className}
        style={{ width: size, height: size }}
        {...props}
      >
        <AvatarImage src={src} alt={email || "User"} />
        <AvatarFallback
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {getInitial(email)}
        </AvatarFallback>
      </Avatar>
    );
  }
);
UserAvatar.displayName = "UserAvatar";

const AvatarStack = ({ users, max = 4, size = 24, className }) => {
  const visible = users.slice(0, max);
  const extra = users.length - visible.length;

  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {visible.map((user, index) => (
        <UserAvatar
          key={user.email || index}
          email={user.email}
          src={user.avatar}
          size={size}
          className="border-2 border-white shadow-sm dark:border-slate-900"
        />
      ))}
      {extra > 0 && (
        <div
          className="flex items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-700 dark:text-slate-200"
          style={{ width: size, height: size }}
          title={`${extra} more`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
};

export { Avatar, AvatarImage, AvatarFallback, UserAvatar, AvatarStack };
