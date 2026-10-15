import { create } from "zustand";
export const useAuth = create((set) => ({
  user: null,
  accessToken: null,
  ready: false,
  setSession: ({ user, accessToken }) =>
    set({ user, accessToken, ready: true }),
  clear: () => set({ user: null, accessToken: null, ready: true }),
}));
