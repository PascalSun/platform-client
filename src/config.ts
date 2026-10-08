// How the package is set up for the app it runs in. Everything has a default from the app's NEXT_PUBLIC_* env, so
// most apps never call configure(); an app that wants analytics on sign-in events, or a different support
// address, calls it once at start-up (before the first sign-in or API call).

export type PlatformClientConfig = {
  /** The platform's public origin, e.g. https://platform.nlp-tlp.org */
  platformUrl: string;
  /** This app's OAuth client id on the platform ("<app>-web"); empty = derived from the host name */
  clientId: string;
  /** Ask for an OpenID token at sign-in (false on a dev platform without an OIDC key) */
  oidc: boolean;
  /** Where "contact support" points */
  supportEmail: string;
  /** Called on sign-in events ("sign_in", "email_verified", "password_changed", "feedback_sent"), for analytics */
  onEvent?: (event: string, props?: Record<string, unknown>) => void;
};

// written out in full (not process.env[name]): Next.js only puts an env value into the browser bundle where it
// sees the literal NEXT_PUBLIC_* name
export const config: PlatformClientConfig = {
  platformUrl: (process.env.NEXT_PUBLIC_PLATFORM_URL ?? "https://platform.nlp-tlp.org").replace(/\/$/, ""),
  clientId: process.env.NEXT_PUBLIC_PLATFORM_CLIENT_ID ?? "",
  oidc: process.env.NEXT_PUBLIC_PLATFORM_OIDC !== "0",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "pascal.sun@uwa.edu.au",
};

export function configurePlatformClient(patch: Partial<PlatformClientConfig>): void {
  Object.assign(config, patch);
}
