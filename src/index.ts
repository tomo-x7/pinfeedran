import { Hono } from "hono";

const app = new Hono();

app.get("/xrpc/", (c) => {
	return c.text("hello xrpc");
});

export default app;
