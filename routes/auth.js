const express = require('express');
const router = express.Router();
const db = require('../db');

// Show login form
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Process login
router.post('/login', async (req, res) => {
    const { email_or_phone, password } = req.body;
    
    try {
        // Finding the user by email or phone. In a real system we'd handle this more robustly
        // We assume the user enters Phone Number for now since db_insertion has them
        // Alternatively, we can search by User_ID if it's simpler, but we do a JOIN on Phone or Email
        const [users] = await db.execute(`
            SELECT u.* 
            FROM Users u
            LEFT JOIN User_Phone p ON u.User_ID = p.User_ID
            LEFT JOIN User_Email e ON u.User_ID = e.User_ID
            WHERE (p.Phone_Number = ? OR e.Email = ?)
        `, [email_or_phone, email_or_phone]);

        if (users.length === 0) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        const user = users[0];

        // Check password (plain text match based on db_insertion.sql 'hash1' etc.)
        if (user.Password_Hash !== password) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        if (user.Account_Status !== 'Active') {
            return res.render('login', { error: 'Account is suspended or banned.' });
        }

        // Set session
        req.session.user = {
            User_ID: user.User_ID,
            FullName: user.FullName,
            Role: user.Role
        };

        // Redirect based on role
        res.redirect(`/${user.Role.toLowerCase()}`);

    } catch (err) {
        console.error(err);
        res.render('login', { error: 'A server error occurred.' });
    }
});

// Show register form
router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Process registration
router.post('/register', async (req, res) => {
    const { role, fullname, email, phone, password, cnic, license } = req.body;
    
    // We allow Rider, Driver, or Admin registration
    if (role !== 'Rider' && role !== 'Driver' && role !== 'Admin') {
        return res.render('register', { error: 'Invalid role selected.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check if phone or email already exists
        const [existingPhone] = await connection.execute('SELECT Phone_ID FROM User_Phone WHERE Phone_Number = ?', [phone]);
        if (existingPhone.length > 0) throw new Error('Phone number already in use.');

        const [existingEmail] = await connection.execute('SELECT Email_ID FROM User_Email WHERE Email = ?', [email]);
        if (existingEmail.length > 0) throw new Error('Email already in use.');

        // Insert into Users table
        const [userResult] = await connection.execute(
            'INSERT INTO Users (FullName, Password_Hash, Role) VALUES (?, ?, ?)',
            [fullname, password, role]
        );
        const newUserId = userResult.insertId;

        // Insert into User_Phone and User_Email
        await connection.execute('INSERT INTO User_Phone (User_ID, Phone_Number) VALUES (?, ?)', [newUserId, phone]);
        await connection.execute('INSERT INTO User_Email (User_ID, Email) VALUES (?, ?)', [newUserId, email]);

        // Insert into specific role tables
        if (role === 'Rider') {
            await connection.execute('INSERT INTO Rider (User_ID) VALUES (?)', [newUserId]);
        } else if (role === 'Driver') {
            // Check for unique CNIC and License
            const [existingDriver] = await connection.execute('SELECT Driver_ID FROM Driver WHERE CNIC = ? OR License_Number = ?', [cnic, license]);
            if (existingDriver.length > 0) throw new Error('CNIC or License Number already in use.');

            await connection.execute(
                "INSERT INTO Driver (User_ID, CNIC, License_Number, Verif_Status, Availability_Status) VALUES (?, ?, ?, 'Pending', 'Offline')",
                [newUserId, cnic, license]
            );
        }

        await connection.commit();
        res.redirect('/auth/login'); // Redirect to login on success

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.render('register', { error: err.message || 'Registration failed due to a server error.' });
    } finally {
        connection.release();
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;
