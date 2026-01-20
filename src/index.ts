import { Agent, type AppBskyFeedGetFeedSkeleton } from "@atproto/api";
import { type Context, Hono } from "hono";

const BEARER = "Bearer ";
const GET_FEED_SKELETON = "/xrpc/app.bsky.feed.getFeedSkeleton";
const agent = new Agent("https://public.api.bsky.app");

interface Env {
	Bindings: CloudflareBindings;
	// Variables: { did: string };
}
const app = new Hono<Env>();

app.get(GET_FEED_SKELETON, async (c) => {
	const did = getDid(c);
	if (did == null) return c.json({ status: "Unauthorized" }, 401);
	const rawData = await getFeedData(c, did);
	const start = Number.parseInt(c.req.query("cursor") ?? "0", 10);
	const end = start + Number.parseInt(c.req.query("limit") ?? "50", 10);
	const feed = rawData.slice(start, end).map((uri) => ({ post: uri }));
	const cursor = end >= rawData.length ? undefined : end.toString();
	console.log(JSON.stringify({ start, end, cursor,feedl:feed.length }));
	return c.json({ feed, cursor } satisfies AppBskyFeedGetFeedSkeleton.OutputSchema);
});

function getDid(c: Context): string | null {
	const auth = c.req.header("Authorization");
	if (!auth?.startsWith(BEARER)) return null;
	const token = auth.slice(BEARER.length);
	try {
		const did = JSON.parse(atob(token.split(".")[1])).iss;
		return did ?? null;
	} catch (e) {
		return null;
	}
}
async function getFeedData(c: Context<Env>, did: string): Promise<string[]> {
	const redis = c.env.KV;
	const cached = await redis.get(did, "text");
	if (cached != null) return cached.split(",");
	const follows = await getFollow(did);
	const data = await getPinPosts(follows);
	await redis.put(did, data.join(","), { expirationTtl: 10 * 60 });
	return data;
}
async function getFollow(did: string): Promise<string[]> {
	let cursor: string | undefined;
	const follows: string[] = [];
	do {
		const { data } = await agent.app.bsky.graph.getFollows({ actor: did, limit: 100, cursor });
		follows.push(...data.follows.map((d) => d.did));
		cursor = data.cursor;
	} while (cursor != null);
	return follows;
}
async function getPinPosts(dids: string[]): Promise<string[]> {
	const _getPinPosts = (dids: string[]) =>
		agent.app.bsky.actor
			.getProfiles({ actors: dids })
			.then(({ data }) => data.profiles.map((profile) => profile.pinnedPost?.uri).filter((uri) => uri != null));
	const promises: Promise<string[]>[] = [];
	for (let i = 0; i < Math.ceil(dids.length / 25); i++) {
		const current = dids.slice(25 * i, 25 * i + 25);
		const promise = _getPinPosts(current);
		promises.push(promise);
	}
	const raw = await Promise.all(promises);
	const data = raw
		.flat()
		.filter((uri) => uri != null)
		.map((uri) => ({ uri, r: Math.random() }))
		.toSorted((a, b) => a.r - b.r)
		.map((d) => d.uri);
	return data;
}

app.onError((err, c) => {
	console.error(err);
	return c.json({ name: "UnknownError" }, 500);
});

export default app;
