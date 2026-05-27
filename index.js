const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const dns = require("dns");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const crypto = require("crypto");
const verifyFBToken = require("./middleware/verifyFBToken");

// Force Node.js to use Google DNS internally, bypassing stubborn router/antivirus blocks!
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

const generateTrackingId = () => {
  const prefix = "spread-fast";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const number = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${date}-${number}`;
};

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster1.uxgjftg.mongodb.net/?appName=Cluster1`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("spread_fast_db");
    const parcelsCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const userCollection = db.collection("users");

    // parcel related api

    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) query.senderEmail = email;
      const options = { sort: { created_at: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);
      res.send(result);
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.created_at = new Date();
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });

    // payment gateway API
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.deliveryCharge) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for ${paymentInfo.parcelName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const trackingId = generateTrackingId();
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const transactionExists = await paymentCollection.findOne(query)
      if(transactionExists) return res.send({message:"Transaction already exist",transactionId:transactionId,trackingId:transactionExists.trackingId})
      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: session.payment_status,
            trackingId: trackingId,
          },
        };
        const result = await parcelsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmil: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: transactionId,
          paymentStatus: session.payment_status,
          paid_at: new Date(),
          trackingId: trackingId
        };

        const resultPayment = await paymentCollection.insertOne(payment);

        res.send({
          success: true,
          modifyParcel: result,
          trackingId: trackingId,
          transactionId: session.payment_intent,
          paymentInfo: resultPayment,
        });
        return;
      }
      res.send({ success: false });
    });

    app.get('/payments',verifyFBToken,async(req,res)=>{
      const email = req.query.email
      const query = {}
      if(email){
        query.customerEmil = email
        if(email!=req.decoded_email){
          return res.status(403).send({message: "Forbidden access"})
        }
      }
      const cursor = paymentCollection.find(query).sort({paid_at:-1})
      const result = await cursor.toArray()
      res.send(result)
    })

    // user related API 

    app.post('/users',async(req,res)=>{
      const user = req.body
      user.role = 'user'
      user.created_at = new Date()
      const isUserAvailable = await userCollection.findOne({ email: user.email })
      if(isUserAvailable) return res.send("User already exists")
      const result = await userCollection.insertOne(user)
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Spread fast!!!!");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
