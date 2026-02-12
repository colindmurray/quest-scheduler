import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

function getLocationPathAndSearch(location) {
  return `${location.pathname || ""}${location.search || ""}`;
}

export function doesLocationMatchTarget(location, target, compareMode = "pathname") {
  if (!location || !target) return false;
  if (compareMode === "pathname+search") {
    return getLocationPathAndSearch(location) === target;
  }
  return location.pathname === target;
}

export function useSafeNavigate({
  fallbackDelayMs = 50,
  fallbackNavigate = (target) => window.location.assign(target),
} = {}) {
  const navigate = useNavigate();

  return useCallback(
    (target, options = {}) => {
      if (!target) return;

      const {
        compareMode = "pathname",
        delayMs = fallbackDelayMs,
        fallback = true,
        ...navigateOptions
      } = options;

      if (Object.keys(navigateOptions).length > 0) {
        navigate(target, navigateOptions);
      } else {
        navigate(target);
      }

      if (!fallback || typeof window === "undefined") return;

      window.setTimeout(() => {
        if (!doesLocationMatchTarget(window.location, target, compareMode)) {
          fallbackNavigate(target);
        }
      }, delayMs);
    },
    [fallbackDelayMs, fallbackNavigate, navigate]
  );
}
