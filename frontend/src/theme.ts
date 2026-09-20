import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#FDFBF7",
  onSurface: "#2C302E",
  surfaceSecondary: "#F5F2EA",
  onSurfaceSecondary: "#2C302E",
  surfaceTertiary: "#EAE5D9",
  onSurfaceTertiary: "#4A4D4A",
  surfaceInverse: "#2C302E",
  onSurfaceInverse: "#FDFBF7",
  muted: "#7E8480",

  // Brand
  brand: "#8DA399",
  onBrand: "#FFFFFF",
  brandPrimary: "#799488",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D98364",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E6EDE9",
  onBrandTertiary: "#2C302E",

  // Status
  success: "#799488",
  onSuccess: "#FFFFFF",
  warning: "#E07A5F",
  onWarning: "#FFFFFF",
  error: "#C25450",
  onError: "#FFFFFF",
  info: "#EAE5D9",
  onInfo: "#2C302E",

  // Lines
  border: "#EAE5D9",
  borderStrong: "#D1CCC0",
  divider: "#EAE5D9",
};

const dark = {
  surface: "#232524",
  onSurface: "#FDFBF7",
  surfaceSecondary: "#2C302E",
  onSurfaceSecondary: "#FDFBF7",
  surfaceTertiary: "#383C3A",
  onSurfaceTertiary: "#EAE5D9",
  surfaceInverse: "#FDFBF7",
  onSurfaceInverse: "#232524",
  muted: "#9BA19D",

  brand: "#8DA399",
  onBrand: "#1A211E",
  brandPrimary: "#A3BDB1",
  onBrandPrimary: "#1A211E",
  brandSecondary: "#E09C82",
  onBrandSecondary: "#2C140C",
  brandTertiary: "#2C3833",
  onBrandTertiary: "#E6EDE9",

  success: "#A3BDB1",
  onSuccess: "#1A211E",
  warning: "#E69C85",
  onWarning: "#2C140C",
  error: "#D97773",
  onError: "#FFFFFF",
  info: "#383C3A",
  onInfo: "#FDFBF7",

  border: "#383C3A",
  borderStrong: "#4A4D4A",
  divider: "#383C3A",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };
export const fonts = { display: "Fraunces_600SemiBold", displayReg: "Fraunces_500Medium", body: "Nunito_400Regular", bodyBold: "Nunito_600SemiBold", bodyMed: "Nunito_500Medium" };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
