require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oijxnxr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let userCollection;

async function run() {
  try {
    await client.connect();

    const db = client.db("volunteerDB");
    userCollection = db.collection("users");

    // Ensure unique email
    await userCollection.createIndex({ email: 1 }, { unique: true });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Mongo connection error:", err);
  }
}
run().catch(console.dir);

// routes
app.get("/", (req, res) => {
  res.send("Volunteer API running");
});

/**
 * POST /users
 * Body: { name, email, photo, bio, authProvider, createdAt }
 * Upsert by email (no duplicates)
 */
app.post("/users", async (req, res) => {
  try {
    if (!userCollection) return res.status(503).send("DB not ready");

    const { name, email, photo, bio, authProvider, createdAt } = req.body || {};
    if (!email) return res.status(400).send("Email is required");

    const now = new Date();
    const update = {
      $setOnInsert: {
        email,
        createdAt: createdAt || now.toISOString(),
      },
      $set: {
        name: name || "",
        photo: photo || "",
        bio: bio || "",
        authProvider: authProvider || "password",
        updatedAt: now.toISOString(),
      },
    };

    const result = await userCollection.updateOne({ email }, update, { upsert: true });

    const doc = await userCollection.findOne({ email }, { projection: { _id: 0 } });
    // result.upsertedId exists on first insert
    res.status(result.upsertedId ? 201 : 200).json({
      status: result.upsertedId ? "created" : "updated",
      user: doc,
    });
  } catch (err) {
    // handle duplicate key error, etc.
    if (err?.code === 11000) {
      return res.status(409).send("Email already exists");
    }
    console.error("POST /users error:", err);
    res.status(500).send("Server error");
  }
});

/**
 * (Optional) GET /users/:email
 */
app.get("/users/:email", async (req, res) => {
  try {
    if (!userCollection) return res.status(503).send("DB not ready");
    const email = req.params.email;
    const user = await userCollection.findOne({ email }, { projection: { _id: 0 } });
    if (!user) return res.status(404).send("Not found");
    res.json(user);
  } catch (err) {
    console.error("GET /users/:email error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on ${port}`);
});