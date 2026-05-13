const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkRole } = require('../middleware/auth');

router.use(checkRole('Driver'));

router.get('/', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;

        // Fetch Driver Info
        const [drivers] = await db.execute('SELECT Driver_ID, Verif_Status, Availability_Status, Avg_Rating, Total_Trips FROM Driver WHERE User_ID = ?', [userId]);
        if (drivers.length === 0) return res.send('Driver profile not found.');
        const driver = drivers[0];

        // Fetch Ride History
        const [history] = await db.execute(`
            SELECT r.Ride_ID, r.Ride_Status, r.Fare, r.Distance_KM, 
                   l1.City as PickupCity, l1.Street as PickupStreet,
                   l2.City as DropoffCity, l2.Street as DropoffStreet,
                   r.Request_Time
            FROM Ride r
            JOIN Location l1 ON r.Pickup_ID = l1.Location_ID
            JOIN Location l2 ON r.Dropoff_ID = l2.Location_ID
            WHERE r.Driver_ID = ?
            ORDER BY r.Request_Time DESC
        `, [driver.Driver_ID]);

        // Fetch Earnings
        const [earnings] = await db.execute(`
            SELECT SUM(p.Amount) as TotalEarnings 
            FROM Payment p 
            JOIN Ride r ON p.Ride_ID = r.Ride_ID 
            WHERE r.Driver_ID = ? AND p.Payment_Status = 'Paid'
        `, [driver.Driver_ID]);

        // Fetch Reviews
        const [reviews] = await db.execute(`
            SELECT r.Score, r.Comment, u.FullName as RiderName, r.Timestamp 
            FROM Rating r
            JOIN Ride rd ON r.Ride_ID = rd.Ride_ID
            JOIN Rider rider ON rd.Rider_ID = rider.Rider_ID
            JOIN Users u ON rider.User_ID = u.User_ID
            WHERE r.Rated_User_ID = ? AND r.Rated_By = 'Rider'
            ORDER BY r.Timestamp DESC
        `, [driver.Driver_ID]);

        // Fetch Pending Requests
        const [pendingRequests] = await db.execute(`
            SELECT r.Ride_ID, u.FullName as RiderName, r.Fare, r.Distance_KM, 
                   l1.City as PickupCity, l1.Street as PickupStreet,
                   l2.City as DropoffCity, l2.Street as DropoffStreet
            FROM Ride r
            JOIN Rider rider ON r.Rider_ID = rider.Rider_ID
            JOIN Users u ON rider.User_ID = u.User_ID
            JOIN Location l1 ON r.Pickup_ID = l1.Location_ID
            JOIN Location l2 ON r.Dropoff_ID = l2.Location_ID
            WHERE r.Driver_ID = ? AND r.Ride_Status = 'Requested'
        `, [driver.Driver_ID]);

        res.render('driver/dashboard', {
            user: req.session.user,
            driver,
            history,
            reviews,
            earnings: earnings[0].TotalEarnings || 0,
            pendingRequests
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Toggle availability status
router.post('/toggle-status', async (req, res) => {
    try {
        const userId = req.session.user.User_ID;
        const [drivers] = await db.execute('SELECT Driver_ID, Availability_Status FROM Driver WHERE User_ID = ?', [userId]);
        if (drivers.length === 0) return res.redirect('/driver');
        
        const newStatus = drivers[0].Availability_Status === 'Online' ? 'Offline' : 'Online';
        await db.execute('UPDATE Driver SET Availability_Status = ? WHERE Driver_ID = ?', [newStatus, drivers[0].Driver_ID]);
        
        res.redirect('/driver');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Accept Ride
router.post('/accept-ride/:rideId', async (req, res) => {
    try {
        const rideId = req.params.rideId;
        const userId = req.session.user.User_ID;

        // Get Driver ID
        const [drivers] = await db.execute('SELECT Driver_ID FROM Driver WHERE User_ID = ?', [userId]);
        const driverId = drivers[0].Driver_ID;

        // Update Ride status
        await db.execute("UPDATE Ride SET Ride_Status = 'Accepted' WHERE Ride_ID = ? AND Driver_ID = ?", [rideId, driverId]);
        
        // Update Driver status
        await db.execute("UPDATE Driver SET Availability_Status = 'On Trip' WHERE Driver_ID = ?", [driverId]);

        res.redirect('/driver');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while accepting ride.');
    }
});

// Cancel Ride
router.post('/cancel-ride/:rideId', async (req, res) => {
    try {
        const rideId = req.params.rideId;
        const userId = req.session.user.User_ID;

        // Get Driver ID
        const [drivers] = await db.execute('SELECT Driver_ID FROM Driver WHERE User_ID = ?', [userId]);
        const driverId = drivers[0].Driver_ID;

        // Update Ride status
        await db.execute("UPDATE Ride SET Ride_Status = 'Cancelled' WHERE Ride_ID = ? AND Driver_ID = ?", [rideId, driverId]);
        
        // Ensure Driver status is Online
        await db.execute("UPDATE Driver SET Availability_Status = 'Online' WHERE Driver_ID = ?", [driverId]);

        res.redirect('/driver');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error while cancelling ride.');
    }
});

module.exports = router;
