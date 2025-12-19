import { Hono,Env as henv } from "hono";

const BEARER="bearer "
const GET_FEED_SKELETON="/xrpc/app.bsky.feed.getFeedSkeleton"

interface Env{
	Bindings:CloudflareBindings,Variables:{did:string}
}
const app = new Hono<Env>();

app.get(GET_FEED_SKELETON, async(c) => {
	const auth=c.req.header("Authorization")
	if(!auth||!auth.startsWith(BEARER)){
		return c.json({name:"Unauthorized"},{status:401})
	}
	const token=auth.slice(BEARER.length)
	const did = JSON.parse(atob(token.split(".")[1])).iss;
	c.set("did",did)

	return c.text("hello xrpc");
});

app.onError((err,c)=>{
	console.error(err)
	return c.json({name:"UnknownError"},500)
})

export default app;
