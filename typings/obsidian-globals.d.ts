// Obsidian injects `app` as a global in every plugin's runtime environment.
// TypeScript needs an ambient declaration to resolve references to it.
import { App } from "obsidian";

declare global {
  const app: App;
}
