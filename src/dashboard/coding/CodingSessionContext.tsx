import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { CodingProviderId } from "@/lib/codingProviders";
import { providerById } from "@/lib/codingProviders";

export type CodingBackend = "runner" | "sandbox" | "selfhost";

const BACKEND_KEY = "dtour-coding-backend";
const PROVIDER_KEY = "dtour-coding-provider";
const DEVICE_KEY = "dtour-coding-device";

function readBackend(): CodingBackend {
	try {
		const v = localStorage.getItem(BACKEND_KEY);
		if (v === "runner" || v === "sandbox" || v === "selfhost") return v;
	} catch {
		/* ignore */
	}
	return "runner";
}

function readProvider(): CodingProviderId {
	try {
		const v = localStorage.getItem(PROVIDER_KEY);
		if (v === "openrouter") return "opencode";
		if (v === "opencode" || v === "codex" || v === "claude" || v === "pi") {
			return v;
		}
	} catch {
		/* ignore */
	}
	return "opencode";
}

function readDeviceId(): string | null {
	try {
		const v = localStorage.getItem(DEVICE_KEY);
		return v?.trim() ? v : null;
	} catch {
		/* ignore */
	}
	return null;
}

type CodingSession = {
	backend: CodingBackend;
	setBackend: (b: CodingBackend) => void;
	selectedDeviceId: string | null;
	setSelectedDeviceId: (id: string | null) => void;
	activeProvider: CodingProviderId;
	setActiveProvider: (p: CodingProviderId) => void;
	runnerConnected: boolean;
	setRunnerConnected: (v: boolean) => void;
	injectRef: React.MutableRefObject<((cmd: string) => void) | null>;
	runnerWsRef: React.MutableRefObject<WebSocket | null>;
	onLaunchInTerminal: (cmd: string) => void;
	onSaveWorkspace: (name: string) => void;
};

const CodingSessionContext = createContext<CodingSession | null>(null);

export function CodingSessionProvider({ children }: { children: ReactNode }) {
	const [backend, setBackendState] = useState<CodingBackend>(readBackend);
	const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
		readDeviceId,
	);
	const [activeProvider, setActiveProviderState] =
		useState<CodingProviderId>(readProvider);
	const [runnerConnected, setRunnerConnected] = useState(false);
	const injectRef = useRef<((cmd: string) => void) | null>(null);
	const runnerWsRef = useRef<WebSocket | null>(null);

	const setBackend = useCallback((b: CodingBackend) => {
		setBackendState(b);
		try {
			localStorage.setItem(BACKEND_KEY, b);
		} catch {
			/* ignore */
		}
	}, []);

	const setActiveProvider = useCallback((p: CodingProviderId) => {
		setActiveProviderState(p);
		try {
			localStorage.setItem(PROVIDER_KEY, p);
		} catch {
			/* ignore */
		}
	}, []);

	const setSelectedDeviceId = useCallback((id: string | null) => {
		const next = id?.trim() || null;
		setSelectedDeviceIdState(next);
		try {
			if (next) {
				localStorage.setItem(DEVICE_KEY, next);
			} else {
				localStorage.removeItem(DEVICE_KEY);
			}
		} catch {
			/* ignore */
		}
	}, []);

	const onLaunchInTerminal = useCallback((cmd: string) => {
		injectRef.current?.(`${cmd}\r`);
	}, []);

	const onSaveWorkspace = useCallback((name: string) => {
		const ws = runnerWsRef.current;
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(`w${JSON.stringify({ name })}`);
		}
	}, []);

	const value = useMemo(
		() => ({
			backend,
			setBackend,
			selectedDeviceId,
			setSelectedDeviceId,
			activeProvider,
			setActiveProvider,
			runnerConnected,
			setRunnerConnected,
			injectRef,
			runnerWsRef,
			onLaunchInTerminal,
			onSaveWorkspace,
		}),
		[
			backend,
			setBackend,
			selectedDeviceId,
			setSelectedDeviceId,
			activeProvider,
			setActiveProvider,
			runnerConnected,
			onLaunchInTerminal,
			onSaveWorkspace,
		],
	);

	return (
		<CodingSessionContext.Provider value={value}>
			{children}
		</CodingSessionContext.Provider>
	);
}

export function useCodingSession(): CodingSession {
	const ctx = useContext(CodingSessionContext);
	if (!ctx) throw new Error("useCodingSession outside CodingSessionProvider");
	return ctx;
}

export function useCodingProviderFromRoute(
	section: string | undefined,
): CodingProviderId | null {
	if (
		!section ||
		section === "setup" ||
		section === "draft" ||
		section === "saves"
	)
		return null;
	try {
		providerById(section as CodingProviderId);
		return section as CodingProviderId;
	} catch {
		return null;
	}
}
