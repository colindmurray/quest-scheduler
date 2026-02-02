import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/utils";
import { getUserAvatarUrl, getUserLabel } from "../../lib/identity";
import { getColorForEmail, getInitial } from "./voter-avatar-utils";

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

const UserAvatar = React.forwardRef(
  ({ user, email, src, size = 40, className, ...props }, ref) => {
    const resolvedUser = user || {};
    const resolvedEmail = email || resolvedUser.email || null;
    const avatarUrl = src || getUserAvatarUrl(resolvedUser);
    const label =
      getUserLabel({ ...resolvedUser, email: resolvedEmail }) ||
      resolvedEmail ||
      "User";
    const colors = getColorForEmail(resolvedEmail || label);
    return (
      <Avatar
        ref={ref}
        className={className}
        style={{ width: size, height: size }}
        {...props}
      >
        <AvatarImage src={avatarUrl} alt={label} />
        <AvatarFallback
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {getInitial(label)}
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
          user={user}
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
