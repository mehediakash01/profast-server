require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const app = express();
const stripe = Stripe(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
const serviceAccount = require("./firebaseAdmin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
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

// jwt token

const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  // verify the token
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(403).send({ message: "forbidden access" });
  }
};
// Main Async Function
async function run() {
  try {
    await client.connect();
    console.log("MongoDB connected ✅");

    const db = client.db("courierDB");
    const parcelCollection = db.collection("parcel");
    const paymentsCollection = db.collection("payments");
    const trackingCollection = db.collection("tracking");
    const ridersCollection = db.collection("riders");
    const usersCollection = db.collection("users");

    // GET: Get user role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("Error getting user role:", error);
        res.status(500).send({ message: "Failed to get role" });
      }
    });
    // GET parcels (all or user-specific)
    app.get("/parcels", verifyFBToken, async (req, res) => {
      try {
        const { email } = req.query;
        const query = email ? { created_by: email } : {};
        const result = await parcelCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed to fetch parcels:", error);
        res.status(500).send({ error: "Failed to fetch parcels" });
      }
    });

    // GET specific parcel by ID
    app.get("/parcels/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const parcel = await parcelCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(parcel);
      } catch (error) {
        console.error("Error fetching parcel by ID:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // posting tracking update

    app.post("/tracking", async (req, res) => {
      const {
        tracking_id,
        parcel_id,
        status,
        message,
        updated_by = "",
      } = req.body;

      const log = {
        tracking_id,
        parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
        status,
        message,
        time: new Date(),
        updated_by,
      };

      const result = await trackingCollection.insertOne(log);
      res.send({ success: true, insertedId: result.insertedId });
    });

    // GET payment history (user or admin)
    app.get("/payments", async (req, res) => {
      try {
        const { email } = req.query;
        const query = email ? { email } : {};
        const payments = await paymentsCollection
          .find(query)
          .sort({ paid_at: -1 })
          .toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Failed to get payments" });
      }
    });

    // POST: Create new parcel
    app.post("/parcels", async (req, res) => {
      try {
        const newParcel = req.body;
        const result = await parcelCollection.insertOne(newParcel);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to create parcel" });
      }
    });

    // DELETE parcel by ID
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await parcelCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    // POST: Create Stripe PaymentIntent
    app.post("/create-payment-intent", async (req, res) => {
      const { amountInCents } = req.body;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Error creating PaymentIntent:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // POST: Record payment and update parcel status
    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, amount, paymentMethod, transactionId } =
          req.body;

        const updateResult = await parcelCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          { $set: { paymentStatus: "paid" } }
        );

        if (updateResult.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Parcel not found or already paid" });
        }

        const paymentDoc = {
          parcelId,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at: new Date(),
          paid_at_string: new Date().toISOString(),
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        res.status(201).send({
          message: "Payment recorded and parcel marked as paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment processing failed:", error);
        res.status(500).send({ message: "Failed to record payment" });
      }
    });

    // rider routes

    app.post("/riders", verifyFBToken, async (req, res) => {
      const rider = req.body;
      const result = await ridersCollection.insertOne(rider);
      res.send(result);
    });

    app.get("/riders/pending", verifyFBToken, async (req, res) => {
      try {
        const pendingRiders = await ridersCollection
          .find({ status: "pending" })
          .toArray();

        res.send(pendingRiders);
      } catch (error) {
        console.error("Failed to load pending riders:", error);
        res.status(500).send({ message: "Failed to load pending riders" });
      }
    });

    app.get("/riders/active", async (req, res) => {
      const result = await ridersCollection
        .find({ status: "active" })
        .toArray();
      res.send(result);
    });

      app.get("/riders/available", async (req, res) => {
            const { district } = req.query;

            try {
                const riders = await ridersCollection
                    .find({
                        district,
                    })
                    .toArray();

                res.send(riders);
            } catch (err) {
                res.status(500).send({ message: "Failed to load riders" });
            }
        });

    app.patch("/riders/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status,
        },
      };

      try {
        const result = await ridersCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to update rider status" });
      }
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
