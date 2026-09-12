/**
 * Duffel Flight Search Backend (Proxy Server)
 * ---------------------------------------------
 * Duffel's API cannot be called directly from a browser, and your access
 * token must stay secret. This server sits between your website and
 * Duffel — your website calls THIS server, and THIS server calls Duffel
 * using the token (kept in an environment variable, never in your HTML).
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const DUFFEL_TOKEN = process.env.DUFFEL_ACCESS_TOKEN;
const DUFFEL_BASE = "https://api.duffel.com";

if (!DUFFEL_TOKEN) {
  console.warn(
    "WARNING: DUFFEL_ACCESS_TOKEN is not set. Create a .env file with DUFFEL_ACCESS_TOKEN=your_token."
  );
}

// Simple PKR conversion for display (update rates as needed)
const USD_TO_PKR = 300;
const GBP_TO_PKR = 380;
const EUR_TO_PKR = 320;

function toPKR(amount, currency) {
  const value = parseFloat(amount);
  if (currency === "PKR") return Math.round(value);
  if (currency === "USD") return Math.round(value * USD_TO_PKR);
  if (currency === "GBP") return Math.round(value * GBP_TO_PKR);
  if (currency === "EUR") return Math.round(value * EUR_TO_PKR);
  return Math.round(value);
}

/**
 * POST /api/search-flights
 * Body: { origin, destination, departureDate, returnDate, passengers, cabinClass }
 */
app.post("/api/search-flights", async (req, res) => {
  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers = 1,
      cabinClass = "economy",
    } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: "origin, destination and departureDate are required.",
      });
    }

    const slices = [
      { origin, destination, departure_date: departureDate },
    ];

    if (returnDate) {
      slices.push({
        origin: destination,
        destination: origin,
        departure_date: returnDate,
      });
    }

    const passengerList = Array.from({ length: Number(passengers) || 1 }).map(
      () => ({ type: "adult" })
    );

    const offerRequestResp = await fetch(
      `${DUFFEL_BASE}/air/offer_requests?return_offers=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DUFFEL_TOKEN}`,
          "Duffel-Version": "v2",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            slices,
            passengers: passengerList,
            cabin_class: cabinClass,
          },
        }),
      }
    );

    const offerRequestData = await offerRequestResp.json();

    if (!offerRequestResp.ok) {
      console.error("Duffel error:", offerRequestData);
      return res.status(offerRequestResp.status).json({
        error: "Duffel API request failed.",
        details: offerRequestData,
      });
    }

    const offers = offerRequestData.data.offers || [];

    const flights = offers.map((offer) => {
      const firstSlice = offer.slices[0];
      const firstSegment = firstSlice.segments[0];
      const lastSegment = firstSlice.segments[firstSlice.segments.length - 1];

      return {
        id: offer.id,
        airline: firstSegment.marketing_carrier.name,
        airlineLogo: firstSegment.marketing_carrier.logo_symbol_url,
        flightNo: `${firstSegment.marketing_carrier.iata_code} ${firstSegment.marketing_carrier_flight_number}`,
        dep: firstSegment.departing_at,
        arr: lastSegment.arriving_at,
        direct: firstSlice.segments.length === 1,
        stops: firstSlice.segments.length - 1,
        priceOriginal: offer.total_amount,
        currencyOriginal: offer.total_currency,
        pricePKR: toPKR(offer.total_amount, offer.total_currency),
        baggage:
          offer.passengers?.[0]?.baggages
            ?.map((b) => `${b.quantity}x ${b.type}`)
            .join(", ") || "See fare rules",
        expiresAt: offer.expires_at,
      };
    });

    res.json({ flights, offerRequestId: offerRequestData.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duffel proxy server running on http://localhost:${PORT}`);
});
