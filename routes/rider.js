const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkRole } = require('../middleware/auth');

router.use(checkRole('Rider'));

router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;

        // Fetch Rider Info
        const [riders] = await db.execute('SELECT Rider_ID, Wallet_Balance FROM Rider WHERE User_ID = ?', [userId]);
        if (riders.length === 0) return res.send('Rider profile not found.');
        const riderId = riders[0].Rider_ID;
        const walletBalance = riders[0].Wallet_Balance;

        // Fetch Active Ride
        const [activeRides] = await db.execute(`
            SELECT r.Ride_ID, r.Fare, r.Distance_KM, 
                   l1.City as PickupCity, l1.Street as PickupStreet,
                   l2.City as DropoffCity, l2.Street as DropoffStreet,
                   d.Avg_Rating as DriverRating, u.FullName as DriverName
            FROM Ride r
            JOIN Location l1 ON r.Pickup_ID = l1.Location_ID
            JOIN Location l2 ON r.Dropoff_ID = l2.Location_ID
            JOIN Driver d ON r.Driver_ID = d.Driver_ID
            JOIN Users u ON d.User_ID = u.User_ID
            WHERE r.Rider_ID = ? AND r.Ride_Status = 'Accepted'
            ORDER BY r.Request_Time DESC LIMIT 1
        `, [riderId]);
        const activeRide = activeRides.length > 0 ? activeRides[0] : null;

        // Fetch Ride History
        const [history] = await db.execute(`
            SELECT r.Ride_ID, r.Ride_Status, r.Fare, r.Distance_KM, 
                   l1.City as PickupCity, l1.Street as PickupStreet,
                   l2.City as DropoffCity, l2.Street as DropoffStreet,
                   r.Request_Time
            FROM Ride r
            JOIN Location l1 ON r.Pickup_ID = l1.Location_ID
            JOIN Location l2 ON r.Dropoff_ID = l2.Location_ID
            WHERE r.Rider_ID = ? AND r.Ride_Status != 'Accepted'
            ORDER BY r.Request_Time DESC
        `, [riderId]);



        // Fetch Promos
        const [promos] = await db.execute("SELECT Code, Discount, Expiry_Date FROM PromoCode WHERE Status = 'Active' AND Expiry_Date >= CURDATE() AND Usage_Count < Max_Usage");

        res.render('rider/dashboard', {
            user: req.session.user,
            history,
            activeRide,
            walletBalance,
            promos
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Find Available Drivers
router.post('/find-drivers', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;
        let { pickupCity, pickupStreet, dropoffCity, dropoffStreet, distance, duration } = req.body;

        // Fallback for distance/duration if missing
        if (!distance || isNaN(distance)) distance = 5.0;
        if (!duration || isNaN(duration)) duration = 15;

        // 1. Get Rider ID and Wallet
        const [riders] = await db.execute('SELECT Rider_ID, Wallet_Balance FROM Rider WHERE User_ID = ?', [userId]);
        if (riders.length === 0) return res.send('Rider profile not found.');
        const riderId = riders[0].Rider_ID;
        const walletBalance = riders[0].Wallet_Balance;

        // 2. Fetch base history/promos for rendering dashboard
        const [history] = await db.execute(`
            SELECT r.Ride_ID, r.Ride_Status, r.Fare, r.Distance_KM, 
                   l1.City as PickupCity, l1.Street as PickupStreet,
                   l2.City as DropoffCity, l2.Street as DropoffStreet,
                   r.Request_Time
            FROM Ride r
            JOIN Location l1 ON r.Pickup_ID = l1.Location_ID
            JOIN Location l2 ON r.Dropoff_ID = l2.Location_ID
            WHERE r.Rider_ID = ? ORDER BY r.Request_Time DESC
        `, [riderId]);
        const [promos] = await db.execute("SELECT Code, Discount, Expiry_Date FROM PromoCode WHERE Status = 'Active' AND Expiry_Date >= CURDATE() AND Usage_Count < Max_Usage");

        // 3. Find all available, verified drivers with Active accounts
        const [availableDriversRaw] = await db.execute(`
            SELECT d.Driver_ID, u.FullName, d.Avg_Rating, v.Vehicle_Type, v.Make, v.Model, v.Vehicle_ID
            FROM Driver d
            JOIN Users u ON d.User_ID = u.User_ID
            JOIN Vehicle v ON d.Driver_ID = v.Driver_ID
            WHERE d.Availability_Status = 'Online' 
              AND d.Verif_Status = 'Verified' 
              AND u.Account_Status = 'Active'
        `);

        if (availableDriversRaw.length === 0) {
            return res.render('rider/dashboard', {
                user: req.session.user, history, walletBalance, promos, activeRide: null,
                error: 'No drivers currently available. Please try again later.'
            });
        }

        // Determine dynamic surge multiplier (e.g., Rush hours)
        const currentHour = new Date().getHours();
        let currentSurge = 1.0;
        // Morning Rush Hour (7 AM - 9 AM)
        if (currentHour >= 7 && currentHour <= 9) currentSurge = 1.25;
        // Evening Rush Hour (5 PM - 8 PM)
        else if (currentHour >= 17 && currentHour <= 20) currentSurge = 1.5;

        // 4. Calculate Base Fare using Procedure
        await db.execute('CALL CalculateFare(?, ?, ?, @fare)', [distance, duration, currentSurge]);
        const [[{ fare: baseFare }]] = await db.execute('SELECT @fare AS fare');

        // 5. Apply Multipliers
        const availableDrivers = availableDriversRaw.map(d => {
            let multiplier = 1.0;
            if (d.Vehicle_Type === 'Premium') multiplier = 1.5;
            if (d.Vehicle_Type === 'Bike') multiplier = 0.6;
            
            return {
                ...d,
                CalculatedFare: (baseFare * multiplier).toFixed(2)
            };
        });

        // 6. Render Dashboard with availableDrivers array and booking details
        res.render('rider/dashboard', {
            user: req.session.user,
            history,
            walletBalance,
            promos,
            activeRide: null,
            availableDrivers,
            bookingDetails: { pickupCity, pickupStreet, dropoffCity, dropoffStreet, distance, duration }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while finding drivers.');
    }
});

// Book Specific Driver
router.post('/book-specific', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;
        const { driverId, vehicleId, calculatedFare, pickupCity, pickupStreet, dropoffCity, dropoffStreet, distance, duration } = req.body;

        const [riders] = await db.execute('SELECT Rider_ID FROM Rider WHERE User_ID = ?', [userId]);
        if (riders.length === 0) return res.send('Rider profile not found.');
        const riderId = riders[0].Rider_ID;

        // Helper to get or insert location
        const getOrInsertLocation = async (city, street) => {
            const [loc] = await db.execute('SELECT Location_ID FROM Location WHERE City = ? AND Street = ?', [city, street]);
            if (loc.length > 0) return loc[0].Location_ID;
            const [result] = await db.execute('INSERT INTO Location (City, Street) VALUES (?, ?)', [city, street]);
            return result.insertId;
        };

        const pickupId = await getOrInsertLocation(pickupCity, pickupStreet);
        const dropoffId = await getOrInsertLocation(dropoffCity, dropoffStreet);

        // Insert Ride with 'Requested' status
        await db.execute(
            "INSERT INTO Ride (Rider_ID, Driver_ID, Vehicle_ID, Pickup_ID, Dropoff_ID, Distance_KM, Duration_Minutes, Fare, Ride_Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Requested')",
            [riderId, driverId, vehicleId, pickupId, dropoffId, distance, duration, calculatedFare]
        );

        res.redirect('/rider');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while booking specific driver.');
    }
});

// Pay and Complete Ride
router.post('/pay/:rideId', async (req, res) => {
    try {
        const rideId = req.params.rideId;
        const { promoCode } = req.body;
        const userId = req.session.user.User_ID;

        // Get Rider ID
        const [riders] = await db.execute('SELECT Rider_ID FROM Rider WHERE User_ID = ?', [userId]);
        const riderId = riders[0].Rider_ID;

        // Fetch driver and original fare
        const [rides] = await db.execute('SELECT Driver_ID, Fare FROM Ride WHERE Ride_ID = ?', [rideId]);
        if (rides.length > 0) {
            const driverId = rides[0].Driver_ID;
            let amount = parseFloat(rides[0].Fare);
            let appliedPromoId = null;

            // Check Promo Code Validity
            if (promoCode && promoCode.trim() !== '') {
                const [promos] = await db.execute(
                    "SELECT Promo_ID, Discount FROM PromoCode WHERE Code = ? AND Status = 'Active' AND Expiry_Date >= CURDATE() AND Usage_Count < Max_Usage",
                    [promoCode.trim()]
                );
                if (promos.length > 0) {
                    appliedPromoId = promos[0].Promo_ID;
                    const discount = parseFloat(promos[0].Discount);
                    amount = Math.max(0, amount - discount); // Subtract flat discount
                }
            }

            // 1. Insert Payment as Pending first
            const [paymentResult] = await db.execute(
                "INSERT INTO Payment (Ride_ID, Rider_ID, Amount, Payment_Method, Payment_Status) VALUES (?, ?, ?, 'Wallet', 'Pending')",
                [rideId, riderId, amount]
            );
            const paymentId = paymentResult.insertId;

            // 2. Apply Promo Usage to automatically fire `trg_promo_usage`
            if (appliedPromoId) {
                await db.execute("INSERT INTO Payment_Promo (Payment_ID, Promo_ID) VALUES (?, ?)", [paymentId, appliedPromoId]);
            }
            
            // 3. Deduct fare from Wallet
            await db.execute("UPDATE Rider SET Wallet_Balance = Wallet_Balance - ? WHERE Rider_ID = ?", [amount, riderId]);
            
            // 4. Update Payment to Paid to automatically fire `trg_payment_paid` (Updates Ride_Status to Completed)
            await db.execute("UPDATE Payment SET Payment_Status = 'Paid' WHERE Payment_ID = ?", [paymentId]);
            
            // 5. Free driver
            await db.execute("UPDATE Driver SET Availability_Status = 'Online' WHERE Driver_ID = ?", [driverId]);
        }

        res.redirect('/rider');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while paying for ride.');
    }
});

// Cancel Ride
router.post('/cancel/:rideId', async (req, res) => {
    try {
        const rideId = req.params.rideId;
        const userId = req.session.user.User_ID;

        // Verify the ride belongs to the rider to prevent unauthorized cancellations
        const [riders] = await db.execute('SELECT Rider_ID FROM Rider WHERE User_ID = ?', [userId]);
        const riderId = riders[0].Rider_ID;

        const [rides] = await db.execute('SELECT Driver_ID, Rider_ID FROM Ride WHERE Ride_ID = ?', [rideId]);
        if (rides.length > 0 && rides[0].Rider_ID === riderId) {
            const driverId = rides[0].Driver_ID;
            
            // Mark ride as Cancelled
            await db.execute("UPDATE Ride SET Ride_Status = 'Cancelled' WHERE Ride_ID = ?", [rideId]);
            
            // Set driver back online
            await db.execute("UPDATE Driver SET Availability_Status = 'Online' WHERE Driver_ID = ?", [driverId]);
        }

        res.redirect('/rider');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while cancelling ride.');
    }
});

// Add Funds
router.post('/wallet/add', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;
        const { amount } = req.body;
        
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            await db.execute('UPDATE Rider SET Wallet_Balance = Wallet_Balance + ? WHERE User_ID = ?', [parseFloat(amount), userId]);
        }
        
        res.redirect('/rider');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while adding funds.');
    }
});

// Rate Driver
router.post('/rate/:rideId', async (req, res) => {
    try {
        const rideId = req.params.rideId;
        const { score, comment } = req.body;
        
        // Fetch driver ID for this ride
        const [rides] = await db.execute('SELECT Driver_ID FROM Ride WHERE Ride_ID = ?', [rideId]);
        if (rides.length > 0) {
            const driverId = rides[0].Driver_ID;
            
            // Insert Rating
            await db.execute(
                "INSERT INTO Rating (Ride_ID, Rated_By, Rated_User_ID, Score, Comment) VALUES (?, 'Rider', ?, ?, ?)",
                [rideId, driverId, score, comment]
            );

            // Update Driver's Avg_Rating manually to ensure it's not hardcoded
            const [avgRows] = await db.execute("SELECT AVG(Score) as avgScore FROM Rating WHERE Rated_User_ID = ? AND Rated_By = 'Rider'", [driverId]);
            const avgScore = avgRows[0].avgScore || score;
            await db.execute("UPDATE Driver SET Avg_Rating = ? WHERE Driver_ID = ?", [Number(avgScore).toFixed(2), driverId]);
        }
        
        res.redirect('/rider');
    } catch (err) {
        console.error(err);
        // Handle duplicate entry if already rated gracefully
        if (err.code === 'ER_DUP_ENTRY') {
            return res.send("<script>alert('You have already rated this driver for this ride!'); window.location.href='/rider';</script>");
        }
        res.status(500).send('Server Error while rating driver.');
    }
});

module.exports = router;
