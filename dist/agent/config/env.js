import "dotenv/config";
function requireEnv(key) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    throw new Error(`Missing required env var: ${key}`);
}
const googleApiKey = requireEnv("GOOGLE_GENERATIVE_AI_API_KEY");
const normalizeDomain = (domain) => {
    let normalized = domain.trim().toLowerCase();
    while (normalized.startsWith(".")) {
        normalized = normalized.slice(1);
    }
    return normalized;
};
const parseDomainList = (value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
        return [];
    }
    const domains = [];
    for (const segment of value.split(",")) {
        const normalized = normalizeDomain(segment);
        if (normalized.length > 0) {
            domains.push(normalized);
        }
    }
    return domains;
};
export const ENV = {
    GOOGLE_API_KEY: googleApiKey,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
    EXA_API_KEY: process.env.EXA_API_KEY ?? "",
    EXA_ALLOWED_DOMAINS: parseDomainList(process.env.EXA_ALLOWED_DOMAINS),
    EXA_DENIED_DOMAINS: parseDomainList(process.env.EXA_DENIED_DOMAINS),
};
