const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkRole } = require('../middleware/auth');

router.use(checkRole('Admin'));

router.get('/', async (req, res) => {
    try {
        // Fetch User counts
        const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) as totalUsers FROM Users');
        const [[{ totalRiders }]] = await db.execute('SELECT COUNT(*) as totalRiders FROM Rider');
        const [[{ totalDrivers }]] = await db.execute('SELECT COUNT(*) as totalDrivers FROM Driver');

        // Fetch recent rides
        const [recentRides] = await db.execute(`
            SELECT r.Ride_ID, r.Ride_Status, u1.FullName as RiderName, u2.FullName as DriverName, r.Fare
            FROM Ride r
            LEFT JOIN Rider ri ON r.Rider_ID = ri.Rider_ID
            LEFT JOIN Users u1 ON ri.User_ID = u1.User_ID
            LEFT JOIN Driver d ON r.Driver_ID = d.Driver_ID
            LEFT JOIN Users u2 ON d.User_ID = u2.User_ID
            ORDER BY r.Request_Time DESC LIMIT 5
        `);

        // Fetch total revenue
        const [[{ totalRevenue }]] = await db.execute("SELECT SUM(Amount) as totalRevenue FROM Payment WHERE Payment_Status = 'Paid'");

        // Fetch pending drivers
        const [pendingDrivers] = await db.execute(`
            SELECT d.Driver_ID, u.FullName, d.CNIC, d.License_Number
            FROM Driver d
            JOIN Users u ON d.User_ID = u.User_ID
            WHERE d.Verif_Status = 'Pending'
        `);

        // Vehicles
        const [vehicles] = await db.execute('SELECT Make, Model, License_Plate, Vehicle_Type, Verification_Status FROM Vehicle LIMIT 5');

        // Fetch full lists for modals
        const [allRiders] = await db.execute(`
            SELECT u.FullName, u.Account_Status, 
                   (SELECT Email FROM User_Email WHERE User_ID = u.User_ID LIMIT 1) as Email,
                   (SELECT Phone_Number FROM User_Phone WHERE User_ID = u.User_ID LIMIT 1) as Phone
            FROM Rider r
            JOIN Users u ON r.User_ID = u.User_ID
        `);

        const [allDrivers] = await db.execute(`
            SELECT u.FullName, d.CNIC, d.License_Number, d.Verif_Status, d.Avg_Rating, d.Total_Trips, u.Account_Status,
                   (SELECT Phone_Number FROM User_Phone WHERE User_ID = u.User_ID LIMIT 1) as Phone, d.User_ID
            FROM Driver d
            JOIN Users u ON d.User_ID = u.User_ID
        `);

        // Fetch All Reviews
        const [reviews] = await db.execute(`
            SELECT r.Score, r.Comment, ur.FullName as RiderName, ud.FullName as DriverName, r.Timestamp
            FROM Rating r
            JOIN Driver d ON r.Rated_User_ID = d.Driver_ID
            JOIN Users ud ON d.User_ID = ud.User_ID
            JOIN Ride rd ON r.Ride_ID = rd.Ride_ID
            JOIN Rider rider ON rd.Rider_ID = rider.Rider_ID
            JOIN Users ur ON rider.User_ID = ur.User_ID
            ORDER BY r.Timestamp DESC LIMIT 10
        `);

        // Fetch Admin Notifications
        const [notifications] = await db.execute(`
            SELECT Notification_ID, Message, Created_At 
            FROM Admin_Notifications 
            ORDER BY Created_At DESC LIMIT 5
        `);

        // Fetch Fare Rules
        const [fareRules] = await db.execute("SELECT Base_Rate, Per_KM_Rate, Per_Min_Rate FROM FareRules LIMIT 1");
        const currentFareRules = fareRules.length > 0 ? fareRules[0] : { Base_Rate: 150, Per_KM_Rate: 40, Per_Min_Rate: 5 };

        res.render('admin/dashboard', {
            user: req.session.user,
            stats: { totalUsers, totalRiders, totalDrivers, totalRevenue: totalRevenue || 0 },
            recentRides,
            vehicles,
            pendingDrivers,
            allRiders,
            allDrivers,
            reviews,
            notifications,
            currentFareRules
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Approve driver
router.post('/approve-driver/:id', async (req, res) => {
    try {
        const driverId = req.params.id;
        await db.execute("UPDATE Driver SET Verif_Status = 'Verified' WHERE Driver_ID = ?", [driverId]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Reject driver
router.post('/reject-driver/:id', async (req, res) => {
    try {
        const driverId = req.params.id;
        await db.execute("UPDATE Driver SET Verif_Status = 'Rejected' WHERE Driver_ID = ?", [driverId]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Update Fare Rules
router.post('/update-fare', async (req, res) => {
    try {
        const { baseRate, perKmRate, perMinRate } = req.body;
        
        // Ensure FareRules table has at least one row
        const [rows] = await db.execute("SELECT COUNT(*) as cnt FROM FareRules");
        if (rows[0].cnt === 0) {
            await db.execute("INSERT INTO FareRules (Base_Rate, Per_KM_Rate, Per_Min_Rate) VALUES (?, ?, ?)", [baseRate, perKmRate, perMinRate]);
        } else {
            // Update the existing rule (assuming ID 1 is the active rule)
            await db.execute("UPDATE FareRules SET Base_Rate = ?, Per_KM_Rate = ?, Per_Min_Rate = ?", [baseRate, perKmRate, perMinRate]);
        }
        
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error updating fare rules.');
    }
});

// Unsuspend Driver
router.post('/unsuspend-driver/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        await db.execute("UPDATE Users SET Account_Status = 'Active' WHERE User_ID = ?", [userId]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error unsuspending driver.');
    }
});

// Remove User
router.post('/remove-user', async (req, res) => {
    try {
        const { userId } = req.body;
        await db.execute('DELETE FROM Users WHERE User_ID = ?', [userId]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while removing user.');
    }
});

// Analytics & Reports
router.get('/reports', async (req, res) => {
    try {
        // 1. Total revenue per city
        const [revenuePerCity] = await db.execute(`
            SELECT L.City, SUM(P.Amount) AS Total_Revenue
            FROM Payment P
            JOIN Ride R ON P.Ride_ID = R.Ride_ID
            JOIN Location L ON R.Pickup_ID = L.Location_ID
            WHERE P.Payment_Status = 'Paid'
            GROUP BY L.City
        `);

        // 2. Drivers below 3.5 rating
        const [lowRatedDrivers] = await db.execute(`
            SELECT r.Rated_User_ID AS Driver_ID, u.FullName, AVG(r.Score) AS Average_Rating
            FROM Rating r
            JOIN Driver d ON r.Rated_User_ID = d.Driver_ID
            JOIN Users u ON d.User_ID = u.User_ID
            WHERE r.Rated_By = 'Rider'
            GROUP BY r.Rated_User_ID, u.FullName
            HAVING AVG(r.Score) < 3.5
        `);

        // 3. Trips completed per driver
        const [tripsPerDriver] = await db.execute(`
            SELECT D.Driver_ID, U.FullName, COUNT(*) AS Total_Completed_Trips
            FROM Ride R
            JOIN Driver D ON R.Driver_ID = D.Driver_ID
            JOIN Users U ON D.User_ID = U.User_ID
            WHERE R.Ride_Status = 'Completed'
            GROUP BY D.Driver_ID, U.FullName
        `);

        // 4. Riders including those with no rides
        const [allRidersReport] = await db.execute(`
            SELECT U.FullName AS Rider_Name, R.Ride_ID, R.Ride_Status
            FROM Rider RD
            LEFT JOIN Ride R ON RD.Rider_ID = R.Rider_ID
            LEFT JOIN Users U ON RD.User_ID = U.User_ID
            ORDER BY U.FullName
        `);

        // 5. Payments and promo codes
        const [paymentsPromos] = await db.execute(`
            SELECT P.Payment_ID, P.Amount, P.Payment_Method, PC.Code AS Promo_Code, PC.Discount
            FROM Payment P
            LEFT JOIN Payment_Promo PP ON P.Payment_ID = PP.Payment_ID
            LEFT JOIN PromoCode PC ON PP.Promo_ID = PC.Promo_ID
            ORDER BY P.Payment_ID DESC
        `);

        // 6. Drivers in city ordered by rating
        const [driversByCity] = await db.execute(`
            SELECT D.Driver_ID, U.FullName AS Driver_Name, D.Avg_Rating, D.Total_Trips, L.City
            FROM Driver D
            JOIN Users U ON D.User_ID = U.User_ID
            JOIN Ride R ON D.Driver_ID = R.Driver_ID
            JOIN Location L ON R.Pickup_ID = L.Location_ID
            WHERE L.City = 'Islamabad'
            GROUP BY D.Driver_ID, U.FullName, D.Avg_Rating, D.Total_Trips, L.City
            ORDER BY D.Avg_Rating DESC
        `);

        // 7. Full report
        const [fullReport] = await db.execute(`
            SELECT R.Ride_ID, RU.FullName AS Rider_Name, DU.FullName AS Driver_Name, 
                   V.Make, V.Model, V.Vehicle_Type, R.Fare, R.Distance_KM, 
                   R.Duration_Minutes, R.Ride_Status, R.Request_Time
            FROM Ride R
            INNER JOIN Rider RR ON R.Rider_ID = RR.Rider_ID
            INNER JOIN Users RU ON RR.User_ID = RU.User_ID
            INNER JOIN Driver D ON R.Driver_ID = D.Driver_ID
            INNER JOIN Users DU ON D.User_ID = DU.User_ID
            INNER JOIN Vehicle V ON R.Vehicle_ID = V.Vehicle_ID
            ORDER BY R.Request_Time DESC
        `);

        // 8. Active Rides View
        const [activeRidesView] = await db.execute('SELECT * FROM ActiveRidesView ORDER BY Request_Time DESC');

        // 9. Top Drivers View
        const [topDriversView] = await db.execute('SELECT * FROM TopDriversView ORDER BY Avg_Rating DESC');

        res.render('admin/reports', {
            user: req.session.user,
            revenuePerCity,
            lowRatedDrivers,
            tripsPerDriver,
            allRidersReport,
            paymentsPromos,
            driversByCity,
            fullReport,
            activeRidesView,
            topDriversView
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error loading reports.');
    }
});

module.exports = router;
