import useRequireAuth from "@/src/hooks/useRequireAuth";

// Retained for reuse; route transitions belong exclusively to the root stack.
export default function AuthGate({ children }) {
	return useRequireAuth() ? children : null;
}
