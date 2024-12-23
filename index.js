import express from "express";
import supabase from "./supabaseClient.js";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  console.log("Received login request with email:", email);

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error) {
      console.log("Error verifying user:", error.message);
      return res
        .status(500)
        .json({ message: "Failed to verify user", error: error.message });
    }

    if (!data) {
      console.log("No user found with the provided email and password.");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    console.log("User found:", data);
    res.status(200).json({ message: "Login successful", user: data });
  } catch (e) {
    console.error("Error during login:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/getUser/:email", async (req, res) => {
  const email = req.params.email;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email);

    if (error) {
      console.log("Error verifying user:", error.message);
      return res
        .status(500)
        .json({ message: "Failed to verify user", error: error.message });
    }

    res.status(200).json({ data: data });
  } catch (e) {
    console.log("error: ", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/api/parking-slots", async (req, res) => {
  const { campusName } = req.query;

  if (!campusName) {
    return res.status(400).json({ message: "campusName is required" });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    const { data: campusData, error: campusError } = await supabase
      .from("campuses")
      .select("id")
      .eq("name", campusName)
      .single();

    if (campusError || !campusData) {
      return res.status(404).json({ message: "Campus not found" });
    }

    const campusId = campusData.id;

    const { data: resetSlots } = await supabase
      .from("parking_slots")
      .select("*")
      .eq("campus_id", campusId)
      .neq("last_reset_date", today);

    if (resetSlots && resetSlots.length > 0) {
      await supabase
        .from("parking_slots")
        .update({ is_available: true, last_reset_date: today })
        .eq("campus_id", campusId);
    }

    const { data, error } = await supabase
      .from("parking_slots")
      .select("*")
      .eq("campus_id", campusId)
      .order("slot_number", { ascending: true });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/bookings", async (req, res) => {
  const { user_id, parking_slot_id, booking_date } = req.body;

  try {
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .insert([{ user_id, parking_slot_id, booking_date }]);

    if (bookingError) {
      return res.status(400).json({ error: bookingError.message });
    }

    const { error: slotError } = await supabase
      .from("parking_slots")
      .update({ is_available: false })
      .eq("id", parking_slot_id);

    if (slotError) {
      return res.status(400).json({
        error: `Booking created, but failed to update slot: ${slotError.message}`,
      });
    }

    res.status(201).json({
      message: "Booking successful and slot updated",
      bookingData,
    });
  } catch (error) {
    console.error("Error booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/getParkingHistory/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("booking_date, parking_slot_id")
      .eq("user_id", userId);

    if (bookingError) {
      console.error("Error fetching booking data:", bookingError.message);
      return res.status(500).json({
        message: "Failed to fetch booking data",
        error: bookingError.message,
      });
    }

    const parkingSlotIds = bookingData.map(
      (booking) => booking.parking_slot_id
    );

    const { data: parkingData, error: parkingError } = await supabase
      .from("parking_slots")
      .select("slot_number, id")
      .in("id", parkingSlotIds);

    if (parkingError) {
      console.error("Error fetching parking data:", parkingError.message);
      return res.status(500).json({
        message: "Failed to fetch parking data",
        error: parkingError.message,
      });
    }

    const combinedData = bookingData.map((booking) => {
      const parkingSlot = parkingData.find(
        (slot) => slot.id === booking.parking_slot_id
      );
      return {
        booking_date: booking.booking_date,
        slot_number: parkingSlot ? parkingSlot.slot_number : "Unknown",
      };
    });

    res.status(200).json({ data: combinedData });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.send("Udah masuk");
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
