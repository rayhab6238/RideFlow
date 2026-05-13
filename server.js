const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session config
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if using HTTPS
}));

// Routes
const authRoutes = require('./routes/auth');
const riderRoutes = require('./routes/rider');
const driverRoutes = require('./routes/driver');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/rider', riderRoutes);
app.use('/driver', driverRoutes);
app.use('/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect(`/${req.session.user.Role.toLowerCase()}`);
    }
    res.redirect('/auth/login');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
