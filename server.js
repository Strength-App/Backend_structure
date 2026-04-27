import express from "express";
import cors from "cors";
import db from "./src/config/database.js";
import users from "./src/routes/userRoutes.js"
import * as path from "path";
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(".env") });

const PORT = process.env.PORT || 5050;

const app = express();
const mongoURI = process.env.MONGODB_URI;
const corsOptions = {
    origin: function(origin, callback) {
        const allowed = [
            "http://localhost:5173",
            "https://maxmethod-fitness.com",
            "https://www.maxmethod-fitness.com"
        ];
        if (!origin || allowed.includes(origin) || origin.endsWith(".vercel.app")) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

const __dirname = path.resolve();

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/users", users)

app.set("view-engine","react-html-parser")

// Home, Classification, Goals pages, History, Settings
app.get("/home", cors(corsOptions), (req, res, next) => {
    res.sendFile(path.join(__dirname, "/src/index.html"));
});
//
// app.get("/classification", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/goals", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/history", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });
//
// app.get("/settings", cors(corsOptions), (req, res, next) => {
//     res.sendFile(path.join(__dirname, "/src/index.html"));
// });

// start the Express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
