import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
	DTOUR_TEST_SESSION_TOKEN,
	readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
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
	const agentsQuery = useQuery(
		anyApi.agents.list,
		token && !testUser ? { token } : "skip",
	) as AgentSummary[] | undefined;
	const externalConnectionsQuery = useQuery(
		anyApi.agentExternalConnections.listAll,
		token && !testUser ? { token } : "skip",
	) as ExternalConnectionSummary[] | undefined;
	const agents = testUser ? [] : (agentsQuery ?? []);
	const externalConnections = testUser ? [] : (externalConnectionsQuery ?? []);

	return (
		<AppShell title="Cloud Builder" bare>
			<CloudBuilderPanel
				token={testUser ? null : token}
				agents={agents}
				externalConnections={externalConnections}
			/>
		</AppShell>
	);
}
