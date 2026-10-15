import { useAuth } from "../store/auth";
import { canAccess } from "../utils/permissions";
export default function Permission({ module, action = "view", children }) {
  const user = useAuth((s) => s.user);
  return canAccess(user, module, action) ? children : null;
}
