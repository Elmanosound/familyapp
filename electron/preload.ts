import { contextBridge } from 'electron';

// Expose only what the renderer explicitly needs from the host OS.
// Keep this surface as small as possible to limit the attack vector.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform, // lets the UI apply OS-specific tweaks if needed
});
