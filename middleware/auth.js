function checkRole(role) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/auth/login');
        }
        if (req.session.user.Role !== role) {
            return res.status(403).send('Forbidden: You do not have access to this page.');
        }
        next();
    };
}

module.exports = { checkRole };
