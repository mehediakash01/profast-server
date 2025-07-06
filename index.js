require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jcgtqm0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Client Setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Main Async Function
async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected ✅");

    const db = client.db("courierDB");
    const parcelCollection = db.collection("parcel");

   // GET parcels (all or user-specific)
app.get("/parcels", async (req, res) => {
  try {
    const { email } = req.query; // e.g., /parcels?email=user@gmail.com

    const query = email ? { created_by: email } : {};
    const result = await parcelCollection
      .find(query)
      .sort({ createdAt: -1 }) // latest first
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Failed to fetch parcels:", error);
    res.status(500).send({ error: "Failed to fetch parcels" });
  }
});


    // POST a new parcel
    app.post("/parcels", async (req, res) => {
      const newParcel = req.body;
      const result = await parcelCollection.insertOne(newParcel);
      res.send(result);
    });

    // delete a parcel
    app.delete('/parcels/:id', async (req, res) => {
  const id = req.params.id;
  const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});


  } catch (err) {
    console.error("DB Error:", err);
  }
}

run();

// Root route
app.get("/", (req, res) => {
  res.send("the parcel is coming....");
});

// Start server
app.listen(port, () => {
  console.log(`The port is running on ${port} 🚀`);
});
