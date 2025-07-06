require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require('stripe');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const stripe = Stripe(process.env.PAYMENT_SECRET_KEY);
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

// get specific parcel by id



app.get('/parcels/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });
    res.send(parcel);
  } catch (error) {
    console.error('Error fetching parcel by ID:', error);
    res.status(500).json({ message: 'Internal Server Error' });
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


// POST /api/payment/create-payment-intent
app.post("/create-payment-intent", async (req, res) => {
  const { amountInCents } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount :amountInCents,
      currency: "usd",
     payment_method_types: ['card'],

    
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error("Error creating PaymentIntent:", err);
    res.status(500).json({ error: err.message });
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
