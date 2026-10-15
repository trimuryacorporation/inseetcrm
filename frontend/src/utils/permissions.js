import { useAuth } from "../store/auth";
export const pageModules = {
  "/": "dashboard",
  "/people": "employees",
  "/pipeline": "applications",
  "/sales": "leads",
  "/settings": null,
  "/access-control": "access-control",
};
export function pageModule(path) {
  return Object.hasOwn(pageModules, path)
    ? pageModules[path]
    : path.split("/")[1];
}
export function canAccess(user, module, action = "view") {
  if (!module) return true;
  if (module === "access-control") return user?.role === "Super Admin";
  if (user?.role === "Super Admin") return true;
  if (["Client", "Vendor"].includes(user?.role)) return module === "dashboard";
  return (
    user?.permissions?.[module]?.view === true &&
    user?.permissions?.[module]?.[action] === true
  );
}
export function usePermission(module, action = "view") {
  return useAuth((s) => canAccess(s.user, module, action));
}
