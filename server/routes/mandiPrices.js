
import express from "express";
import axios from "axios";

const router = express.Router();

const BASE_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"; // Agmarknet dataset

router.get("/", async (req, res) => {
  try {
    const { commodity, state, market, limit } = req.query;

    const params = {
      "api-key": process.env.mandi_api,
      format: "json",
      limit: limit || 200, // fetch more records to allow local filtering
    };

    // Fetch raw records (without relying on filters of API)
    const response = await axios.get(BASE_URL, { params });
    const records = response.data.records || [];

    // Apply local filtering (so even if API doesn’t return exact matches, we still filter)
    const filtered = records.filter((r) => {
      const matchesCommodity = !commodity || r.commodity.toLowerCase().includes(commodity.toLowerCase());
      const matchesState = !state || r.state.toLowerCase().includes(state.toLowerCase());
      const matchesMarket = !market || r.market.toLowerCase().includes(market.toLowerCase());
      return matchesCommodity && matchesState && matchesMarket;
    });

    // Simplify result structure
    const simplified = filtered.map((r) => ({
      date: r.arrival_date,
      state: r.state,
      market: r.market,
      commodity: r.commodity,
      variety: r.variety,
      min_price: r.min_price,
      modal_price: r.modal_price,
      max_price: r.max_price,
      unit: r.min_price_unit || "₹/Quintal",
    }));

    res.json({ data: simplified });
  } catch (err) {
    console.error("Error fetching mandi prices:", err.message);
    res.status(500).json({ error: "Failed to fetch mandi prices" });
  }
});
export default router;
// module.exports = router;
