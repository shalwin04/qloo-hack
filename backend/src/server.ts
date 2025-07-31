import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/index"; // ✅

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/", routes); // ✅ Mounts /init route

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
