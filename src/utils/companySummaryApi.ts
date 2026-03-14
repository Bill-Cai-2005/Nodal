import { getApiEndpoint } from "./api";

type CompanySummaryResponse = {
    ticker: string;
    summary: string;
};

export async function fetchCompanySummary(ticker: string): Promise<string> {
    const res = await fetch(
        getApiEndpoint(`/api/company-summary/${encodeURIComponent(ticker)}`)
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to generate summary (${res.status}): ${text}`);
    }

    const data = (await res.json()) as CompanySummaryResponse;
    return data.summary;
}
