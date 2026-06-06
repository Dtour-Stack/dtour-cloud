import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GuidedTour } from "@/dashboard/design/GuidedTour";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { type CodingBackend, useCodingSession } from "./CodingSessionContext";
import { CODING_TOUR } from "./codingGuide";

const BACKENDS: {
	key: CodingBackend;
	label: string;
	detail: string;
	live: boolean;
}[] = [
	{
		key: "runner",
		label: "Detour Cloud",
		detail: "E2B Firecracker microVM",
		live: true,
	},
	{
		key: "sandbox",
		label: "Browser sandbox",
		detail: "Local browser shell",
		live: true,
	},
	{
		key: "selfhost",
		label: "Self-host",
		detail: "Paired Detour desktop",
		live: true,
	},
];

type RelayHealth = { ok: boolean; e2b: boolean; template: string } | null;

function normalizePairCode(raw: string): string {
	return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function CodingSetupPage() {
	const { backend, setBackend } = useCodingSession();
	const [relay, setRelay] = useState<RelayHealth>(null);
	const [params] = useSearchParams();
	const pairCode = normalizePairCode(params.get("pair") ?? "");

	useEffect(() => {
		fetch("/coding-health")
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => setRelay(j as RelayHealth))
			.catch(() => setRelay(null));
	}, []);

	return (
		<div
			className="mx-auto w-full max-w-6xl space-y-5 px-6 py-8"
			data-tour="coding-setup"
		>
			<header className="flex items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">Setup</h1>
					<p className="mt-1 text-[13px] text-white/45">
						Pick where coding sessions run, pair desktop machines, and save
						provider keys in the agent tabs.
					</p>
				</div>
				<GuidedTour
					id="coding"
					heading="Coding"
					steps={CODING_TOUR}
					label="Guide"
				/>
			</header>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
				<section
					className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md"
					data-tour="coding-backends"
				>
					<h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/35">
						Backend
					</h2>
					<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
						{BACKENDS.map((b) => (
							<button
								key={b.key}
								type="button"
								onClick={() => setBackend(b.key)}
								className={cn(
									"flex min-h-24 flex-col justify-between rounded-xl border px-3 py-3 text-left text-sm transition",
									backend === b.key
										? "border-violet-400/40 bg-violet-400/10 text-white"
										: "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5",
								)}
							>
								<span className="flex items-center justify-between gap-2">
									<span className="font-medium">{b.label}</span>
									{b.live ? (
										<span className="h-2 w-2 rounded-full bg-emerald-400" />
									) : (
										<span className="text-[10px] uppercase text-white/35">
											soon
										</span>
									)}
								</span>
								<span className="text-[12px] text-white/40">{b.detail}</span>
							</button>
						))}
					</div>
					<p className="mt-3 text-[12px] leading-relaxed text-white/45">
						Pick an agent in the sidebar; every new terminal session prepares{" "}
						<span className="font-mono text-white/60">~/workspace</span>,
						installs the selected CLI, and launches it automatically.
					</p>
				</section>

				<section className="rounded-2xl border border-white/10 bg-black/30 p-5 text-[12px] text-white/55 backdrop-blur-md">
					<p className="mb-3 font-medium text-white/80">Platform status</p>
					<ul className="space-y-2">
						<li className="flex items-start gap-2">
							<span
								className={cn(
									"mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
									relay?.e2b ? "bg-emerald-400" : "bg-amber-400",
								)}
							/>
							E2B {relay?.e2b ? "connected" : "not configured on server"}
							{relay?.template && relay.template !== "default" && (
								<span className="text-white/35">
									{" "}
									· template {relay.template}
								</span>
							)}
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
							Self-host relay accepts paired Detour desktop devices.
						</li>
					</ul>
					<Link
						to="/coding"
						className="mt-4 inline-flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 text-white/75 transition hover:bg-white/10 hover:text-white"
					>
						Open terminal <Icon.ArrowUpRight size={12} />
					</Link>
				</section>
			</div>

			{(backend === "selfhost" || pairCode) && (
				<SelfHostPairing prefillCode={pairCode} />
			)}
		</div>
	);
}

type PairedDevice = {
	id: string;
	name: string;
	createdAt: number;
	lastSeenAt: number | null;
};

type PairingInfo =
	| {
			deviceName: string;
			status: "pending" | "approved" | "consumed" | "expired";
	  }
	| null
	| undefined;

function deviceSeenText(device: PairedDevice): string {
	if (!device.lastSeenAt) return "Paired · waiting for desktop app";
	const elapsedMs = Math.max(0, Date.now() - device.lastSeenAt);
	if (elapsedMs < 2 * 60 * 1000) return "Seen by relay now";
	const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
	if (minutes < 60) return `Last seen ${minutes}m ago`;
	const hours = Math.max(1, Math.round(minutes / 60));
	return `Last seen ${hours}h ago`;
}

function SelfHostPairing({ prefillCode = "" }: { prefillCode?: string }) {
	const token = getDtourSessionToken();
	const navigate = useNavigate();
	const { selectedDeviceId, setBackend, setSelectedDeviceId } =
		useCodingSession();
	const normalizedPrefillCode = normalizePairCode(prefillCode);
	const deepLinked = normalizedPrefillCode.length > 0;
	const devices = useQuery(
		anyApi.codingDevices.listDevices,
		token ? { token } : "skip",
	) as PairedDevice[] | undefined;
	const info = useQuery(
		anyApi.codingDevices.pairingInfo,
		deepLinked ? { code: normalizedPrefillCode } : "skip",
	) as PairingInfo;
	const approve = useMutation(anyApi.codingDevices.approveDevicePairing);
	const revoke = useMutation(anyApi.codingDevices.revokeDevice);
	const [code, setCode] = useState(normalizedPrefillCode);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
		"idle",
	);

	useEffect(() => {
		if (deepLinked) setCode(normalizedPrefillCode);
	}, [deepLinked, normalizedPrefillCode]);

	const approveCode = async (raw: string) => {
		const c = normalizePairCode(raw);
		if (!token || c.length < 4) return;
		setBusy(true);
		setMsg(null);
		try {
			const result = (await approve({ token, code: c })) as {
				deviceId: string;
				deviceName: string;
			};
			setBackend("selfhost");
			setSelectedDeviceId(result.deviceId);
			setMsg({
				ok: true,
				text: `Paired ${result.deviceName}. Self-host is selected.`,
			});
			setCode("");
		} catch (e) {
			setMsg({
				ok: false,
				text: e instanceof Error ? e.message : "Pairing failed",
			});
		} finally {
			setBusy(false);
		}
	};

	const copyApprovalLink = async () => {
		if (!navigator.clipboard) {
			setCopyState("failed");
			return;
		}
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
	};

	const canApproveLinkedCode = Boolean(
		token && info?.status === "pending" && !busy,
	);
	const linkedDeviceName = info?.status === "pending" ? info.deviceName : null;
	const approvalUrl = typeof window === "undefined" ? "" : window.location.href;
	const linkedStatus =
		info === undefined
			? "Checking pairing code"
			: info === null
				? "Pairing code not found"
				: info.status === "pending"
					? `Ready to approve ${info.deviceName}`
					: info.status === "expired"
						? "Pairing code expired"
						: "Pairing code already used";

	function selectDevice(device: PairedDevice, openTerminal: boolean) {
		setBackend("selfhost");
		setSelectedDeviceId(device.id);
		if (openTerminal) navigate("/coding");
	}

	return (
		<section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md">
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
						{deepLinked ? "Approve this desktop" : "Pair your desktop"}
					</h2>
					<p className="mt-1 text-[13px] text-white/45">
						QR-approved desktops can back coding terminal sessions on your own
						machine.
					</p>
				</div>
				<Link
					to="/coding"
					className="inline-flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 text-[12px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
				>
					Terminal <Icon.ArrowUpRight size={12} />
				</Link>
			</div>

			{deepLinked ? (
				<div className="space-y-3">
					<p className="text-[13px] leading-relaxed text-white/60">
						Link{" "}
						<span className="font-medium text-white/90">
							{linkedDeviceName ?? "this desktop"}
						</span>{" "}
						to run coding sessions on your own machine with no sandbox charge.
					</p>
					<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pt-1">
							<code className="w-fit rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm tracking-widest text-white/75">
								{normalizedPrefillCode}
							</code>
							<button
								type="button"
								onClick={() => approveCode(normalizedPrefillCode)}
								disabled={!canApproveLinkedCode}
								className="w-fit rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
							>
								{busy
									? "Approving..."
									: linkedDeviceName
										? `Approve ${linkedDeviceName}`
										: "Approve desktop"}
							</button>
							<button
								type="button"
								onClick={() => void copyApprovalLink()}
								className="w-fit rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
							>
								Copy approval link
							</button>
						</div>
						{approvalUrl && (
							<div className="order-first flex w-fit flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:order-none">
								<div className="rounded-lg bg-white p-2">
									<QRCodeSVG
										value={approvalUrl}
										size={104}
										role="img"
										aria-label="Approval QR code"
									/>
								</div>
								<span className="text-center text-[10px] font-medium uppercase tracking-wide text-white/35">
									Scan to approve
								</span>
							</div>
						)}
					</div>
					<p
						className={cn(
							"text-[12px]",
							info?.status === "pending"
								? "text-emerald-300/90"
								: "text-white/40",
						)}
					>
						{linkedStatus}
					</p>
					{copyState !== "idle" && (
						<p
							className={cn(
								"text-[12px]",
								copyState === "copied"
									? "text-emerald-300/90"
									: "text-amber-300/90",
							)}
						>
							{copyState === "copied"
								? "Approval link copied."
								: "Could not copy approval link."}
						</p>
					)}
					{msg && (
						<p
							className={cn(
								"text-[12px]",
								msg.ok ? "text-emerald-300/90" : "text-amber-300/90",
							)}
						>
							{msg.text}
						</p>
					)}
				</div>
			) : (
				<>
					<p className="mb-3 text-[12px] leading-relaxed text-white/45">
						Open the <span className="text-white/70">Detour desktop app</span> →
						enable Self-host → scan its QR, copy its approval link, or enter the
						8-character code it shows. Sessions then run on your own computer —
						no sandbox charge.
					</p>
					<div className="flex items-center gap-2">
						<input
							value={code}
							onChange={(e) => setCode(normalizePairCode(e.target.value))}
							placeholder="ABCD1234"
							maxLength={8}
							className="w-36 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-violet-400/40"
						/>
						<button
							type="button"
							onClick={() => approveCode(code)}
							disabled={busy || normalizePairCode(code).length < 4}
							className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
						>
							{busy ? "Pairing..." : "Pair"}
						</button>
					</div>
					{msg && (
						<p
							className={cn(
								"mt-2 text-[12px]",
								msg.ok ? "text-emerald-300/90" : "text-amber-300/90",
							)}
						>
							{msg.text}
						</p>
					)}
				</>
			)}
			{devices && devices.length === 0 && (
				<div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[13px] text-white/45">
					No paired desktops yet. Start pairing in the Detour desktop app, then
					approve the QR or code here.
				</div>
			)}
			{devices && devices.length > 0 && (
				<ul className="mt-4 grid gap-2 md:grid-cols-2">
					{devices.map((d) => (
						<li
							key={d.id}
							className={cn(
								"rounded-xl border px-3 py-3 text-[13px] transition",
								selectedDeviceId === d.id
									? "border-violet-400/40 bg-violet-400/10 text-white"
									: "border-white/10 bg-white/[0.02] text-white/70",
							)}
						>
							<div className="flex items-start justify-between gap-3">
								<span>
									<span className="flex items-center gap-2 font-medium">
										<span
											className={cn(
												"h-1.5 w-1.5 rounded-full",
												d.lastSeenAt ? "bg-emerald-400" : "bg-amber-400",
											)}
										/>
										{d.name}
									</span>
									<span className="mt-1 block text-[12px] text-white/40">
										{deviceSeenText(d)}
									</span>
								</span>
								{selectedDeviceId === d.id && (
									<span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-violet-100/90">
										Selected
									</span>
								)}
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								<button
									type="button"
									onClick={() => selectDevice(d, false)}
									className="rounded-full border border-white/15 px-3 py-1.5 text-[12px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
								>
									Use for sessions
								</button>
								<button
									type="button"
									onClick={() => selectDevice(d, true)}
									className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black transition hover:bg-white/90"
								>
									Open terminal
								</button>
								<button
									type="button"
									onClick={() => {
										if (token) void revoke({ token, id: d.id });
									}}
									className="ml-auto text-[11px] uppercase tracking-wide text-white/35 transition hover:text-amber-300/90"
								>
									Unpair
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
