import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
	DTOUR_TEST_SESSION_TOKEN,
	readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import type {
	RemoteRuntimeAccess,
	RemoteRuntimeDomainMode,
	RemoteRuntimeFallbackStatus,
	RemoteRuntimeMeshMode,
	RemoteRuntimeMode,
	RemoteRuntimeProvider,
	RemoteRuntimeProviderStrategy,
	RemoteRuntimeStatus,
} from "@/lib/remoteRuntime";
import { getDtourSessionToken } from "@/lib/session";
import { AppShell } from "../AppShell";
import { CloudBuilderPanel } from "./CloudBuilderPanel";

type AgentSummary = {
	id: string;
	name: string;
	model: string;
	type: string;
	plugins?: string[];
};

type DeploymentSummary = {
	agentId: string;
	mode: RemoteRuntimeMode;
	providerStrategy: RemoteRuntimeProviderStrategy;
	activeProvider: RemoteRuntimeProvider;
	fallbackStatus: RemoteRuntimeFallbackStatus;
	status: RemoteRuntimeStatus;
	domainMode: RemoteRuntimeDomainMode;
	customDomain: string | null;
	webVisibility: RemoteRuntimeAccess;
	apiVisibility: RemoteRuntimeAccess;
	a2aEnabled: boolean;
	mcpEnabled: boolean;
	meshMode: RemoteRuntimeMeshMode;
	tailnet: string | null;
	headscaleUrl: string | null;
	meshHostname: string;
	webUiUrl: string;
	apiBaseUrl: string;
	lastError: string | null;
};

type InstanceSummary = {
	agent: AgentSummary;
	deployment: DeploymentSummary;
};

type ExternalConnectionSummary = {
	id: string;
	agentId: string;
	label: string;
	provider: string;
	baseUrl: string;
	apiBaseUrl: string | null;
	a2aUrl: string | null;
	mcpUrl: string | null;
	authMode: string;
	meshMode: string;
	meshHostname: string | null;
	status: string;
};

export default function CloudBuilderPage() {
	const testUser = readDtourPlaywrightUser();
	const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
	const instanceRowsQuery = useQuery(
		anyApi.remoteAgentDeployments.list,
		token && !testUser ? { token } : "skip",
	) as InstanceSummary[] | undefined;
	const externalConnectionsQuery = useQuery(
		anyApi.agentExternalConnections.listAll,
		token && !testUser ? { token } : "skip",
	) as ExternalConnectionSummary[] | undefined;
	const instanceRows = testUser ? [] : (instanceRowsQuery ?? []);
	const externalConnections = testUser ? [] : (externalConnectionsQuery ?? []);
	const agents = instanceRows.map((row) => row.agent);
	const deployments = instanceRows.map((row) => row.deployment);

	return (
		<AppShell title="Cloud Builder" bare>
			<CloudBuilderPanel
				token={testUser ? null : token}
				agents={agents}
				deployments={deployments}
				externalConnections={externalConnections}
			/>
		</AppShell>
	);
}
