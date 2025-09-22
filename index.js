// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// CORS & middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);
app.use(express.json());

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oijxnxr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Collections (module scope so routes can access them)
let userCollection;
let postCollection;

async function run() {
  try {
    await client.connect();

    const db = client.db("volunteerDB");
    userCollection = db.collection("users");
    postCollection = db.collection("posts");

    // Helpful indexes
    await userCollection.createIndex({ email: 1 }, { unique: true });
    await postCollection.createIndex({ createdAt: -1 });
    await postCollection.createIndex({ organizerEmail: 1 });
    await postCollection.createIndex({ deadline: 1 });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Mongo connection error:", err);
  }
}
run().catch(console.error);

// Routes
app.get("/", (req, res) => {
  res.send("Volunteer API running");
});

// Create/Upsert user
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

    const result = await userCollection.updateOne({ email }, update, {
      upsert: true,
    });

    const doc = await userCollection.findOne(
      { email },
      { projection: { _id: 0 } }
    );

    res.status(result.upsertedId ? 201 : 200).json({
      status: result.upsertedId ? "created" : "updated",
      user: doc,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).send("Email already exists");
    }
    console.error("POST /users error:", err);
    res.status(500).send("Server error");
  }
});

// Get user by email (optional helper)
app.get("/users/:email", async (req, res) => {
  try {
    if (!userCollection) return res.status(503).send("DB not ready");
    const email = req.params.email;
    const user = await userCollection.findOne(
      { email },
      { projection: { _id: 0 } }
    );
    if (!user) return res.status(404).send("Not found");
    res.json(user);
  } catch (err) {
    console.error("GET /users/:email error:", err);
    res.status(500).send("Server error");
  }
});

// Create a volunteer need post
app.post("/posts", async (req, res) => {
  try {
    if (!postCollection) return res.status(503).send("DB not ready");

    const {
      thumbnail = "",
      title,
      description,
      category,
      location,
      needed,
      deadline,
      organizerName,
      organizerEmail,
      createdAt = new Date().toISOString(),
      status = "open",
    } = req.body || {};

    if (!title || !description || !category || !location) {
      return res.status(400).send("Missing required fields.");
    }
    if (!organizerEmail) {
      return res.status(401).send("Unauthorized: organizer email missing.");
    }
    const neededNum = Number(needed);
    if (!neededNum || neededNum <= 0) {
      return res.status(400).send("Invalid volunteers needed.");
    }
    if (!deadline) {
      return res.status(400).send("Deadline is required.");
    }

    const doc = {
      thumbnail,
      title,
      description,
      category,
      location,
      needed: neededNum,
      deadline, // ISO string
      organizerName: organizerName || "",
      organizerEmail,
      createdAt,
      status, // "open" | "closed"
    };

    const result = await postCollection.insertOne(doc);
    res.status(201).json({ insertedId: result.insertedId, post: doc });
  } catch (err) {
    console.error("POST /posts error:", err);
    res.status(500).send("Server error");
  }
});

app.get("/posts", async (req, res) => {
  try {
    if (!postCollection) return res.status(503).send("DB not ready");

    const { organizerEmail, upcoming, limit } = req.query;
    const q = {};

    if (organizerEmail) q.organizerEmail = organizerEmail;

    // upcoming=1 → only deadlines >= today
    if (String(upcoming) === "1") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      q.deadline = { $gte: today.toISOString() };
    }

    const cursor = postCollection
      .find(q, {
        projection: {
          // expose an id clients can link to
          _id: 1,
          thumbnail: 1,
          title: 1,
          description: 1,
          category: 1,
          location: 1,
          needed: 1,
          deadline: 1,
          organizerName: 1,
          organizerEmail: 1,
          createdAt: 1,
          status: 1,
        },
      })
      // if upcoming, sort by deadline asc, else by createdAt desc
      .sort(String(upcoming) === "1" ? { deadline: 1 } : { createdAt: -1 })
      .limit(Math.min(Number(limit) || 100, 100));

    const docs = await cursor.toArray();
    // Normalize _id to id (string) for frontend convenience
    const mapped = docs.map((d) => ({
      ...d,
      id: d._id?.toString?.(),
      _id: undefined,
    }));
    res.json(mapped);
  } catch (err) {
    console.error("GET /posts error:", err);
    res.status(500).send("Server error");
  }
});


// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on ${port}`);
});