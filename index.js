const express = require('express')
const cors = require('cors')
const app = express()
const { MongoClient, ServerApiVersion } = require('mongodb');
const dns = require('dns');

// Force Node.js to use Google DNS internally, bypassing stubborn router/antivirus blocks!
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config()
const port = process.env.PORT || 3000

// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster1.uxgjftg.mongodb.net/?appName=Cluster1`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('spread_fast_db')
    const parcelsCollection = db.collection('parcels')

    // parcel related api

    app.get('/parcels',async(req,res)=>{
      
      const query = {}
      const {email} = req.query
      if(email) query.senderEmail = email

      const cursor = parcelsCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })

    app.post('/parcels',async(req,res)=>{
        const parcel = req.body
        const result = await parcelsCollection.insertOne(parcel)
        res.send(result)
    })









    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Spread fast!!!!')
})

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})