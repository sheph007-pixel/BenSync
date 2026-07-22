import express from "express";
import { serveMarketing } from "./server/marketing";
const app = express();
app.use(serveMarketing);
app.use((_req, res) => res.status(404).send("fallthrough"));
app.listen(5599, () => console.log("test server up"));
