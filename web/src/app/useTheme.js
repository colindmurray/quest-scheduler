import { createContext, useContext } from "react";

export const ThemeContext = createContext({
  darkMode: false,
  setDarkMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
